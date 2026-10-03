package com.harsh.laya;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONObject;
import org.json.JSONArray;
import java.util.Locale;

/** The sole persisted policy, shared by both native engines. Never stores media or account tokens. */
public final class PolicyStore {
    private static volatile PolicyStore instance;
    private final SharedPreferences prefs;
    private PolicyStore(Context context) { prefs=context.getApplicationContext().getSharedPreferences("laya_policy",Context.MODE_PRIVATE); }
    public static PolicyStore get(Context context) {
        if(instance==null) synchronized(PolicyStore.class) { if(instance==null) instance=new PolicyStore(context); }
        return instance;
    }
    public SharedPreferences preferences() { return prefs; }
    public JSONObject snapshot() {
        try {
            JSONObject p=new JSONObject(prefs.getString("policy","{}"));
            if(!p.has("enabled")) p.put("enabled",true);
            if(!p.has("abuse")) p.put("abuse",true);
            if(!p.has("spam")) p.put("spam",false);
            if(!p.has("mode")) p.put("mode","ANY");
            for(String key:new String[]{"topics","include","exclude","allowedCreators","excludedCreators"})
                if(!p.has(key)) p.put(key,new JSONArray());
            if(!p.has("prompt")) p.put("prompt","");
            return p;
        } catch(Exception e) { return new JSONObject(); }
    }
    public void save(JSONObject policy) { prefs.edit().putString("policy",policy.toString()).apply(); }
    public String endpoint() { return prefs.getString("endpoint",""); }
    public void setEndpoint(String url) {
        String normalized=ServiceAddress.normalize(url);
        SharedPreferences.Editor edit=prefs.edit().putString("endpoint",normalized);
        if(!normalized.equals(endpoint())) edit.remove("status");
        edit.apply();
    }
    public boolean consent() { return prefs.getBoolean("remote_consent",false); }
    public void setConsent(boolean value) { prefs.edit().putBoolean("remote_consent",value).apply(); }
    public String status() { if(endpoint().isBlank()||!consent()) return "Local rules active. Connect Laya and allow metadata processing for semantic filtering."; return prefs.getString("status","Laya service not connected. Local rules are active."); }
    public void status(String message) { prefs.edit().putString("status",message).apply(); }
}
