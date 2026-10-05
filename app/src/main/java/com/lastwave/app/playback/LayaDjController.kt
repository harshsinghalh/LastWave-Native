package com.lastwave.app.playback

import android.content.Context
import kotlinx.coroutines.*

/** Main-thread coordinator; native candidates carry generations to reject late results. */
internal class LayaDjController(context: Context, private val scope: CoroutineScope) {
    private val model = LayaModel.get(context)
    private var job: Job? = null
    private var previous: Triple<DjHighlightFocus, DjHighlightSpacing, Float>? = null
    private var lastCandidate: Pair<Int, Int>? = null
    private var revision = 0L
    private var warmed = false
    private var previousEngine: NativeAudioEngine? = null
    var status: String = "Listening for a musical highlight."
        private set

    fun update(enabled: Boolean, profile: DjCueProfile, engine: NativeAudioEngine) {
        val config = if (enabled) Triple(profile.focus, profile.spacing, profile.layaThreshold) else null
        if (config != previous || engine !== previousEngine) {
            revision++; job?.cancel(); job = null; lastCandidate = null; warmed = false
            engine.setDjLayaDecision(-1, -1, false)
            if (!enabled) model.releaseWhenIdle()
            previous = config
            previousEngine = engine
        }
        if (!enabled) { status = "Laya is paused."; return }
        if (!model.state.value.ready) { status = model.state.value.message; return }
        if (job?.isActive == true) return
        if (!warmed) {
            warmed = true
            status = "Warming Laya on this device…"
            job = scope.launch(Dispatchers.Main.immediate) {
                model.warmup()
                status = "Laya is listening for a musical highlight."
            }
            return
        }
        val features = engine.djFeatures()
        if (features.size != 8 || features[6] != 1f) return
        val candidate = features[4].toInt() to features[5].toInt()
        if (candidate == lastCandidate) return
        val key = LayaFeatures.key(features, profile.focus) ?: return
        lastCandidate = candidate
        status = "Laya is scoring a high-energy section…"
        val token = revision
        job = scope.launch(Dispatchers.Main.immediate) {
            val probability = model.score(key) ?: run {
                status = model.state.value.message
                return@launch
            }
            ensureActive()
            val current = engine.djFeatures()
            if (token == revision && current.size == 8 && current[6] == 1f &&
                current[4].toInt() == candidate.first && current[5].toInt() == candidate.second) {
                engine.setDjLayaDecision(candidate.first, candidate.second, probability >= profile.layaThreshold)
                status = if (probability >= profile.layaThreshold) "Laya approved this highlight."
                    else "Laya skipped this section: ${(probability * 100).toInt()}% below ${(profile.layaThreshold * 100).toInt()}%."
            } else status = "Laya finished after the section ended; listening for the next highlight."
        }
    }
}
