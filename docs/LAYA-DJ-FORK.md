# LastWave DJ Energy fork 4.6.1

DJ Energy is the single master switch at Settings → Audio → Output & Loudness. Open **DJ Energy options** to choose **Timed cue**, **Automatic highlights** or **Laya AI highlights**. Saving Laya enables DJ Energy itself. The separate DJ Cue control has been consolidated into DJ Energy.

The requested preset is **70% low volume → 80% high volume in 1.5 seconds**. Timed mode starts at **2:45** by default and follows media position, preserving pause, seek and playback-speed behavior. Low volume, high volume and transition controls now work in all three modes. Existing custom settings are retained.

Automatic and Laya modes leave ordinary passages at their original level. A sustained rise after ten seconds of listening becomes a candidate. Laya's real pretrained decision head scores measured power, baseline contrast and bass/vocal-range activity. Choose energy, bass-led or vocal-led focus, 35/60-second spacing and a minimum model score (default 50%). No custom training dataset, audio upload or inference account is needed. This score estimates highlight appeal, not measured listener popularity. Frequency activity does not isolate vocal stems.

An approved event briefly enters the low level, completes the saved transition, holds the high level for three seconds, then returns to normal over half a second. At the default transition the event lasts five seconds. Energy, presence and bass gains follow the transition. These percentages are PCM amplitude multipliers relative to current output, not Android system volume or perceived loudness; boosts and peak protection can change the final level.

Native app playback gates timed and selective processing with DJ Energy and does not use the old three-second 30/60/90% delay. Turning the switch off cancels candidates and briefly releases active processing. Missing, rejected, failed, late or stale decisions do not trigger highlights. Inference stays off the audio thread. Bit-Perfect, System Audio Effects, USB Exclusive, casting and spatial playback keep their bypass behavior. Existing EQ, clarity, library and playback controls are preserved.

An enabled cue from 4.6.0 migrates once into DJ Energy, preserving its mode and edited values. Migration respects Bit-Perfect and does not re-enable DJ Energy after it is turned off. Fresh installs keep DJ Energy off; enabling it uses automatic highlights until another mode is chosen.

## Laya model

Select Laya AI highlights and download the 424,348,081-byte model once. It then runs offline on a two-thread CPU ONNX Runtime session. The model is not bundled in the APK. This quantized pretrained ModernBERT-large typed-decision model has approximately 421 million parameters. Slower phones may skip candidates when inference misses the deadline.

Laya source: https://github.com/receptron/laya (Apache-2.0), source v0.3.4 supplied for this change. Pinned model conversion: https://huggingface.co/tozp/laya-onnx/tree/0d1f7ebf46a3ea04ec4424df602f96ddefb66766. Download SHA-256: `d337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469`.

`LayaWeights` performs a lossless, bounded-memory U8S8 → U8U8 conversion for Android, verifies SHA-256 `1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1`, and never changes the mathematical weights. Production uses BASIC graph optimization, masked 512-token padding and the real two-option decision head. The 324 bundled question layouts contain tokenized inputs, not precomputed predictions. Warm-up does not publish a track score. A bounded cache stores actual inference results.

Independent Android references are recorded separately from desktop references because the platforms produce different absolute probabilities. Device tests run real inference, validate ordering and cache behavior, and require actual model approval to affect packaged JNI PCM. Native tests measure the default and custom timing envelopes across sample rates, stale approval rejection, master gating and bypasses. Device tests also cover settings, migration and release startup. Every application change receives a fresh full CI build and test run.

## Installation and signing

Package ID `com.lastwave.dj`, label LastWave DJ, Android 10+, version 4.6.1/code 30. It installs beside the original LastWave and updates the previous permanently signed DJ fork. Its data is separate from the original app.

Native package/certificate protection is retained with the fork's public certificate pinned. Certificate SHA-256: `5a698e3c68c88fbeba18c3390c07771632f59ec8436308d502d6d635c0be549e`. The private key is not committed. Keep the existing private signing backup for future updates. CI APKs are signed again with the permanent fork key for delivery. Services requiring upstream private backend credentials need legitimate credentials; these are not supplied by the open-source fork.
