package com.lastwave.app.playback

import android.content.Context
import java.io.File
import java.io.RandomAccessFile
import java.security.MessageDigest
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import org.json.JSONObject

/** Lossless U8S8 -> U8U8 storage conversion, avoiding saturating x86 INT8 kernels. */
internal object LayaWeights {
    suspend fun prepare(context: Context, file: File, verifiedHash: String? = null, onPreparing: () -> Unit = {}) {
        check(file.length() == LayaModel.MODEL_BYTES) { "Unexpected model size." }
        val digest = verifiedHash ?: sha256(file)
        if (digest == LayaModel.MODEL_SHA256) return
        check(digest == LayaModel.MODEL_DOWNLOAD_SHA256) { "Model integrity check failed." }
        val manifest = JSONObject(context.assets.open("laya/unsigned_weights.json").bufferedReader().use { it.readText() })
        check(manifest.getString("input_sha256") == LayaModel.MODEL_DOWNLOAD_SHA256 &&
            manifest.getString("output_sha256") == LayaModel.MODEL_SHA256 &&
            manifest.getLong("size") == LayaModel.MODEL_BYTES) { "Invalid model conversion manifest." }
        onPreparing()
        val coroutine = currentCoroutineContext()
        RandomAccessFile(file, "rw").use { output ->
            val buffer = ByteArray(256 * 1024)
            val patches = manifest.getJSONArray("patches")
            repeat(patches.length()) { index ->
                coroutine.ensureActive()
                val patch = patches.getJSONObject(index)
                val dtype = patch.getLong("dtype")
                val tag = patch.getLong("tag")
                val start = patch.getLong("start")
                var remaining = patch.getLong("length")
                check(dtype in 0 until file.length() && start >= 0 && remaining > 0 &&
                    start + remaining <= file.length()) { "Invalid model conversion offset." }
                output.seek(dtype)
                check(output.readUnsignedByte() == 3) { "Unexpected model tensor type." }
                output.seek(dtype); output.writeByte(2) // TensorProto INT8 -> UINT8.
                if (tag >= 0) {
                    check(tag < file.length()) { "Invalid zero-point offset." }
                    output.seek(tag)
                    check(output.readUnsignedByte() == 42) { "Unexpected zero-point encoding." }
                    output.seek(tag); output.writeByte(74) // Packed int32_data -> raw_data; length stays fixed.
                }
                var position = start
                while (remaining > 0) {
                    coroutine.ensureActive()
                    val count = minOf(remaining, buffer.size.toLong()).toInt()
                    output.seek(position); output.readFully(buffer, 0, count)
                    for (i in 0 until count) buffer[i] = (buffer[i].toInt() xor 128).toByte()
                    output.seek(position); output.write(buffer, 0, count)
                    position += count; remaining -= count
                }
            }
            output.fd.sync()
        }
        check(sha256(file) == LayaModel.MODEL_SHA256) { "Prepared model integrity check failed." }
    }

    private suspend fun sha256(file: File): String {
        val coroutine = currentCoroutineContext()
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(256 * 1024)
            while (true) {
                coroutine.ensureActive()
                val count = input.read(buffer)
                if (count < 0) break
                digest.update(buffer, 0, count)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it.toInt() and 255) }
    }
}
