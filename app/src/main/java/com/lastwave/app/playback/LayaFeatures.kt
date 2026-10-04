package com.lastwave.app.playback

import kotlin.math.log10

/** Coarse descriptions of real PCM features, not predicted vocal stems or listener counts. */
internal object LayaFeatures {
    fun key(features: FloatArray, focus: DjHighlightFocus): String? {
        if (features.size < 4 || features.take(4).any { !it.isFinite() || it < 0f }) return null
        val power = features[0].toDouble().coerceAtLeast(1e-12)
        val db = 10 * log10(power)
        val intensity = when { db < -32 -> 0; db < -24 -> 1; db < -14 -> 2; else -> 3 }
        val rise = 10 * log10(power / features[1].toDouble().coerceAtLeast(1e-12))
        val change = when { rise < -2 -> 0; rise < 4.5 -> 1; else -> 2 }
        fun activity(ratio: Float) = when { ratio < .15f -> 0; ratio < .35f -> 1; else -> 2 }
        return "${focus.ordinal}.$intensity.$change.${activity(features[2])}.${activity(features[3])}"
    }
}
