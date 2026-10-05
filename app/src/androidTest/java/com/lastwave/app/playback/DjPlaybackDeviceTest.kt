package com.lastwave.app.playback

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.test.platform.app.InstrumentationRegistry
import com.lastwave.app.data.local.EqualizerPreferences
import com.lastwave.app.data.local.SettingsPreferences
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class DjPlaybackDeviceTest {
    private class Rig : AutoCloseable {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        private val storeScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        private val store = PreferenceDataStoreFactory.create(scope = storeScope) {
            File(context.cacheDir, "dj-playback-${System.nanoTime()}.preferences_pb")
        }
        private val inactive = CoroutineScope(Job().apply { cancel() })
        val primary = NativeAudioEngine(SettingsPreferences(store, context), EqualizerPreferences(store), inactive)
        val secondary = NativeAudioEngine(SettingsPreferences(store, context), EqualizerPreferences(store), inactive)
        val controller = DjPlaybackController(context, scope)
        init {
            for (engine in listOf(primary, secondary)) {
                assertTrue(engine.configureMediaProcessor(48_000, 48_000, 2))
                engine.setStudioMasterClarity(false)
                engine.setEqualizer(false, FloatArray(15))
            }
        }
        fun pcm(engine: NativeAudioEngine, seconds: Double, amplitude: Float, mixed: Boolean = false): Pair<FloatArray, FloatArray> {
            val frames = (48_000 * seconds).roundToInt()
            val input = ByteBuffer.allocateDirect(frames * 8).order(ByteOrder.nativeOrder())
            val output = ByteBuffer.allocateDirect(frames * 8).order(ByteOrder.nativeOrder())
            repeat(frames) { n ->
                val x = if (mixed) amplitude * (sin(n * 90.0 * 2 * PI / 48_000) + sin(n * 900.0 * 2 * PI / 48_000))
                    else amplitude * sin(n * 440.0 * 2 * PI / 48_000)
                input.putFloat(x.toFloat()); input.putFloat(x.toFloat())
            }
            input.rewind()
            assertEquals(frames, engine.processMediaPcm(input, 0, output, 0, frames, NativePcmEncoding.PCM_FLOAT, 2))
            return FloatArray(frames * 2) { input.getFloat(it * 4) } to FloatArray(frames * 2) { output.getFloat(it * 4) }
        }
        override fun close() { scope.cancel(); primary.close(); secondary.close(); storeScope.cancel() }
    }

    private fun ratio(pair: Pair<FloatArray, FloatArray>): Double {
        val start = pair.first.size / 2
        fun power(array: FloatArray) = array.drop(start).sumOf { it.toDouble() * it }
        return sqrt(power(pair.second) / power(pair.first))
    }

    private fun assertUnchanged(pair: Pair<FloatArray, FloatArray>) {
        assertArrayEquals("An inactive DJ owner must leave PCM unchanged after its de-click release", pair.first, pair.second, 0f)
    }

    @Test fun controllerFollowsCrossfadeOwnersAndPreviewChangesCurrentPcm() = runBlocking {
        Rig().use { r ->
            val timed = DjCueProfile(enabled = true, mode = DjCueMode.TIMED, energyDb = 0f, vocalsDb = 0f, beatsDb = 0f)
            withContext(Dispatchers.Main) { r.controller.update(r.primary, r.secondary, true, timed, true, true, 0) }
            assertEquals(.7, ratio(r.pcm(r.secondary, .5, .1f)), .001)
            assertUnchanged(r.pcm(r.primary, .5, .1f))
            assertEquals(0f, r.primary.djRuntime()[7], 0f)
            withContext(Dispatchers.Main) { r.controller.update(r.primary, r.secondary, false, timed, true, true, 0) }
            assertEquals(.7, ratio(r.pcm(r.primary, .5, .1f)), .001)
            r.pcm(r.secondary, .1, .1f) // Consume the short de-click release, still processed by the existing DC filter.
            assertUnchanged(r.pcm(r.secondary, .5, .1f))
            assertEquals(0f, r.secondary.djRuntime()[7], 0f)
            val automatic = timed.copy(mode = DjCueMode.HIGHLIGHTS, before = .4f)
            withContext(Dispatchers.Main) { r.controller.update(r.primary, r.secondary, false, automatic, true, true, 0) }
            r.pcm(r.primary, .2, .1f)
            withContext(Dispatchers.Main) {
                r.controller.update(r.primary, r.secondary, false, automatic, true, true, 0)
                assertTrue(r.controller.state.value.canPreview)
                r.controller.preview(automatic)
            }
            assertEquals(.4, ratio(r.pcm(r.primary, .5, .1f)), .001)
            assertUnchanged(r.pcm(r.secondary, .5, .1f))
            assertEquals(1f, r.primary.djRuntime()[6], 0f)
            withContext(Dispatchers.Main) { r.controller.update(r.primary, r.secondary, false, automatic, false, true, 0) }
            r.pcm(r.primary, .1, .1f)
            assertUnchanged(r.pcm(r.primary, .5, .1f))
            assertEquals(1f, r.primary.djRuntime()[1], 0f)
            assertEquals(0f, r.primary.djRuntime()[7], 0f)
            assertFalse(r.controller.state.value.canPreview)
        }
    }

    @Test fun realLayaControllerApprovesWhileAudioKeepsAdvancing() = runBlocking {
        Rig().use { r ->
            val model = LayaModel.get(r.context)
            withTimeout(90_000) { while (!model.state.value.ready) delay(100) }
            // Earlier JNI tests may have scored the same rise. This streaming
            // check must wait for fresh inference while PCM keeps advancing.
            model.clearScoreCache()
            val profile = DjCueProfile(enabled = true, mode = DjCueMode.LAYA)
            var heardChange = false
            var accepted = false
            withTimeout(60_000) {
                for (block in 0 until 300) {
                    withContext(Dispatchers.Main) { r.controller.update(r.primary, r.secondary, false, profile, true, true, block * 100L) }
                    val rising = block >= 120
                    val pair = r.pcm(r.primary, .1, if (rising) .16f else .03f, mixed = true)
                    if (r.primary.djRuntime()[5] > 0f) {
                        accepted = true
                        heardChange = heardChange || !pair.first.contentEquals(pair.second)
                    }
                    if (accepted && heardChange) break
                    delay(100) // PCM advances during real background inference.
                }
            }
            assertTrue("Production coordinator must apply a real model decision without stopping the audio clock", accepted)
            assertTrue("Real approval must change the decoded PCM", heardChange)
            assertTrue((model.state.value.lastProbability ?: 0f) >= profile.layaThreshold)
        }
    }

    @Test fun exoPlayerRestoresDjProcessingMidTrackAndSeeksTimedCue() = runBlocking {
        Rig().use { r ->
            val wave = File(r.context.cacheDir, "dj-real-player-${System.nanoTime()}.wav")
            val frames = 48_000 * 6
            val data = ByteBuffer.allocate(44 + frames * 4).order(ByteOrder.LITTLE_ENDIAN)
            data.put("RIFF".toByteArray()); data.putInt(36 + frames * 4); data.put("WAVEfmt ".toByteArray())
            data.putInt(16); data.putShort(1); data.putShort(2); data.putInt(48_000); data.putInt(192_000)
            data.putShort(4); data.putShort(16); data.put("data".toByteArray()); data.putInt(frames * 4)
            repeat(frames) { n -> val x = (3_000 * sin(n * 440.0 * 2 * PI / 48_000)).roundToInt().toShort(); data.putShort(x); data.putShort(x) }
            wave.writeBytes(data.array())
            lateinit var player: ExoPlayer
            lateinit var sink: NativeProcessingAudioSink
            var playerCreated = false
            var ticker: Job? = null
            val profile = DjCueProfile(enabled = true, cueMs = 2_000, energyDb = 0f, vocalsDb = 0f, beatsDb = 0f)
            try {
                withContext(Dispatchers.Main) {
                    val renderers = object : DefaultRenderersFactory(r.context) {
                        override fun buildAudioSink(context: Context, enableFloatOutput: Boolean, enableAudioTrackPlaybackParams: Boolean): AudioSink {
                            sink = NativeProcessingAudioSink(DefaultAudioSink.Builder(context).setEnableFloatOutput(true).build(),
                                DefaultAudioSink.Builder(context).setEnableFloatOutput(false).build(), NativePcmAudioProcessor(r.primary))
                            sink.setBitPerfectRequested(true)
                            return sink
                        }
                    }
                    player = ExoPlayer.Builder(r.context, renderers).build()
                    playerCreated = true
                    player.setMediaItem(MediaItem.fromUri(wave.toURI().toString())); player.prepare(); player.play()
                }
                withTimeout(15_000) { while (!withContext(Dispatchers.Main) { player.isPlaying }) delay(50) }
                withContext(Dispatchers.Main) {
                    sink.setBitPerfectRequested(false)
                    r.primary.setBitPerfect(false)
                    player.seekTo(100)
                    ticker = r.scope.launch {
                        while (isActive) {
                            r.controller.update(r.primary, null, false, profile, true, player.isPlaying, player.currentPosition)
                            delay(60)
                        }
                    }
                }
                var sawLow = false
                withTimeout(15_000) {
                    while (true) {
                        val runtime = r.primary.djRuntime()
                        if (runtime[0] > 0 && runtime[1] < .72f) sawLow = true
                        if (sawLow && runtime[1] >= .799f) break
                        delay(20)
                    }
                }
                assertTrue("Actual Media3 playback must render the low level before the timed rise", sawLow)
                withContext(Dispatchers.Main) { player.seekTo(100) }
                withTimeout(5_000) { while (r.primary.djRuntime()[1] > .72f) delay(20) }
                assertTrue("Seeking backwards must restore the real decoder's low-volume mix", r.primary.djRuntime()[1] <= .72f)
            } finally {
                ticker?.cancel()
                withContext(Dispatchers.Main) { if (playerCreated) player.release() }
                wave.delete()
            }
        }
    }
}
