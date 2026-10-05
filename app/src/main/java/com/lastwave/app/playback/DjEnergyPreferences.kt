package com.lastwave.app.playback

import android.content.Context

enum class DjHighlightFocus { ENERGY, BEATS, VOCALS }
enum class DjHighlightSpacing { OCCASIONAL, RARE }

/** One automatic preset. No saved cue, mode picker, or model setup is required. */
data class DjEnergyProfile(
    val enabled: Boolean = false,
    val rampMs: Long = 1_500,
    val before: Float = .70f,
    val after: Float = .80f,
    val energyDb: Float = 2f,
    val vocalsDb: Float = 2f,
    val beatsDb: Float = 3f,
    val focus: DjHighlightFocus = DjHighlightFocus.ENERGY,
    val spacing: DjHighlightSpacing = DjHighlightSpacing.OCCASIONAL,
    val layaThreshold: Float = .40f,
)

object DjEnergyPreferences {
    // Retain the old preference file solely to migrate the enabled flag.
    private fun prefs(context: Context) = context.getSharedPreferences("lastwave_dj_cue", Context.MODE_PRIVATE)
    fun read(context: Context) = DjEnergyProfile(enabled = prefs(context).getBoolean("enabled", false))

    fun setEnabled(context: Context, enabled: Boolean) {
        val edit = prefs(context).edit().putBoolean("enabled", enabled).putInt("revision", 3)
        for (key in listOf("cue", "mode", "ramp", "before", "after", "energy", "vocals", "beats",
            "focus", "spacing", "laya_threshold")) edit.remove(key)
        edit.apply()
    }
}
