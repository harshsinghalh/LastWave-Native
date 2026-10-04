package com.lastwave.app.playback

import android.content.Context

/** Values are relative PCM amplitude, not perceived loudness or system volume. */
data class DjCueProfile(
    val enabled: Boolean = false,
    val cueMs: Long = 165_000,
    val rampMs: Long = 2_000,
    val before: Float = 0.70f,
    val after: Float = 0.90f,
    val energyDb: Float = 2f,
    val vocalsDb: Float = 2f,
    val beatsDb: Float = 3f,
) {
    fun mixAt(positionMs: Long, active: Boolean): FloatArray {
        if (!active) return floatArrayOf(1f, 0f, 0f, 0f)
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
        return DjCueProfile(p.getBoolean("enabled", false), p.getLong("cue", 165_000).coerceIn(0, 86_400_000),
            p.getLong("ramp", 2_000).coerceIn(100, 30_000), safe("before", .7f, 1f), safe("after", .9f, 1f),
            safe("energy", 2f, 6f), safe("vocals", 2f, 6f), safe("beats", 3f, 6f))
    }
    fun save(context: Context, value: DjCueProfile) {
        prefs(context).edit().putBoolean("enabled", value.enabled).putLong("cue", value.cueMs)
            .putLong("ramp", value.rampMs).putFloat("before", value.before).putFloat("after", value.after)
            .putFloat("energy", value.energyDb).putFloat("vocals", value.vocalsDb)
            .putFloat("beats", value.beatsDb).apply()
    }
}
