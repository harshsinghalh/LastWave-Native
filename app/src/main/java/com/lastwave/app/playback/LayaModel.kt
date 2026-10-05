package com.lastwave.app.playback

import android.content.Context
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
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
    val checking: Boolean = false,
    val downloading: Boolean = false,
    val downloadedBytes: Long = 0,
    val message: String = "Download Laya to enable AI highlights.",
    val lastProbability: Float? = null,
)

/** One shared CPU session. Download, validation and inference never run on the audio thread. */
class LayaModel private constructor(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val lock = Mutex()
    private val directory = File(context.filesDir, "laya")
    private val model = File(directory, "model.onnx")
    private val partial = File(directory, "model.onnx.part")
    private val mutableState = MutableStateFlow(LayaModelState(checking = model.isFile))
    val state = mutableState.asStateFlow()
    private var downloadJob: Job? = null
    @Volatile private var connection: HttpURLConnection? = null
    private var releaseJob: Job? = null
    private var session: OrtSession? = null
    private val tokens by lazy { JSONObject(context.assets.open("laya/dj_tokens.json").bufferedReader().use { it.readText() }) }
    private val cache = LinkedHashMap<String, Float>()

    init {
        scope.launch {
            if (model.isFile) {
                mutableState.value = LayaModelState(checking = true, message = "Checking downloaded Laya model…")
                try {
                    LayaWeights.prepare(context, model) {
                        mutableState.value = LayaModelState(checking = true, message = "Preparing Laya for this device…")
                    }
                    mutableState.value = LayaModelState(ready = true, message = "Laya ready. Scoring runs offline.")
                } catch (e: Exception) {
                    if (e is CancellationException) throw e
                    model.delete()
                    mutableState.value = LayaModelState(message = "Model check failed. Download Laya again.")
                }
            }
        }
    }

    fun download() {
        if (downloadJob?.isActive == true || state.value.ready || state.value.checking) return
        downloadJob = scope.launch {
            try {
                directory.mkdirs()
                check(directory.usableSpace > MODEL_BYTES + 64_000_000) { "Free at least 500 MB for Laya." }
                mutableState.value = LayaModelState(downloading = true, message = "Downloading Laya…")
                val digest = MessageDigest.getInstance("SHA-256")
                val request = (URL(MODEL_URL).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 20_000; readTimeout = 30_000; instanceFollowRedirects = true
                }
                connection = request
                check(request.responseCode == 200) { "Model server returned ${request.responseCode}." }
                var count = 0L
                request.inputStream.use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(256 * 1024)
                        while (true) {
                            ensureActive()
                            val n = input.read(buffer)
                            if (n < 0) break
                            count += n
                            check(count <= MODEL_BYTES) { "Unexpected model size." }
                            digest.update(buffer, 0, n); output.write(buffer, 0, n)
                            mutableState.value = LayaModelState(downloading = true, downloadedBytes = count, message = "Downloading Laya…")
                        }
                        output.fd.sync()
                    }
                }
                val downloadedHash = hex(digest.digest())
                check(count == MODEL_BYTES && downloadedHash == MODEL_DOWNLOAD_SHA256) { "Model integrity check failed." }
                LayaWeights.prepare(context, partial, downloadedHash) {
                    mutableState.value = LayaModelState(downloading = true, downloadedBytes = count,
                        message = "Preparing Laya for this device…")
                }
                ensureActive()
                check(partial.renameTo(model)) { "Could not save Laya model." }
                mutableState.value = LayaModelState(ready = true, message = "Laya ready. Scoring runs offline.")
            } catch (e: Exception) {
                partial.delete()
                mutableState.value = LayaModelState(message = if (e is CancellationException) "Download cancelled." else (e.message ?: "Download failed. Try again."))
            } finally {
                connection?.disconnect(); connection = null
            }
        }
    }

    fun cancelDownload() { downloadJob?.cancel(); connection?.disconnect() }

    internal suspend fun score(key: String): Float? = scoreInternal(key, publish = true, force = false)

    internal suspend fun clearScoreCache() { lock.withLock { cache.clear() } }

    /** Warm the real session before a musical candidate's inference deadline. */
    internal suspend fun warmup() { scoreInternal("0.0.1.0.0", publish = false, force = true) }

    private suspend fun scoreInternal(key: String, publish: Boolean, force: Boolean): Float? = withContext(Dispatchers.IO) {
        releaseJob?.cancel()
        lock.withLock {
            if (!state.value.ready) return@withLock null
            if (!force) cache[key]?.let { probability ->
                if (publish) mutableState.value = state.value.copy(lastProbability = probability,
                    message = "Laya ready. Scoring runs offline.")
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
                            message = "Laya ready. Scoring runs offline.")
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
        const val MODEL_URL = "https://huggingface.co/tozp/laya-onnx/resolve/0d1f7ebf46a3ea04ec4424df602f96ddefb66766/model_int8.onnx"
        @Volatile private var instance: LayaModel? = null
        fun get(context: Context): LayaModel = instance ?: synchronized(this) {
            instance ?: LayaModel(context.applicationContext).also { instance = it }
        }
        private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it.toInt() and 255) }
    }
}
