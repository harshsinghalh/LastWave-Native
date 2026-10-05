package com.lastwave.app.playback

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Uses the real model in the installed APK, with airplane mode on and no preseeded files. */
class LayaModelDeviceTest {
    @Test fun actualAndroidInferenceSelectsPeaksAndCaches() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val model = LayaModel.get(context)
        withTimeout(90_000) { while (!model.state.value.ready) delay(100) }
        assertEquals(LayaModel.MODEL_BYTES, File(context.filesDir, "laya/model.onnx").length())
        assertEquals(LayaModel.MODEL_BYTES, context.assets.openFd("laya/model.onnx").use { it.length })
        assertEquals(1, android.provider.Settings.Global.getInt(context.contentResolver, "airplane_mode_on", 0))
        val fixture = JSONObject(instrumentation.context.assets.open("laya_reference.json").bufferedReader().use { it.readText() })
        assertEquals(LayaModel.MODEL_SHA256, fixture.getString("model_sha256"))
        assertEquals("basic", fixture.getString("optimization_level"))
        val beforeWarmup = model.state.value.lastProbability
        model.warmup()
        assertEquals("Warm-up must not present a fabricated track decision", beforeWarmup, model.state.value.lastProbability)
        val cases = fixture.getJSONArray("cases")
        val probabilities = mutableListOf<Float>()
        repeat(cases.length()) { i ->
            val case = cases.getJSONObject(i)
            val key = case.getString("key")
            val probability = requireNotNull(model.score(key))
            // Record every actual result before comparing independently measured
            // Android reference outputs and selection behavior.
            Log.i("LayaDeviceTest", "$key desktop=${case.getDouble("probability")} android=$probability")
            assertEquals(probability, requireNotNull(model.score(key)), 0f)
            assertEquals(probability, requireNotNull(model.state.value.lastProbability), 0f)
            assertTrue(probability.isFinite() && probability in 0f..1f)
            probabilities += probability
        }
        // The independent Java probe proved identical tensors and weights but
        // different absolute scores across CPU runtimes. Compare Android against
        // separately measured Android inference, and retain the behavior checks.
        val androidCases = fixture.getJSONObject("android_reference").getJSONArray("cases")
        repeat(androidCases.length()) { i ->
            val reference = androidCases.getJSONObject(i)
            val key = reference.getString("key")
            val index = (0 until cases.length()).first { cases.getJSONObject(it).getString("key") == key }
            assertEquals("Independent Android probability for $key",
                reference.getDouble("probability").toFloat(), probabilities[index], .025f)
        }
        val threshold = DjEnergyProfile().layaThreshold
        assertTrue("Quiet section must be rejected", probabilities[0] < threshold)
        assertTrue("Distinct energy lift must pass the default threshold", probabilities[1] > threshold)
        assertTrue("Steady passage must rank below a rise", probabilities[2] < probabilities[1])
        assertNull("Unknown feature layout fails without a fabricated score", model.score("unknown"))
    }
}
