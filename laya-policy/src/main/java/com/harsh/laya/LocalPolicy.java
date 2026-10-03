package com.harsh.laya;

import org.json.JSONObject;
import org.json.JSONArray;
import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

/** Explicit local rules, never presented as model inference or factual verification. */
public final class LocalPolicy {
    private static final Pattern ABUSE=Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(?:f[u*]{1,3}[c*]k|b[i*]tch|ch[u*]{1,3}[t*][i*]y[a*]|m[a*@]d[a*@]r(?:chod)?|fuck|fucking|bitch|चूतिया|मादरचोद|बहनचोद)(?![\\p{L}\\p{N}])");
    private static final Pattern EXPLICIT=Pattern.compile("(?iu)(?<![\\p{L}\\p{N}])(?:p[o0*]rn(?:ography|ographic)?|xxx|n[u*]des|onlyfans|live\\s+sex\\s+cam)(?![\\p{L}\\p{N}])");
    private static final Pattern EDUCATIONAL=Pattern.compile("(?iu)\\b(?:medical|biology|education|health|anatomy|prevention|awareness|sexual health)\\b");
    public static String normalized(String input) {
        return Normalizer.normalize(input==null?"":input,Normalizer.Form.NFKC).replaceAll("[\\p{Cf}]","").toLowerCase(Locale.ROOT);
    }
    public static String reason(String title,String creator,JSONObject p) {
        String text=normalized(title);
        if(EXPLICIT.matcher(text).find()&&!EDUCATIONAL.matcher(text).find()) return "Explicit metadata";
        if(!p.optBoolean("enabled",true)) return null;
        if(p.optBoolean("abuse",true)&&ABUSE.matcher(text).find()) return "Abusive language in metadata";
        if(matches(p.optJSONArray("excludedCreators"),creator)) return "Excluded creator";
        if(matches(p.optJSONArray("exclude"),title)) return "Excluded phrase";
        JSONArray include=p.optJSONArray("include");
        if(!allowedCreator(creator,p)&&include!=null&&include.length()>0&&!matches(include,title)) return "No required phrase matched";
        return null;
    }
    public static boolean allowedCreator(String creator,JSONObject p) { return matches(p.optJSONArray("allowedCreators"),creator); }
    public static boolean matches(JSONArray terms,String text) {
        if(terms==null) return false;
        String n=normalized(text);
        for(int i=0;i<terms.length();i++) {
            String term=normalized(terms.optString(i)).trim();
            if(!term.isEmpty()&&Pattern.compile("(?<![\\p{L}\\p{N}])"+Pattern.quote(term)+"(?![\\p{L}\\p{N}])").matcher(n).find()) return true;
        }
        return false;
    }
}
