# LastWave DJ 4.6.0

An optional Laya inference mode is available at Settings → Audio → Output & Loudness → DJ Cue → Laya AI highlights. Choose an energy, bass or vocal-range focus, a 35 or 60 second minimum spacing, and a minimum model score (default 50%). Download the model once, then save with DJ Cue enabled.

## Playback

The existing timed cue and signal-based automatic highlights remain available. Everything is off by default. A sustained rise after ten seconds of listening becomes a candidate. Laya receives categorical descriptions of measured power, change relative to the track baseline, and bass/vocal-range frequency activity. Its real two-option decision head scores highlight versus ordinary passage. No custom dataset, training, audio upload or inference account is needed.

The quantized model is a 424,348,081-byte download, separate from the APK. Inference runs on a background worker with two CPU threads. Enabling AI playback warms the real session during the detector’s initial listening period, before a candidate’s deadline, without presenting the warm-up result as a track decision. At most one decision is pending; repeated feature layouts use a bounded cache. The native audio thread never waits for inference. Decisions must match the current track/seek generation and candidate, arrive within five seconds of rendered audio, and find the section still energetic. Missing, failed, rejected or late decisions produce no boost. Switching modes and Bit-Perfect invalidate candidates. The model session is released after leaving AI mode for 30 seconds.

An approved event briefly dips to 70%, reaches 80% in 1.5 seconds, applies the saved energy/presence/bass gains, then returns to ordinary playback by five seconds. Event starts remain at least 35/60 seconds apart. These percentages are PCM amplitude multipliers, not the Android system volume or perceived loudness. The limiter may reduce peaks. Existing DJ Energy, casting, USB Exclusive, System Audio Effects, Bit-Perfect and spatial playback retain priority.

This zero-shot score estimates musical highlight appeal. It is not a calibrated estimate of actual listener popularity. Frequency activity does not isolate vocal stems. Local synthetic checks and device parity tests verify execution and gating, not musical preference accuracy on a labelled listening dataset.

## Model provenance

Laya: https://github.com/receptron/laya (Apache-2.0), source v0.3.4 supplied for this change. The pinned quantized ONNX conversion is https://huggingface.co/tozp/laya-onnx/tree/0d1f7ebf46a3ea04ec4424df602f96ddefb66766, derived from the ModernBERT-large typed decision model. Downloaded model SHA-256: `d337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469`. Prepared model SHA-256: `1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1`.

The conversion has fixed internal 512-token reshapes. Inputs are correctly padded to 512 with masked padding. `tools/generate_laya_tokens.py` freezes exact upstream tokenizer inputs for all 324 combinations of built-in questions and feature bins; it does not precompute predictions. `tools/verify_laya_model.py` runs the actual model and generates independent CPU comparison fixtures. Android uses ONNX Runtime 1.22.0. First preparation re-encodes the 248 signed INT8 weight and zero-point tensors as UINT8 (U8U8). Adding 128 to both a weight and its zero point preserves every dequantized value; no parameters, scales, graph operations or questions change. A pinned byte manifest allows bounded-memory conversion, cancellation and final SHA-256 verification. Desktop scores are exactly unchanged by this representation change, as are the independently measured Android scores.

The representation change did not eliminate differences between desktop and Android probabilities. A separate Java Android diagnostic confirmed identical model files and input-tensor hashes, tested both model encodings, and compared optimization levels, thread counts, deterministic execution and prepacking: https://github.com/harshsinghalh/LastWave-Native/actions/runs/37231042093 . With the ALL optimizer, Android ranked the steady reference above the energy rise. BASIC and disabled graph optimization agreed on each platform and restored the intended quiet < steady < rise ordering on Android, although absolute scores still differed from desktop. The app therefore pins BASIC optimization, retaining the graph’s explicit operations. The 50% default means the two-choice model favors highlight over ordinary passage; users can raise it. No popularity calibration is claimed.

Device tests record desktop comparison scores but check Android probabilities against the independent Java Android measurements in `tests/dj/laya_android_reference.json`, rather than assuming cross-runtime numerical equality. They additionally verify real quiet rejection, rise approval, score ordering, exact cache reuse, warm-up behavior, and an actual two-tone measured PCM rise → model approval → packaged JNI boost. Reference scores occur only in test assets, never in production selection. A phone’s probabilities and latency can differ from emulator measurements. Late decisions remain rejected.

ONNX Runtime documents U8U8 as a way to avoid U8S8 saturation on some x64 kernels: https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html#when-and-why-do-i-need-to-try-u8u8 . That documentation motivated the lossless representation conversion; it does not establish saturation as the cause of this model’s observed cross-runtime differences.

## Installing and updating your fork

The application ID is `com.lastwave.dj` and the display name is LastWave DJ. It installs alongside `com.lastwave.app`; the original signing key is unnecessary. Your original app's data is separate. Update checks point to your fork's GitHub releases. Future updates to this fork must use your own permanent key. The private signing backup is supplied separately and must never be committed or uploaded as a public GitHub artifact.

Fork certificate SHA-256: `5a698e3c68c88fbeba18c3390c07771632f59ec8436308d502d6d635c0be549e`.

For automated release signing, configure repository Actions secrets `SIGNING_KEY` (base64 of your PKCS12 file), `RELEASE_STORE_PASSWORD`, `RELEASE_KEY_PASSWORD`, and `RELEASE_KEY_ALIAS` (`lastwave_dj`). The signing backup contains the values privately. `RELEASE_CERT_SHA256` is public and binds the native signature check to this fork's certificate. Private upstream backend credentials are not supplied by this fork; services requiring them still require legitimate credentials.

The CI artifact is an intermediate compiled APK when signing secrets are absent. The delivered APK is re-signed with the permanent private fork key and independently verified. Do not install intermediate CI APKs over the permanent-key release.
