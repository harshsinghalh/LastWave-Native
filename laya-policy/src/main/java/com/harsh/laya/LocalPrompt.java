package com.harsh.laya;

import java.util.Locale;
import org.json.JSONObject;

/** Exact control commands work offline; free-form preferences still use Laya. */
public final class LocalPrompt {
    private LocalPrompt() {}

    /** Returns a new policy, or null when any clause needs semantic interpretation. */
    public static JSONObject apply(String prompt, JSONObject current) {
        if (prompt == null || prompt.isBlank()) return null;
        String text = prompt.trim().toLowerCase(Locale.ROOT).replaceAll("[.!]+$", "");
        String[] clauses = text.split("\\s*(?:[.;]|\\band\\b)\\s*");
        try {
            JSONObject result = new JSONObject(current.toString());
            for (String clause : clauses) {
                clause = clause.trim().replaceFirst("^please\\s+", "");
                switch (clause) {
                    case "disable filters": case "turn filters off": case "pause filtering":
                        result.put("enabled", false); break;
                    case "enable filters": case "turn filters on": case "resume filtering":
                        result.put("enabled", true); break;
                    case "hide spam": case "block spam":
                        result.put("spam", true); break;
                    case "show spam": case "allow spam":
                        result.put("spam", false); break;
                    case "hide abusive language": case "block abusive language": case "hide abuse":
                        result.put("abuse", true); break;
                    case "show abusive language": case "allow abusive language": case "allow abuse":
                        result.put("abuse", false); break;
                    default: return null;
                }
            }
            // A control command does not erase a previously saved semantic preference.
            return result;
        } catch (Exception invalidPolicy) {
            throw new IllegalArgumentException("Could not update the saved preferences", invalidPolicy);
        }
    }
}
