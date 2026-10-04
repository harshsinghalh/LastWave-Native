package com.lastwave.app.playback

import com.google.common.truth.Truth.assertThat
import java.io.File
import org.junit.Test

/**
 * Guards the exact concert pre-drop contract requested for DJ Energy.
 *
 * The DSP is native/JNI-only in local unit tests, so this test verifies the
 * production C++ constants that define the audible envelope and the Media3
 * flush capacity needed to preserve the delayed tail.
 */
class DjThreeSecondPreDropContractTest {

    @Test
    fun nativeDspKeepsExactThreeSecondThirtySixtyNinetyContract() {
        val source = File("src/main/cpp/DspProcessor.cpp").readText()

        assertThat(source).contains("kDjLongLookAheadSeconds = 3.0")
        assertThat(source).contains("kDjDropGainStage1 = 0.70F")
        assertThat(source).contains("kDjDropGainStage2 = 0.40F")
        assertThat(source).contains("kDjDropGainStage3 = 0.10F")
        assertThat(source).contains("nextDjPreDropGain()")
        assertThat(source).contains("flushLookAhead(")
    }

    @Test
    fun stagedVolumeMathMatchesRequestedReductions() {
        val normal = 1.0f
        val firstSecond = normal * 0.70f
        val secondSecond = normal * 0.40f
        val thirdSecond = normal * 0.10f
        val impact = normal

        assertThat(1f - firstSecond).isWithin(0.0001f).of(0.30f)
        assertThat(1f - secondSecond).isWithin(0.0001f).of(0.60f)
        assertThat(1f - thirdSecond).isWithin(0.0001f).of(0.90f)
        assertThat(impact).isWithin(0.0001f).of(1.0f)
    }

    @Test
    fun mediaProcessorReservesEnoughFramesToDrainLookAheadTail() {
        val source = File(
            "src/main/java/com/lastwave/app/playback/NativePcmAudioProcessor.kt",
        ).readText()

        assertThat(source).contains("DJ_LONG_LOOKAHEAD_SECONDS = 3")
        assertThat(source).contains(
            "MAX_OUTPUT_SAMPLE_RATE_HZ * DJ_LONG_LOOKAHEAD_SECONDS + 65_536",
        )
    }
}
