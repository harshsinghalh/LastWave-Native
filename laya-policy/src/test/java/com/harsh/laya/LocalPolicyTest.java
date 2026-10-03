package com.harsh.laya;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;

public class LocalPolicyTest {
    @Test public void obfuscationAndBenignWords() throws Exception {
        JSONObject p=new JSONObject().put("enabled",true).put("abuse",true);
        for(String text:new String[]{"f*ck","b*tch","ch**iya","मादरचोद","f\u200buck"}) assertNotNull(LocalPolicy.reason(text,"",p));
        for(String text:new String[]{"class","document","assume","mass","madam","medical sexual health education","Criticism of India's government"}) assertNull(LocalPolicy.reason(text,"",p));
    }
    @Test public void exclusionWinsAndUsesWholeWords() throws Exception {
        JSONObject p=new JSONObject().put("enabled",true).put("allowedCreators",new JSONArray().put("Creator")).put("excludedCreators",new JSONArray().put("Creator")).put("exclude",new JSONArray().put("war"));
        assertEquals("Excluded creator",LocalPolicy.reason("Science","Creator",p));
        assertNull(LocalPolicy.reason("hardware course","Other",p));
        assertEquals("Excluded phrase",LocalPolicy.reason("war news","Other",p));
    }
    @Test public void permanentMetadataSafetySurvivesPause() throws Exception {
        assertNotNull(LocalPolicy.reason("p0rn","",new JSONObject().put("enabled",false)));
        assertNull(LocalPolicy.reason("f*ck","",new JSONObject().put("enabled",false)));
    }
    @Test public void canonicalUnicodeAndZeroWidthNormalize() {
        assertEquals("python",LocalPolicy.normalized("ＰＹ\u200bＴＨＯＮ"));
    }
    @Test public void requiredPhrasesWorkWithoutServiceAndAllowedCreatorsBypassThem() throws Exception {
        JSONObject p=new JSONObject().put("include",new JSONArray().put("python"))
            .put("allowedCreators",new JSONArray().put("Teacher"));
        assertEquals("No required phrase matched",LocalPolicy.reason("News","Someone",p));
        assertNull(LocalPolicy.reason("Python tutorial","Someone",p));
        assertNull(LocalPolicy.reason("Other course","Teacher",p));
        assertNotNull(LocalPolicy.reason("f*ck","Teacher",p));
    }
}
