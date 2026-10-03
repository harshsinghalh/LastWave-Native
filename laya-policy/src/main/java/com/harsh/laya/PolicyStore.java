package com.harsh.laya;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.Map;

/** The sole persisted policy, shared by both native engines. Never stores media or account tokens. */
public final class PolicyStore {
    private static volatile PolicyStore instance;
    private final SharedPreferences prefs;
    PolicyStore(Context context) { prefs=context.getApplicationContext().getSharedPreferences("laya_policy",Context.MODE_PRIVATE); }
    public static PolicyStore get(Context context) {
        if(instance==null) synchronized(PolicyStore.class) { if(instance==null) instance=new PolicyStore(context); }
        return instance;
    }
    public SharedPreferences preferences() { return prefs; }
    private static JSONObject parsePolicy(String raw) {
        try {
            JSONObject p=new JSONObject(raw);
            if(!p.has("enabled")) p.put("enabled",true);
            if(!p.has("abuse")) p.put("abuse",true);
            if(!p.has("spam")) p.put("spam",false);
            if(!p.has("mode")) p.put("mode","ANY");
            for(String key:new String[]{"topics","include","exclude","allowedCreators","excludedCreators"})
                if(!p.has(key)) p.put(key,new JSONArray());
            if(!p.has("prompt")) p.put("prompt","");
            return p;
        } catch(Exception e) { return parsePolicy("{}"); }
    }
    /** Immutable identity for the exact policy, destination and consent used by a request. */
    public static final class RequestState {
        final String policyJson;
        final String endpoint;
        final boolean consent;
        final String key;
        private RequestState(String policyJson, String endpoint, boolean consent) {
            this.policyJson=policyJson;
            this.endpoint=endpoint;
            this.consent=consent;
            try {
                key=new JSONObject().put("policy",policyJson).put("endpoint",endpoint).put("consent",consent).toString();
            } catch(Exception invalid) { throw new IllegalStateException(invalid); }
        }
        public JSONObject policy() { return parsePolicy(policyJson); }
    }
    public RequestState requestState() {
        // getAll returns one preference snapshot, rather than mixing values from different edits.
        Map<String,?> values=prefs.getAll();
        return new RequestState(values.get("policy") instanceof String?(String)values.get("policy"):"{}",
                values.get("endpoint") instanceof String?(String)values.get("endpoint"):"",Boolean.TRUE.equals(values.get("remote_consent")));
    }
    boolean matches(RequestState state) { return state.key.equals(requestState().key); }
    public JSONObject snapshot() { return requestState().policy(); }
    public synchronized void save(JSONObject policy) { prefs.edit().putString("policy",policy.toString()).apply(); }
    /** A delayed prompt must not replace newer edits or a changed connection. */
    public synchronized boolean saveIfUnchanged(JSONObject policy, RequestState expected) {
        if(!matches(expected)) return false;
        save(policy);
        return true;
    }
    public String endpoint() { return prefs.getString("endpoint",""); }
    public synchronized void setEndpoint(String url) {
        String normalized=ServiceAddress.normalize(url);
        SharedPreferences.Editor edit=prefs.edit().putString("endpoint",normalized);
        if(!normalized.equals(endpoint())) edit.remove("status");
        edit.apply();
    }
    public boolean consent() { return prefs.getBoolean("remote_consent",false); }
    public synchronized void setConsent(boolean value) { prefs.edit().putBoolean("remote_consent",value).apply(); }
    public String status() { if(endpoint().isBlank()||!consent()) return "Local rules active. Connect Laya and allow metadata processing for semantic filtering."; return prefs.getString("status","Laya service not connected. Local rules are active."); }
    public void status(String message) { prefs.edit().putString("status",message).apply(); }
    synchronized void statusIfCurrent(RequestState state, String message) {
        if(matches(state)) status(message);
    }
}
