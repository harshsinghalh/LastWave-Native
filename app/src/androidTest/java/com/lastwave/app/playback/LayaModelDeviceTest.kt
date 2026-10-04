package com.lastwave.app.playback

import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

/** Requires the actual pinned 424 MB model; CI provisions it before instrumentation. */
class LayaModelDeviceTest {
    @Test fun actualAndroidInferenceSelectsPeaksAndCaches() = runBlocking {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        assertEquals(LayaModel.MODEL_BYTES, File(context.filesDir, "laya/model.onnx").length())
        val model = LayaModel.get(context)
        withTimeout(90_000) { while (!model.state.value.ready) delay(100) }
        val fixture = JSONObject(instrumentation.context.assets.open("laya_reference.json").bufferedReader().use { it.readText() })
        val cases = fixture.getJSONArray("cases")
        val probabilities = mutableListOf<Float>()
        repeat(cases.length()) { i ->
            val case = cases.getJSONObject(i)
            val key = case.getString("key")
            val probability = requireNotNull(model.score(key))
            // Dynamic INT8 kernels differ between VNNI/AVX2/Arm. A desktop
            // probability is not a bit-exact Android oracle. Record both and
            // verify the actual selection behavior below, without rounding.
            Log.i("LayaDeviceTest", "$key desktop=${case.getDouble("probability")} android=$probability")
            assertEquals(probability, requireNotNull(model.score(key)), 0f)
            assertTrue(probability.isFinite() && probability in 0f..1f)
            probabilities += probability
        }
        assertTrue("Quiet section must be rejected", probabilities[0] < .55f)
        assertTrue("Distinct energy lift must pass the default threshold", probabilities[1] > .55f)
        assertTrue("Steady passage must rank below a rise", probabilities[2] < probabilities[1])
        assertNull("Unknown feature layout fails without a fabricated score", model.score("unknown"))
    }
}
