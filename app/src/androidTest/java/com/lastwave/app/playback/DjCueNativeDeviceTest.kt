package com.lastwave.app.playback

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.platform.app.InstrumentationRegistry
import com.lastwave.app.data.local.EqualizerPreferences
import com.lastwave.app.data.local.SettingsPreferences
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.*
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

/** Exercises the packaged JNI engine using actual decoded float PCM on Android. */
class DjCueNativeDeviceTest {
    @Test fun jniProcessesVolumeAndBitPerfectBypassesCue() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val storeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = storeScope) {
            File(context.cacheDir, "dj-test-${System.nanoTime()}.preferences_pb")
        }
        // Keep unrelated asynchronous preference collectors out of this deterministic DSP check.
        val inactiveScope = CoroutineScope(Job().apply { cancel() })
        val engine = NativeAudioEngine(SettingsPreferences(store, context), EqualizerPreferences(store), inactiveScope)
        try {
            assertTrue("Native library must load", engine.isAvailable)
            assertTrue(engine.configureMediaProcessor(48_000, 48_000, 2))
            engine.setStudioMasterClarity(false)
            engine.setDjEnergyEnabled(false)
            engine.setEqualizer(false, FloatArray(15))
            val frames = 48_000
            val input = ByteBuffer.allocateDirect(frames * 2 * 4).order(ByteOrder.nativeOrder())
            val output = ByteBuffer.allocateDirect(frames * 2 * 4).order(ByteOrder.nativeOrder())
            repeat(frames) { n ->
                val x = (.1 * sin(n * 440.0 * 2 * PI / 48_000)).toFloat()
                input.putFloat(x); input.putFloat(x)
            }
            input.rewind()
            fun process(): FloatArray {
                output.clear()
                assertEquals(frames, engine.processMediaPcm(input, 0, output, 0, frames, NativePcmEncoding.PCM_FLOAT, 2))
                return FloatArray(frames * 2) { output.getFloat(it * 4) }
            }
            fun rms(x: FloatArray) = sqrt(x.drop(x.size / 2).sumOf { it.toDouble() * it } / (x.size / 2))
            engine.setDjCue(.7f, 0f, 0f, 0f)
            val quiet = process()
            assertEquals(.7 / sqrt(2.0) * .1, rms(quiet), .0003)
            engine.setDjCue(.8f, 2f, 2f, 3f)
            val lifted = process()
            assertTrue(rms(lifted) > rms(quiet))
            assertTrue(lifted.all { it.isFinite() && abs(it) <= 1f })
            engine.setBitPerfect(true)
            val bypass = process()
            for (i in bypass.indices) assertEquals(input.getFloat(i * 4), bypass[i], 0f)
            // Exercise the new packaged JNI path with warm-up, sustained rise,
            // bounded event, silence and Bit-Perfect. No mocks of native DSP.
            engine.setBitPerfect(false)
            engine.setDjCue(1f, 0f, 0f, 0f)
            engine.setDjHighlights(true, 0, 0, 2f, 2f, 3f)
            engine.resetMediaProcessor()
            fun fill(amplitude: Float) {
                input.clear()
                repeat(frames) { n ->
                    val x = (amplitude * sin(n * 90.0 * 2 * PI / 48_000)).toFloat()
                    input.putFloat(x); input.putFloat(x)
                }
                input.rewind()
            }
            fill(.03f)
            repeat(12) {
                val ordinary = process()
                for (i in ordinary.indices) assertEquals(input.getFloat(i * 4), ordinary[i], 0f)
            }
            fill(.18f)
            val highlighted = ArrayList<FloatArray>()
            repeat(8) { highlighted += process() }
            val dryRms = .18 / sqrt(2.0)
            assertTrue("Selected bass highlight must lift energy", rms(highlighted[3]) > dryRms * 1.15)
            assertTrue(highlighted.all { block -> block.all { it.isFinite() && abs(it) <= 1f } })
            assertArrayEquals("A steady loud passage must return to untouched PCM",
                FloatArray(frames * 2) { input.getFloat(it * 4) }, highlighted.last(), 0f)
            engine.setBitPerfect(true)
            val selectiveBypass = process()
            for (i in selectiveBypass.indices) assertEquals(input.getFloat(i * 4), selectiveBypass[i], 0f)

            // Real measured PCM -> real Laya score -> matching JNI approval.
            engine.setBitPerfect(false)
            engine.setDjLayaMode(true)
            engine.resetMediaProcessor()
            fill(.03f)
            repeat(12) { process() }
            fill(.18f)
            assertArrayEquals(FloatArray(frames * 2) { input.getFloat(it * 4) }, process(), 0f)
            val candidate = engine.djFeatures()
            assertEquals(1f, candidate[6], 0f)
            engine.setDjLayaDecision(candidate[4].toInt() - 1, candidate[5].toInt(), true)
            assertArrayEquals("A stale model decision must not affect PCM",
                FloatArray(frames * 2) { input.getFloat(it * 4) }, process(), 0f)
            val probability = runBlocking {
                val model = LayaModel.get(context)
                withTimeout(90_000) { while (!model.state.value.ready) delay(100) }
                requireNotNull(model.score(requireNotNull(LayaFeatures.key(candidate, DjHighlightFocus.ENERGY))))
            }
            val accepted = probability >= .55f
            engine.setDjLayaDecision(candidate[4].toInt(), candidate[5].toInt(), accepted)
            val first = process()
            val second = process()
            val dry = FloatArray(frames * 2) { input.getFloat(it * 4) }
            if (accepted) assertFalse("Real model approval must reach the packaged DSP", second.contentEquals(dry))
            else { assertArrayEquals(dry, first, 0f); assertArrayEquals(dry, second, 0f) }
            assertTrue(second.all { it.isFinite() && abs(it) <= 1f })
        } finally {
            engine.close(); storeScope.cancel()
        }
    }
}
