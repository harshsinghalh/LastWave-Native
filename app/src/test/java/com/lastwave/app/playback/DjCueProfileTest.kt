package com.lastwave.app.playback

import org.junit.Assert.*
import org.junit.Test

class DjCueProfileTest {
    @Test fun defaultIsOffAndNeutralWhenSuspended() {
        val p = DjCueProfile()
        assertFalse(p.enabled)
        assertEquals(1_500L, p.rampMs)
        assertEquals(.8f, p.after, 0f)
        assertArrayEquals(floatArrayOf(1f, 0f, 0f, 0f), p.mixAt(200_000, false), 0f)
    }
    @Test fun cueStartsAtTwoFortyFiveAndCompletesAfterRamp() {
        val p = DjCueProfile(enabled = true)
        assertArrayEquals(floatArrayOf(.7f, 0f, 0f, 0f), p.mixAt(164_999, true), .00001f)
        assertArrayEquals(floatArrayOf(.7f, 0f, 0f, 0f), p.mixAt(165_000, true), .00001f)
        assertArrayEquals(floatArrayOf(.75f, 1f, 1f, 1.5f), p.mixAt(165_750, true), .00001f)
        assertArrayEquals(floatArrayOf(.8f, 2f, 2f, 3f), p.mixAt(166_500, true), .00001f)
    }
    @Test fun seekBackAndRepeatRestoreBeforeLevel() {
        val p = DjCueProfile(enabled = true)
        p.mixAt(200_000, true)
        assertArrayEquals(floatArrayOf(.7f, 0f, 0f, 0f), p.mixAt(0, true), .00001f)
    }
    @Test fun pausedPositionProducesSameMix() {
        val p = DjCueProfile(enabled = true)
        assertArrayEquals(p.mixAt(166_000, true), p.mixAt(166_000, true), 0f)
    }
    @Test fun automaticModeNeverAppliesTheAllTrackTimedReduction() {
        val p = DjCueProfile(enabled = true, mode = DjCueMode.HIGHLIGHTS)
        for (position in listOf(0L, 165_000L, 200_000L)) {
            assertArrayEquals(floatArrayOf(1f, 0f, 0f, 0f), p.mixAt(position, true), 0f)
        }
    }
}
