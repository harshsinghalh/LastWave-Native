package com.lastwave.app.playback

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.roundToInt

data class DjEnergyStatus(
    val message: String = "Play a song to check DJ Energy.",
    val volumePercent: Int = 100,
    val boosts: Int = 0,
    val canPreview: Boolean = false,
)

/** Shared by actual playback and device tests; follows the crossfade owner. */
internal class DjPlaybackController(context: Context, scope: CoroutineScope) {
    private val laya = lazy { LayaDjController(context, scope) }
    private val mutableState = MutableStateFlow(DjEnergyStatus())
    val state = mutableState.asStateFlow()
    private var active: NativeAudioEngine? = null

    fun update(primary: NativeAudioEngine, secondary: NativeAudioEngine?, secondaryActive: Boolean,
        profile: DjCueProfile, enabled: Boolean, playing: Boolean, positionMs: Long,
        blockedReason: String? = null) {
        val engine = if (secondaryActive) secondary ?: primary else primary
        if (active !== engine) {
            active?.let {
                it.setDjTimedMode(false, profile.cueMs)
                it.setDjHighlights(false, 0, 0, 0f, 0f, 0f)
                it.setDjLayaMode(false)
                it.setDjLayaDecision(-1, -1, false)
                it.setDjCue(1f, 0f, 0f, 0f)
                it.setDjEnergyEnabled(false)
            }
            active = engine
        }
        val allowed = enabled && blockedReason == null
        engine.setDjEnergyEnabled(allowed)
        engine.setDjCue(1f, 0f, 0f, 0f)
        engine.setDjHighlights(allowed && profile.mode != DjCueMode.TIMED,
            profile.focus.ordinal, profile.spacing.ordinal, profile.energyDb, profile.vocalsDb,
            profile.beatsDb, profile.before, profile.after, profile.rampMs)
        engine.setDjTimedMode(allowed && profile.mode == DjCueMode.TIMED, profile.cueMs)
        val layaEnabled = allowed && profile.mode == DjCueMode.LAYA
        engine.setDjLayaMode(layaEnabled)
        if (layaEnabled || laya.isInitialized()) laya.value.update(layaEnabled && playing, profile, engine)
        val runtime = engine.djRuntime()
        val features = engine.djFeatures()
        val processed = runtime.size == 9 && runtime[0] > 0f
        val effectActive = runtime.size == 9 && runtime[2] + runtime[3] + runtime[4] > .05f
        val message = when {
            !enabled -> "DJ Energy is off."
            blockedReason != null -> "DJ Energy suspended: $blockedReason"
            !playing -> "Play a song to hear DJ Energy."
            !engine.isAvailable -> "Audio processing unavailable on this device."
            !processed -> "Waiting for decoded audio. If the output was Bit-Perfect, restart this track."
            runtime[6] == 1f -> "Test boost playing through the current audio output."
            effectActive -> "DJ boost active."
            profile.mode == DjCueMode.TIMED -> "Timed cue: ${profile.cueMs / 60_000}:${(profile.cueMs / 1000 % 60).toString().padStart(2, '0')}"
            profile.mode == DjCueMode.LAYA -> laya.value.status
            features.getOrElse(7) { 0f } < 10f -> "Listening to the first 10 seconds…"
            else -> "Listening for a strong rise or sustained high-energy section."
        }
        mutableState.value = DjEnergyStatus(message,
            if (processed) (runtime[1] * 100).roundToInt() else 100,
            if (processed) runtime[5].toInt() else 0,
            allowed && playing && engine.isAvailable && processed && runtime[6] != 1f)
    }

    fun preview(profile: DjCueProfile) {
        if (state.value.canPreview) active?.previewDjEnergy(profile)
    }
}
