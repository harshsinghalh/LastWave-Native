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
            engine.setDjCue(.9f, 2f, 2f, 3f)
            val lifted = process()
            assertTrue(rms(lifted) > rms(quiet))
            assertTrue(lifted.all { it.isFinite() && abs(it) <= 1f })
            engine.setBitPerfect(true)
            val bypass = process()
            for (i in bypass.indices) assertEquals(input.getFloat(i * 4), bypass[i], 0f)
        } finally {
            engine.close(); storeScope.cancel()
        }
    }
}
