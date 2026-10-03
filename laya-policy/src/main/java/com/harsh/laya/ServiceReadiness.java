package com.harsh.laya;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/** A reachable web server is not sufficient: both expected Laya models must be ready. */
public final class ServiceReadiness {
    private ServiceReadiness() {}

    public static boolean isReady(JSONObject body) {
        if (body == null || !body.optBoolean("ready") || !"laya".equals(body.optString("engine"))) return false;
        JSONArray models = body.optJSONArray("models");
        Set<String> loaded = new HashSet<>();
        if (models != null) for (int i = 0; i < models.length(); i++) loaded.add(models.optString(i));
        return loaded.contains("english") && loaded.contains("multilingual");
    }
}
