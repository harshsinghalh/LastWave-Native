# LastWave DJ Energy 4.7.0

Install the APK and turn on **Settings → Audio → DJ Energy**. There is exactly one automatic switch. No cue, mode selection, options dialog, model download, account or Save step is required.

The interface, player, lyrics, home screens, navigation, notification scrobbler and widgets are restored from the supplied LastWave 4.2.2 source (commit `3c8d3a28a745519fd03bbc846a0b3ca7b24fe6fc`). A guard compares 152 UI/resource/widget files against that release; only the two settings files add the single DJ switch and connect its playback status. The application's fork label is retained.

## Playback

DJ Energy watches decoded PCM for sustained energy rises or strong energetic plateaus after ten seconds of listening. It leaves ordinary passages at their original level. Highlights briefly dip to **70%**, rise to **80%** over **1.5 seconds**, add energy/vocal-range/bass emphasis, hold for three seconds and return smoothly to normal. Events are at least 35 seconds apart, with each plateau assessed once. These are relative PCM amplitude levels; equalization and peak protection affect actual loudness.

The production controller follows the active crossfade engine. Turning DJ Energy on clears conflicting direct-output settings and restores the current track's native mixer. Turning it off, pausing, seeking and switching tracks respect the actual decoded audio state. Casting and spatial output retain their bypass behavior.

The real quantized Laya model is **inside the APK**. On first use, the app verifies and prepares its bundled weights in the background; no network connection is made for model setup. While it prepares, native audio analysis keeps selection available. Once warm, Laya decides whether detected candidates should be boosted. If a phone takes over five seconds to score a candidate, the sustained-energy detector handles that candidate instead of leaving the feature inactive. Late decisions cannot change a later track/section. Laya scores highlight appeal from measured energy and frequency activity; it does not measure listener popularity or separate vocal stems.

Old cue, mode and custom transition values are ignored. The requested 70%/80%/1.5-second automatic preset applies to both fresh and upgraded installations. The enabled flag is retained, and explicitly turning it off stays off.

## Model and build

The pinned model has 424,348,081 bytes. Build command:

```sh
python3 tools/download_laya_model.py app/src/main/assets/laya/model.onnx
./gradlew :app:assembleRelease
```

Gradle refuses to package a build without the model. CI verifies the model checksum inside the release APK, runs native and JVM tests, and installs the debug APK in airplane mode without provisioning a model separately. Android tests exercise actual ONNX inference, JNI PCM, the production coordinator, a real Media3 player, seeks, handoffs, migration and the single-switch UI.

Source: https://github.com/receptron/laya (MIT). Pinned weights: https://huggingface.co/tozp/laya-onnx/tree/0d1f7ebf46a3ea04ec4424df602f96ddefb66766. Original download SHA-256: `d337ce1b1cbca907a4063223517af6db7e89f5c9e8d6a2f6a289babc256f4469`; losslessly prepared Android SHA-256: `1e8906f3ce8551f0c9e153c740505b6c99946d47db6fb69b9c87f16da7ec55d1`.

## Installation

Package `com.lastwave.dj`, Android 10+, version **4.7.0**, code **32**. Install alongside the original app or update the previously permanently signed DJ fork. Signing certificate SHA-256 `5a698e3c68c88fbeba18c3390c07771632f59ec8436308d502d6d635c0be549e`; the private key remains outside the repository. The delivery APK uses that same permanent key. Upstream private services still require their legitimate credentials.
