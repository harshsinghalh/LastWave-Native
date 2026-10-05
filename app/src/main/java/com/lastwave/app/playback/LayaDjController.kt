package com.lastwave.app.playback

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.*

/** Main-thread coordinator; native candidates carry generations to reject late results. */
internal class LayaDjController(context: Context, private val scope: CoroutineScope) {
    private val model = LayaModel.get(context)
    private var job: Job? = null
    private var previous: Triple<DjHighlightFocus, DjHighlightSpacing, Float>? = null
    private var lastCandidate: Pair<Int, Int>? = null
    private var revision = 0L
    private var warmed = false
    private var warmComplete = false
    private var scoringStartedMs = 0L
    var requiresApproval: Boolean = false
        private set
    private var previousEngine: NativeAudioEngine? = null
    var status: String = "Listening for highlights…"
        private set

    fun update(enabled: Boolean, profile: DjEnergyProfile, engine: NativeAudioEngine) {
        val config = if (enabled) Triple(profile.focus, profile.spacing, profile.layaThreshold) else null
        if (config != previous || engine !== previousEngine) {
            revision++; job?.cancel(); job = null; lastCandidate = null; warmed = false; warmComplete = false; scoringStartedMs = 0L
            engine.setDjLayaDecision(-1, -1, false)
            if (!enabled) model.releaseWhenIdle()
            previous = config
            previousEngine = engine
        }
        requiresApproval = enabled && model.state.value.ready && warmComplete
        if (!enabled) { status = "DJ Energy paused."; return }
        if (!model.state.value.ready) { status = model.state.value.message; return }
        if (job?.isActive == true) {
            // Selection keeps working while the bundled model initializes or
            // a slower phone cannot score the current section promptly.
            if (scoringStartedMs > 0 && SystemClock.elapsedRealtime() - scoringStartedMs > 5_000) {
                requiresApproval = false
                status = "Listening for highlights…"
            }
            return
        }
        if (!warmed) {
            warmed = true
            status = "Preparing DJ Energy…"
            job = scope.launch(Dispatchers.Main.immediate) {
                warmComplete = model.warmup()
                status = "Listening for highlights…"
            }
            return
        }
        val features = engine.djFeatures()
        if (features.size != 8 || features[6] != 1f) return
        val candidate = features[4].toInt() to features[5].toInt()
        if (candidate == lastCandidate) return
        val key = LayaFeatures.key(features, profile.focus) ?: return
        lastCandidate = candidate
        status = "Selecting a highlight…"
        scoringStartedMs = SystemClock.elapsedRealtime()
        val token = revision
        job = scope.launch(Dispatchers.Main.immediate) {
            val probability = model.score(key) ?: run {
                warmComplete = false
                requiresApproval = false
                status = "Listening for highlights…"
                return@launch
            }
            ensureActive()
            val current = engine.djFeatures()
            if (token == revision && current.size == 8 && current[6] == 1f &&
                current[4].toInt() == candidate.first && current[5].toInt() == candidate.second) {
                engine.setDjLayaDecision(candidate.first, candidate.second, probability >= profile.layaThreshold)
                status = if (probability >= profile.layaThreshold) "Highlight selected."
                    else "Listening for the next highlight…"
            } else status = "Listening for the next highlight…"
        }
    }
}
