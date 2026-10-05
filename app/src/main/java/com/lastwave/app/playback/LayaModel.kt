package com.lastwave.app.playback

import android.content.Context
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import kotlin.math.exp

data class LayaModelState(
    val ready: Boolean = false,
    val checking: Boolean = true,
    val message: String = "Preparing DJ Energy…",
    val lastProbability: Float? = null,
)

/** Bundled, offline model. Preparation and inference never run on the audio thread. */
class LayaModel private constructor(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    private val directory = File(context.filesDir, "laya")
    private val model = File(directory, "model.onnx")
    private val partial = File(directory, "model.onnx.part")
    private val mutableState = MutableStateFlow(LayaModelState())
    val state = mutableState.asStateFlow()
    private var releaseJob: Job? = null
    private var session: OrtSession? = null
    private val tokens by lazy { JSONObject(context.assets.open("laya/dj_tokens.json").bufferedReader().use { it.readText() }) }
    private val cache = LinkedHashMap<String, Float>()

    init {
        scope.launch {
            try {
                check(directory.isDirectory || directory.mkdirs()) { "Cannot prepare DJ Energy storage." }
                // Reuse valid weights from older DJ versions, repairing damaged
                // files directly from the APK without any network request.
                val existingValid = if (model.isFile) try {
                    LayaWeights.prepare(context, model)
                    true
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    false
                } else false
                if (!existingValid) installBundledModel()
                mutableState.value = LayaModelState(ready = true, checking = false,
                    message = "DJ Energy ready • Offline")
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                partial.delete()
                mutableState.value = LayaModelState(checking = false,
                    message = e.message ?: "DJ Energy preparation failed.")
            }
        }
    }

    private suspend fun installBundledModel() {
        check(directory.usableSpace > MODEL_BYTES + 32_000_000) { "DJ Energy needs 460 MB of free storage." }
        val digest = MessageDigest.getInstance("SHA-256")
        var count = 0L
        context.assets.open("laya/model.onnx").use { input ->
            partial.outputStream().use { output ->
                val buffer = ByteArray(256 * 1024)
                while (true) {
                    currentCoroutineContext().ensureActive()
                    val n = input.read(buffer)
                    if (n < 0) break
                    count += n
                    check(count <= MODEL_BYTES) { "Invalid bundled DJ Energy model." }
                    digest.update(buffer, 0, n)
                    output.write(buffer, 0, n)
                }
                output.fd.sync()
            }
        }
        check(count == MODEL_BYTES && hex(digest.digest()) == MODEL_SHA256) { "Bundled DJ Energy model failed its integrity check." }
        check(partial.renameTo(model)) { "Cannot prepare DJ Energy model." }
    }

    internal suspend fun score(key: String): Float? = scoreInternal(key, publish = true, force = false)

    internal suspend fun clearScoreCache() { lock.withLock { cache.clear() } }

    /** Warm the real session before a musical candidate's inference deadline. */
    internal suspend fun warmup(): Boolean = scoreInternal("0.0.1.0.0", publish = false, force = true) != null

    private suspend fun scoreInternal(key: String, publish: Boolean, force: Boolean): Float? = withContext(Dispatchers.IO) {
        releaseJob?.cancel()
        lock.withLock {
            if (!state.value.ready) return@withLock null
            if (!force) cache[key]?.let { probability ->
                if (publish) mutableState.value = state.value.copy(lastProbability = probability,
                    message = "DJ Energy ready • Offline")
                return@withLock probability
            }
            try {
                val entry = tokens.getJSONObject("entries").getJSONObject(key)
                val idsJson = entry.getJSONArray("ids")
                // This pinned export has fixed internal 512-token reshapes.
                // Tail padding is masked; shortening it breaks the decision head.
                val ids = LongArray(512) { tokens.getLong("pad_id") }
                val mask = LongArray(512)
                repeat(idsJson.length()) { ids[it] = idsJson.getLong(it); mask[it] = 1L }
                val markerJson = entry.getJSONArray("markers")
                val markers = LongArray(2) { markerJson.getLong(it) }
                val environment = OrtEnvironment.getEnvironment()
                val activeSession = session ?: OrtSession.SessionOptions().use { options ->
                    options.setIntraOpNumThreads(2)
                    options.setInterOpNumThreads(1)
                    options.addConfigEntry("session.intra_op.allow_spinning", "0")
                    // Keep the export's explicit attention/masking operations.
                    options.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.BASIC_OPT)
                    environment.createSession(model.absolutePath, options).also { session = it }
                }
                val inputs = linkedMapOf<String, OnnxTensor>()
                try {
                    inputs["input_ids"] = OnnxTensor.createTensor(environment, arrayOf(ids))
                    inputs["attention_mask"] = OnnxTensor.createTensor(environment, arrayOf(mask))
                    inputs["marker_pos"] = OnnxTensor.createTensor(environment, arrayOf(markers))
                    inputs["marker_mask"] = OnnxTensor.createTensor(environment, arrayOf(booleanArrayOf(true, true)))
                    inputs["qtype"] = OnnxTensor.createTensor(environment, longArrayOf(0L))
                    activeSession.run(inputs).use { result ->
                        @Suppress("UNCHECKED_CAST")
                        val logits = (result.get("logits").get().value as Array<FloatArray>)[0]
                        check(logits.size == 2 && logits.all { it.isFinite() }) { "Invalid model output." }
                        val probability = (1.0 / (1.0 + exp((logits[1] - logits[0]) / tokens.getDouble("temperature")))).toFloat()
                        if (cache.size >= 64) cache.remove(cache.keys.first())
                        cache[key] = probability
                        if (publish) mutableState.value = state.value.copy(lastProbability = probability,
                            message = "DJ Energy ready • Offline")
                        probability
                    }
                } finally { inputs.values.forEach { it.close() } }
            } catch (e: Exception) {
                session?.close(); session = null
                mutableState.value = state.value.copy(message = "Laya could not score this section. Playback continues unchanged.")
                null
            }
        }
    }

    internal fun releaseWhenIdle() {
        if (releaseJob?.isActive == true) return
        releaseJob = scope.launch {
            delay(30_000)
            lock.withLock { session?.close(); session = null }
        }
    }

    companion object {
        const val MODEL_BYTES = 424_348_081L
        const val MODEL_DOWNLOAD_SHA256 = "d337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469"
        const val MODEL_SHA256 = "1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1"
        @Volatile private var instance: LayaModel? = null
        fun get(context: Context): LayaModel = instance ?: synchronized(this) {
            instance ?: LayaModel(context.applicationContext).also { instance = it }
        }
        private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    }
}
