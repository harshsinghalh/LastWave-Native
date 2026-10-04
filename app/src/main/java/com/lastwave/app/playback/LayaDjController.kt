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

    fun update(enabled: Boolean, profile: DjCueProfile, engine: NativeAudioEngine) {
        val config = if (enabled) Triple(profile.focus, profile.spacing, profile.layaThreshold) else null
        if (config != previous) {
            revision++; job?.cancel(); job = null; lastCandidate = null
            engine.setDjLayaDecision(-1, -1, false)
            if (!enabled) model.releaseWhenIdle()
            previous = config
        }
        if (!enabled || !model.state.value.ready || job?.isActive == true) return
        val features = engine.djFeatures()
        if (features.size != 8 || features[6] != 1f) return
        val candidate = features[4].toInt() to features[5].toInt()
        if (candidate == lastCandidate) return
        val key = LayaFeatures.key(features, profile.focus) ?: return
        lastCandidate = candidate
        val token = revision
        job = scope.launch {
            val probability = model.score(key) ?: return@launch
            ensureActive()
            val current = engine.djFeatures()
            if (token == revision && current.size == 8 && current[6] == 1f &&
                current[4].toInt() == candidate.first && current[5].toInt() == candidate.second) {
                engine.setDjLayaDecision(candidate.first, candidate.second, probability >= profile.layaThreshold)
            }
        }
    }
}
