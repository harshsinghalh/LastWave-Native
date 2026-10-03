package com.harsh.laya;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServiceReadinessTest {
    @Test public void bothModelsMustBeLoaded() throws Exception {
        JSONObject body = new JSONObject().put("ready", true).put("engine", "laya")
                .put("models", new JSONArray().put("multilingual").put("english"));
        assertTrue(ServiceReadiness.isReady(body));
        body.put("models", new JSONArray().put("english"));
        assertFalse(ServiceReadiness.isReady(body));
    }

    @Test public void aDifferentServiceOrUnavailableWeightsCannotPass() throws Exception {
        JSONObject body = new JSONObject().put("ready", true).put("engine", "other")
                .put("models", new JSONArray().put("english").put("multilingual"));
        assertFalse(ServiceReadiness.isReady(body));
        body.put("engine", "laya").put("ready", false);
        assertFalse(ServiceReadiness.isReady(body));
    }

    @Test public void missingOrMalformedModelListFails() throws Exception {
        assertFalse(ServiceReadiness.isReady(null));
        assertFalse(ServiceReadiness.isReady(new JSONObject()));
        assertFalse(ServiceReadiness.isReady(new JSONObject().put("ready", true)
                .put("engine", "laya").put("models", "english,multilingual")));
    }
}
