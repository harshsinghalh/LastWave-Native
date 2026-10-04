package com.lastwave.app.playback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DjPreDropEnvelopeTest {
    @Test
    fun threeSecondConcertEnvelopeMatchesRequestedPercentages() {
        assertThat(DjPreDropEnvelope.targetGain(4.0)).isEqualTo(1.0f)
        assertThat(DjPreDropEnvelope.targetGain(2.999)).isEqualTo(0.70f)
        assertThat(DjPreDropEnvelope.targetGain(2.0)).isEqualTo(0.40f)
        assertThat(DjPreDropEnvelope.targetGain(1.0)).isEqualTo(0.10f)
        assertThat(DjPreDropEnvelope.targetGain(0.001)).isEqualTo(0.10f)
        assertThat(DjPreDropEnvelope.targetGain(0.0)).isEqualTo(1.0f)
        assertThat(DjPreDropEnvelope.targetGain(-0.1)).isEqualTo(1.0f)
    }

    @Test
    fun stagesMeanThirtySixtyNinetyPercentReductionThenNormal() {
        assertThat(1.0f - DjPreDropEnvelope.STAGE_ONE_GAIN).isWithin(0.0001f).of(0.30f)
        assertThat(1.0f - DjPreDropEnvelope.STAGE_TWO_GAIN).isWithin(0.0001f).of(0.60f)
        assertThat(1.0f - DjPreDropEnvelope.STAGE_THREE_GAIN).isWithin(0.0001f).of(0.90f)
        assertThat(DjPreDropEnvelope.NORMAL_GAIN).isEqualTo(1.0f)
    }
}
