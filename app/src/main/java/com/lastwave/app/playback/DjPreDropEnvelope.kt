package com.lastwave.app.playback

/**
 * Canonical staged DJ Energy envelope used by v4.5.
 *
 * This is kept JVM-testable so the user-facing timing contract cannot drift:
 * T-3..T-2 seconds = 70%, T-2..T-1 = 40%, T-1..T = 10%, and the impact
 * itself returns to the normal 100% level.
 */
object DjPreDropEnvelope {
    const val LOOK_AHEAD_SECONDS = 3.0
    const val STAGE_SECONDS = 1.0
    const val STAGE_ONE_GAIN = 0.70f
    const val STAGE_TWO_GAIN = 0.40f
    const val STAGE_THREE_GAIN = 0.10f
    const val NORMAL_GAIN = 1.0f

    fun targetGain(secondsUntilImpact: Double): Float = when {
        !secondsUntilImpact.isFinite() -> NORMAL_GAIN
        secondsUntilImpact <= 0.0 -> NORMAL_GAIN
        secondsUntilImpact > LOOK_AHEAD_SECONDS -> NORMAL_GAIN
        secondsUntilImpact > 2.0 -> STAGE_ONE_GAIN
        secondsUntilImpact > 1.0 -> STAGE_TWO_GAIN
        else -> STAGE_THREE_GAIN
    }
}
