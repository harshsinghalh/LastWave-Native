package com.lastwave.app.playback

import org.junit.Assert.*
import org.junit.Test

class LayaFeaturesTest {
    @Test fun realPowerAndFrequencyRatiosProduceTheExpectedQuestion() {
        assertEquals("0.2.2.2.2", LayaFeatures.key(floatArrayOf(.02f, .002f, .6f, .5f), DjHighlightFocus.ENERGY))
        assertEquals("1.0.1.0.0", LayaFeatures.key(floatArrayOf(.0001f, .0001f, .01f, .01f), DjHighlightFocus.BEATS))
        assertEquals("2.3.0.1.2", LayaFeatures.key(floatArrayOf(.1f, .2f, .2f, .5f), DjHighlightFocus.VOCALS))
    }
    @Test fun invalidFeaturesCannotRequestInference() {
        assertNull(LayaFeatures.key(floatArrayOf(1f), DjHighlightFocus.ENERGY))
        for (value in floatArrayOf(Float.NaN, Float.POSITIVE_INFINITY, -1f)) {
            assertNull(LayaFeatures.key(floatArrayOf(value, 0f, 0f, 0f), DjHighlightFocus.ENERGY))
        }
    }
    @Test fun layaModeDoesNotReduceTheWholeTrack() {
        val p = DjCueProfile(enabled = true, mode = DjCueMode.LAYA)
        assertArrayEquals(floatArrayOf(1f, 0f, 0f, 0f), p.mixAt(200_000, true), 0f)
        assertEquals(.55f, p.layaThreshold, 0f)
    }
}
