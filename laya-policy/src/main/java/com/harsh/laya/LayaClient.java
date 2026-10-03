package com.harsh.laya;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONArray;
import org.json.JSONObject;
import okhttp3.*;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;

/** One bounded inference queue. All HTTP and decisions run away from the UI thread. */
public final class LayaClient {
    public static final class Decision {
        public final boolean hidden;
        public final String reason;
        public final String engine;
        public Decision(boolean hidden, String reason, String engine) {
            this.hidden=hidden; this.reason=reason; this.engine=engine;
        }
    }
    public interface Callback { void complete(Decision result); }
    private static volatile LayaClient instance;
    private final PolicyStore store;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor queue;
    private final OkHttpClient http;
    private final Map<Call,PolicyStore.RequestState> metadataCalls=new HashMap<>();
    private static final class CachedDecision {
        final Decision decision;
        final long validUntil;
        CachedDecision(Decision decision, long validUntil) { this.decision=decision; this.validUntil=validUntil; }
    }
    private final Map<String,CachedDecision> cache=Collections.synchronizedMap(new LinkedHashMap<String,CachedDecision>(128,0.75f,true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String,CachedDecision> entry) { return size()>512; }
    });
    private final Map<String,String> revealed=Collections.synchronizedMap(new LinkedHashMap<String,String>(128,0.75f,true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String,String> entry) { return size()>512; }
    });
    private final SharedPreferences.OnSharedPreferenceChangeListener listener=(prefs,key)-> {
        if(!"status".equals(key)) invalidateOldRequests();
    };

    private LayaClient(Context context) {
        this(PolicyStore.get(context),new OkHttpClient.Builder()
                .connectTimeout(4,TimeUnit.SECONDS).readTimeout(12,TimeUnit.SECONDS)
                .callTimeout(16,TimeUnit.SECONDS).build(),
                new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(96),new ThreadPoolExecutor.AbortPolicy()));
    }
    // Package-visible dependencies permit real HTTPS and preference tests without changing app trust.
    LayaClient(PolicyStore store, OkHttpClient http, ThreadPoolExecutor queue) {
        this.store=store; this.queue=queue;
        this.http=http.newBuilder().followRedirects(false).followSslRedirects(false).build();
        store.preferences().registerOnSharedPreferenceChangeListener(listener);
    }
    public static LayaClient get(Context context) {
        if(instance==null) synchronized(LayaClient.class) {
            if(instance==null) instance=new LayaClient(context.getApplicationContext());
        }
        return instance;
    }
    private void invalidateOldRequests() {
        synchronized(metadataCalls) {
            for(Map.Entry<Call,PolicyStore.RequestState> entry:metadataCalls.entrySet())
                if(!store.matches(entry.getValue())) entry.getKey().cancel();
        }
        // A UI listener may already have queued the new policy. Keep those checks regardless of listener order.
        queue.getQueue().removeIf(job->job instanceof Check && !store.matches(((Check)job).state));
    }
    public void reveal(String id) { revealed.put(id,store.requestState().key); }
    public void undoReveal(String id) { revealed.remove(id); }
    private boolean isRevealed(String id, PolicyStore.RequestState state) { return state.key.equals(revealed.get(id)); }
    private static Decision revealedDecision() { return new Decision(false,"Revealed for this session","user"); }
    private Decision cached(String key) {
        CachedDecision hit=cache.get(key);
        if(hit!=null && hit.validUntil>System.currentTimeMillis()) return hit.decision;
        if(hit!=null) cache.remove(key);
        return null;
    }
    private Decision local(String id, String text, String creator, PolicyStore.RequestState state) {
        if(isRevealed(id,state)) return revealedDecision();
        String reason=LocalPolicy.reason(text,creator,state.policy());
        return new Decision(reason!=null,reason==null?"No explicit local rule matched":reason,"local rules");
    }
    public Decision local(String id, String text, String creator) { return local(id,text,creator,store.requestState()); }
    private static JSONObject item(String id, String text, String creator, String kind) {
        try {
            return new JSONObject().put("id",id).put("text",text==null?"":text)
                    .put("creator",creator==null?"":creator).put("kind",kind);
        } catch(Exception invalid) { throw new IllegalArgumentException("Invalid content metadata",invalid); }
    }
    public Decision initial(String id, String text, String creator, String kind) {
        PolicyStore.RequestState state=store.requestState();
        Decision decision=local(id,text,creator,state);
        if(decision.hidden||isRevealed(id,state)||!state.consent||state.endpoint.isBlank()) return decision;
        Decision hit=cached(state.key+"\n"+item(id,text,creator,kind));
        return hit!=null?hit:new Decision(true,"Checking your feed preferences…","pending");
    }
    private void deliver(PolicyStore.RequestState state, String id, Decision decision, Callback callback) {
        main.post(()-> {
            if(store.matches(state)) callback.complete(isRevealed(id,state)?revealedDecision():decision);
        });
    }
    public void evaluate(String id, String text, String creator, String kind, Callback callback) {
        PolicyStore.RequestState state=store.requestState();
        Decision local=local(id,text,creator,state);
        if(local.hidden||isRevealed(id,state)||!state.consent||state.endpoint.isBlank()) {
            deliver(state,id,local,callback); return;
        }
        Check check=new Check(state,id,item(id,text,creator,kind),callback);
        Decision hit=cached(check.key);
        if(hit!=null) { deliver(state,id,hit,callback); return; }
        try { queue.execute(check); }
        catch(RejectedExecutionException full) {
            deliver(state,id,new Decision(false,"Inference queue busy; only local rules checked","local rules"),callback);
        }
    }
    private final class Check implements Runnable {
        final PolicyStore.RequestState state;
        final String id;
        final JSONObject item;
        final String key;
        final Callback callback;
        Check(PolicyStore.RequestState state, String id, JSONObject item, Callback callback) {
            this.state=state; this.id=id; this.item=item; this.callback=callback;
            key=state.key+"\n"+item;
        }
        @Override public void run() {
            if(!store.matches(state)) return;
            Decision result;
            try {
                JSONObject payload=new JSONObject().put("policy",state.policy()).put("items",new JSONArray().put(item));
                JSONObject body=post("/v1/evaluate",payload,state);
                JSONArray decisions=body.getJSONArray("decisions");
                if(decisions.length()!=1) throw new IOException("Unexpected Laya decision count");
                JSONObject first=decisions.getJSONObject(0);
                if(!id.equals(first.getString("id"))) throw new IOException("Laya decision belongs to different content");
                result=new Decision(first.getBoolean("hidden"),first.getString("reason"),first.getString("engine"));
                long validUntil=System.currentTimeMillis()+TimeUnit.MINUTES.toMillis(5);
                if("evidence".equals(result.engine)) {
                    double expires=first.getDouble("expires");
                    if(!Double.isFinite(expires)||expires*1000<=System.currentTimeMillis())
                        throw new IOException("Laya evidence decision expired");
                    validUntil=Math.min(validUntil,(long)(expires*1000));
                }
                if(store.matches(state)) cache.put(key,new CachedDecision(result,validUntil));
                store.statusIfCurrent(state,"Laya connected • metadata decisions");
            } catch(Exception error) {
                result=new Decision(false,"Laya unavailable; only local rules checked","local rules");
                store.statusIfCurrent(state,"Laya unavailable. Local rules remain active.");
            }
            deliver(state,id,result,callback);
        }
    }
    /** Readiness sends no video, comment or prompt metadata and does not require metadata consent. */
    public void checkConnection() throws Exception {
        String endpoint=store.endpoint();
        if(endpoint.isBlank()) throw new IllegalStateException("Enter your Laya HTTPS address first");
        Request request=new Request.Builder().url(ServiceAddress.normalize(endpoint)+"/healthz").get().build();
        try(Response response=http.newCall(request).execute()) {
            if(!response.isSuccessful()||response.body()==null) throw new IOException("Laya readiness response "+response.code());
            if(!ServiceReadiness.isReady(new JSONObject(response.body().string())))
                throw new IOException("The address did not confirm a ready Laya service");
            if(!endpoint.equals(store.endpoint())) throw new IOException("Connection changed; check the new address");
        }
    }
    public JSONObject compilePrompt(String prompt, PolicyStore.RequestState state) throws Exception {
        return post("/v1/policy/compile",new JSONObject().put("prompt",prompt).put("policy",state.policy()),state);
    }
    private JSONObject post(String path, JSONObject payload, PolicyStore.RequestState state) throws Exception {
        if(!state.consent||state.endpoint.isBlank()) throw new IllegalStateException("Connect your Laya service and allow metadata processing first");
        Request request=new Request.Builder().url(ServiceAddress.normalize(state.endpoint)+path)
                .post(RequestBody.create(payload.toString(),MediaType.get("application/json"))).build();
        Call call=http.newCall(request);
        synchronized(metadataCalls) {
            if(!store.matches(state)) throw new IOException("Preferences changed; apply your prompt again");
            metadataCalls.put(call,state);
        }
        try(Response response=call.execute()) {
            if(!response.isSuccessful()||response.body()==null) throw new IOException("Laya service response "+response.code());
            JSONObject body=new JSONObject(response.body().string());
            if(!store.matches(state)) throw new IOException("Preferences changed; apply your prompt again");
            return body;
        } catch(IOException error) {
            if(!store.matches(state)) throw new IOException("Preferences changed; apply your prompt again");
            throw error;
        } finally { synchronized(metadataCalls) { metadataCalls.remove(call); } }
    }
    void close() {
        store.preferences().unregisterOnSharedPreferenceChangeListener(listener);
        synchronized(metadataCalls) { for(Call call:metadataCalls.keySet()) call.cancel(); }
        queue.shutdownNow();
    }
}
