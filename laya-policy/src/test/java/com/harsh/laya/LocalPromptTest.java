package com.harsh.laya;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class LocalPromptTest {
    @Test public void pauseAndResumeKeepTopicsAndPreviousPreference() throws Exception {
        JSONObject original = new JSONObject().put("enabled", true)
                .put("topics", new JSONArray().put("Education")).put("prompt", "Education only");
        JSONObject paused = LocalPrompt.apply("Please disable filters.", original);
        assertFalse(paused.getBoolean("enabled"));
        assertTrue(original.getBoolean("enabled"));
        assertEquals("Education", paused.getJSONArray("topics").getString(0));
        assertEquals("Education only", paused.getString("prompt"));
        assertTrue(LocalPrompt.apply("Resume filtering!", paused).getBoolean("enabled"));
    }

    @Test public void multipleControlsAreAppliedTogether() throws Exception {
        JSONObject p = LocalPrompt.apply("Enable filters and hide spam; allow abuse", new JSONObject());
        assertTrue(p.getBoolean("enabled"));
        assertTrue(p.getBoolean("spam"));
        assertFalse(p.getBoolean("abuse"));
    }

    @Test public void ambiguousOrNegatedCommandsNeedTheService() {
        for (String text : new String[]{"Do not disable filters", "Can you disable filters?",
                "Hide spam except from teachers", "Education only", "", "and disable filters"}) {
            assertNull(text, LocalPrompt.apply(text, new JSONObject()));
        }
    }

    @Test public void anUnknownClauseDoesNotPartiallyChangeThePolicy() throws Exception {
        JSONObject p = new JSONObject().put("enabled", true);
        assertNull(LocalPrompt.apply("Disable filters and only programming", p));
        assertTrue(p.getBoolean("enabled"));
    }

    @Test public void pausingStillLeavesTheExplicitMetadataSafetyRule() throws Exception {
        JSONObject p = LocalPrompt.apply("Turn filters off", new JSONObject());
        assertNotNull(LocalPolicy.reason("p0rn", "", p));
        assertNull(LocalPolicy.reason("f*ck", "", p));
    }
}
