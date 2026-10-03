package com.harsh.laya;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.*;
import okhttp3.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

/** One bounded inference queue. All HTTP and decisions run away from the UI thread. */
public final class LayaClient {
    public static final class Decision {
        public final boolean hidden;
        public final String reason;
        public final String engine;
        public Decision(boolean hidden,String reason,String engine) { this.hidden=hidden;this.reason=reason;this.engine=engine; }
    }
    public interface Callback { void complete(Decision result); }
    private static volatile LayaClient instance;
    private final PolicyStore store;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor queue=new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,new ArrayBlockingQueue<>(96),new ThreadPoolExecutor.AbortPolicy());
    private final OkHttpClient http=new OkHttpClient.Builder().connectTimeout(4,TimeUnit.SECONDS).readTimeout(12,TimeUnit.SECONDS).callTimeout(16,TimeUnit.SECONDS).build();
    private final Map<String,Decision> cache=Collections.synchronizedMap(new LinkedHashMap<String,Decision>(128,0.75f,true) {
        protected boolean removeEldestEntry(Map.Entry<String,Decision> e) { return size()>512; }
    });
    private final Set<String> revealed=Collections.synchronizedSet(new HashSet<>());
    private final AtomicLong revision=new AtomicLong();
    private LayaClient(Context context) {
        store=PolicyStore.get(context);
        store.preferences().registerOnSharedPreferenceChangeListener(listener);
    }
    private final android.content.SharedPreferences.OnSharedPreferenceChangeListener listener=(prefs,key)-> {
        if(!"status".equals(key)) { revision.incrementAndGet();cache.clear();revealed.clear(); }
    };
    public static LayaClient get(Context context) {
        if(instance==null) synchronized(LayaClient.class) { if(instance==null) instance=new LayaClient(context.getApplicationContext()); }
        return instance;
    }
    public void reveal(String id) { revealed.add(id); }
    public void undoReveal(String id) { revealed.remove(id); }
    public Decision local(String id,String text,String creator) {
        if(revealed.contains(id)) return new Decision(false,"Revealed for this session","user");
        String reason=LocalPolicy.reason(text,creator,store.snapshot());
        return new Decision(reason!=null,reason==null?"No explicit local rule matched":reason,"local rules");
    }
    public Decision initial(String id,String text,String creator,String kind) {
        Decision decision=local(id,text,creator);
        if(decision.hidden||revealed.contains(id)||!store.consent()||store.endpoint().isBlank()) return decision;
        Decision cached=cache.get(revision.get()+":"+id+":"+text+":"+creator+":"+kind);
        return cached!=null?cached:new Decision(true,"Checking your feed preferences…","pending");
    }
    public void evaluate(String id,String text,String creator,String kind,Callback callback) {
        Decision local=local(id,text,creator);
        if(local.hidden || revealed.contains(id) || !store.consent() || store.endpoint().isBlank()) {
            main.post(()->callback.complete(local)); return;
        }
        long version=revision.get();
        String key=version+":"+id+":"+text+":"+creator+":"+kind;
        Decision hit=cache.get(key);
        if(hit!=null) { main.post(()->callback.complete(hit));return; }
        Runnable job=()-> {
            Decision result;
            try {
                JSONObject item=new JSONObject().put("id",id).put("text",text==null?"":text).put("creator",creator==null?"":creator).put("kind",kind);
                JSONObject payload=new JSONObject().put("policy",store.snapshot()).put("items",new JSONArray().put(item));
                JSONObject body=post("/v1/evaluate",payload);
                JSONObject first=body.getJSONArray("decisions").getJSONObject(0);
                result=new Decision(first.getBoolean("hidden"),first.getString("reason"),first.getString("engine"));
                cache.put(key,result);
                store.status("Laya connected • metadata decisions");
            } catch(Exception error) {
                result=new Decision(false,"Laya unavailable; only local rules checked","local rules");
                store.status("Laya unavailable. Local rules remain active.");
            }
            Decision finalResult=result;
            main.post(()-> { if(version==revision.get()) callback.complete(revealed.contains(id)?new Decision(false,"Revealed for this session","user"):finalResult); });
        };
        try { queue.execute(job); } catch(RejectedExecutionException full) { main.post(()->callback.complete(new Decision(false,"Inference queue busy; only local rules checked","local rules"))); }
    }
    public JSONObject post(String path,JSONObject payload) throws Exception {
        if(!store.consent()||store.endpoint().isBlank()) throw new IllegalStateException("Connect your Laya service and allow metadata processing first");
        Request request=new Request.Builder().url(store.endpoint()+path).post(RequestBody.create(payload.toString(),MediaType.get("application/json"))).build();
        try(Response response=http.newCall(request).execute()) {
            if(!response.isSuccessful()||response.body()==null) throw new java.io.IOException("Laya service response "+response.code());
            return new JSONObject(response.body().string());
        }
    }
}
