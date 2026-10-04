package com.lastwave.laya.probe;

import android.content.Context;
import android.util.Log;
import androidx.test.platform.app.InstrumentationRegistry;
import ai.onnxruntime.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.security.MessageDigest;
import java.util.*;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;

/** Diagnostic execution of identical inputs across CPU optimization settings. */
public class RuntimeProbe {
    private static String hash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[262144];
            int n;
            while ((n = input.read(buffer)) >= 0) digest.update(buffer, 0, n);
        }
        return hex(digest.digest());
    }
    private static String hex(byte[] bytes) {
        StringBuilder text = new StringBuilder();
        for (byte b : bytes) text.append(String.format(Locale.ROOT, "%02x", b & 255));
        return text.toString();
    }
    @Test public void compareIdenticalInputsAndRuntimeSettings() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String json;
        try (InputStream input = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("dj_tokens.json")) {
            json = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        JSONObject bank = new JSONObject(json);
        String[] keys = {"0.0.1.0.0", "0.2.2.2.2", "0.2.1.2.2"};
        OrtEnvironment env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions.OptLevel[] levels = {
            OrtSession.SessionOptions.OptLevel.ALL_OPT,
            OrtSession.SessionOptions.OptLevel.BASIC_OPT,
            OrtSession.SessionOptions.OptLevel.NO_OPT,
            OrtSession.SessionOptions.OptLevel.ALL_OPT,
            OrtSession.SessionOptions.OptLevel.ALL_OPT,
            OrtSession.SessionOptions.OptLevel.ALL_OPT
        };
        for (String fileName : new String[]{"unsigned.onnx", "original.onnx"}) {
            File model = new File(target.getFilesDir(), fileName);
            String actualHash = hash(model);
            assertEquals(fileName.equals("unsigned.onnx") ?
                "1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1" :
                "d337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469", actualHash);
            Log.i("LayaProbe", "MODEL " + fileName + " " + actualHash);
            for (int setting = 0; setting < levels.length; setting++) {
                if (fileName.equals("original.onnx") && setting >= 3) break;
                try (OrtSession.SessionOptions options = new OrtSession.SessionOptions()) {
                    int threads = setting == 3 ? 1 : 2;
                    options.setIntraOpNumThreads(threads);
                    options.setInterOpNumThreads(1);
                    options.addConfigEntry("session.intra_op.allow_spinning", "0");
                    options.setOptimizationLevel(levels[setting]);
                    if (setting == 4) options.setDeterministicCompute(true);
                    if (setting == 5) options.addConfigEntry("session.disable_prepacking", "1");
                    try (OrtSession session = env.createSession(model.getAbsolutePath(), options)) {
                        for (String key : keys) {
                            JSONObject entry = bank.getJSONObject("entries").getJSONObject(key);
                            JSONArray tokens = entry.getJSONArray("ids");
                            long[] ids = new long[512], mask = new long[512], markers = new long[2];
                            Arrays.fill(ids, bank.getLong("pad_id"));
                            for (int i = 0; i < tokens.length(); i++) { ids[i] = tokens.getLong(i); mask[i] = 1; }
                            for (int i = 0; i < 2; i++) markers[i] = entry.getJSONArray("markers").getLong(i);
                            ByteBuffer wire = ByteBuffer.allocate(512 * 16 + 16);
                            for (long value : ids) wire.putLong(value);
                            for (long value : mask) wire.putLong(value);
                            for (long value : markers) wire.putLong(value);
                            String inputHash = hex(MessageDigest.getInstance("SHA-256").digest(wire.array()));
                            Map<String, OnnxTensor> input = new LinkedHashMap<>();
                            try {
                                input.put("input_ids", OnnxTensor.createTensor(env, new long[][]{ids}));
                                input.put("attention_mask", OnnxTensor.createTensor(env, new long[][]{mask}));
                                input.put("marker_pos", OnnxTensor.createTensor(env, new long[][]{markers}));
                                input.put("marker_mask", OnnxTensor.createTensor(env, new boolean[][]{{true, true}}));
                                input.put("qtype", OnnxTensor.createTensor(env, new long[]{0}));
                                long start = System.nanoTime();
                                try (OrtSession.Result result = session.run(input)) {
                                    float[] logits = ((float[][])result.get("logits").get().getValue())[0];
                                    double probability = 1 / (1 + Math.exp(((double)logits[1] - logits[0]) / bank.getDouble("temperature")));
                                    assertTrue(Double.isFinite(probability));
                                    Log.i("LayaProbe", fileName + " setting=" + setting + " opt=" + levels[setting] +
                                        " threads=" + threads + " key=" + key + " inputs=" + inputHash +
                                        " logits=" + Arrays.toString(logits) + " p=" + probability +
                                        " seconds=" + (System.nanoTime() - start) / 1e9);
                                }
                            } finally { for (OnnxTensor tensor : input.values()) tensor.close(); }
                        }
                    }
                }
            }
        }
    }
}
