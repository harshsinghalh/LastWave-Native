package com.lastwave.app.playback

import android.content.Context

enum class DjCueMode { TIMED, HIGHLIGHTS, LAYA }
enum class DjHighlightFocus { ENERGY, BEATS, VOCALS }
enum class DjHighlightSpacing { OCCASIONAL, RARE }

/** Values are relative PCM amplitude, not perceived loudness or system volume. */
data class DjCueProfile(
    val enabled: Boolean = false,
    val cueMs: Long = 165_000,
    val rampMs: Long = 1_500,
    val before: Float = 0.70f,
    val after: Float = 0.80f,
    val energyDb: Float = 2f,
    val vocalsDb: Float = 2f,
    val beatsDb: Float = 3f,
    val mode: DjCueMode = DjCueMode.TIMED,
    val focus: DjHighlightFocus = DjHighlightFocus.ENERGY,
    val spacing: DjHighlightSpacing = DjHighlightSpacing.OCCASIONAL,
    val layaThreshold: Float = .55f,
) {
    fun mixAt(positionMs: Long, active: Boolean): FloatArray {
        if (!active || mode != DjCueMode.TIMED) return floatArrayOf(1f, 0f, 0f, 0f)
        // Cue marks the beginning of the transition. Seeking recomputes immediately.
        val fraction = ((positionMs - cueMs).toDouble() / rampMs.coerceAtLeast(1)).coerceIn(0.0, 1.0).toFloat()
        val smooth = fraction * fraction * (3f - 2f * fraction)
        return floatArrayOf(before + (after - before) * smooth, energyDb * smooth,
            vocalsDb * smooth, beatsDb * smooth)
    }
}

object DjCuePreferences {
    private fun prefs(context: Context) = context.getSharedPreferences("lastwave_dj_cue", Context.MODE_PRIVATE)
    fun read(context: Context): DjCueProfile {
        val p = prefs(context)
        fun safe(key: String, fallback: Float, max: Float): Float = p.getFloat(key, fallback)
            .let { if (it.isFinite()) it.coerceIn(0f, max) else fallback }
        // Upgrade the previous default pair while retaining edited timings/levels.
        val oldDefaults = p.getInt("revision", 1) < 2 && p.getLong("ramp", 2_000) == 2_000L &&
            p.getFloat("after", .9f) == .9f
        return DjCueProfile(p.getBoolean("enabled", false), p.getLong("cue", 165_000).coerceIn(0, 86_400_000),
            if (oldDefaults) 1_500L else p.getLong("ramp", 1_500).coerceIn(100, 30_000),
            safe("before", .7f, 1f), if (oldDefaults) .8f else safe("after", .8f, 1f),
            safe("energy", 2f, 6f), safe("vocals", 2f, 6f), safe("beats", 3f, 6f),
            DjCueMode.entries.getOrNull(p.getInt("mode", 0)) ?: DjCueMode.TIMED,
            DjHighlightFocus.entries.getOrNull(p.getInt("focus", 0)) ?: DjHighlightFocus.ENERGY,
            DjHighlightSpacing.entries.getOrNull(p.getInt("spacing", 0)) ?: DjHighlightSpacing.OCCASIONAL,
            safe("laya_threshold", .55f, .95f).coerceAtLeast(.4f))
    }
    fun save(context: Context, value: DjCueProfile) {
        prefs(context).edit().putBoolean("enabled", value.enabled).putLong("cue", value.cueMs)
            .putLong("ramp", value.rampMs).putFloat("before", value.before).putFloat("after", value.after)
            .putFloat("energy", value.energyDb).putFloat("vocals", value.vocalsDb)
            .putFloat("beats", value.beatsDb).putInt("revision", 2).putInt("mode", value.mode.ordinal)
            .putInt("focus", value.focus.ordinal).putInt("spacing", value.spacing.ordinal)
            .putFloat("laya_threshold", value.layaThreshold).apply()
    }
}
