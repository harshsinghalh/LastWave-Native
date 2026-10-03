# LayaWave integration verification

The APK uses the actual LastWave-Native frontend and the pinned NewTube v1.15.0 engine. This is a debug-signed preview, with native video screens retaining NewTube layouts.

## Automated checks

- 229 inherited LastWave unit tests: passed, no failures or skipped tests after the media initialization fix.
- 5 shared Android Laya policy tests: passed.
- 20 backend API/policy contract tests: passed. Their named inference test double does not measure model accuracy.
- Real pinned Laya weights: English and multilingual startup, content evaluation and prompt compilation passed. See the JSON records here, including disabling and enabling filters with prompts.

The Hindi smoke input remained visible because its abuse score fell below the conservative threshold. Inference is not a guarantee of content classification accuracy.

## Runtime checks

Corrected release: [laya-preview-6](https://github.com/harshsinghalh/LastWave-Native/releases/tag/laya-preview-6). Its [clean build and Android runtime gate](https://github.com/harshsinghalh/LastWave-Native/actions/runs/37131142633) passed. Source commit: `f5a68dda6949060bcdd596472981142a9338e9d8`.

APK SHA-256: `277b16b2e9cd72350309ceccb8b54cf077de8b6778276a99c96cdd0022afe1cb`.


GitHub's accelerated API 35 x86_64 Android emulator verifies installation, combined Application/MainActivity startup, LastWave music and video navigation, shared Laya settings, and preference persistence after reopening. The build workflow gates publication on these checks and verifies that NewTube's media context was initialized. UI screenshots and application/crash logs are stored with the workflow artifact.

The corrected run returned 17 NewTube home rows; its crash buffer was empty and the missing media-context errors disappeared. YouTube's player warmup returned LOGIN_REQUIRED with "Sign in to confirm you're not a bot" on the CI network. Music stream prefetch also encountered upstream challenge failures. Successful online playback is therefore not established by this CI run and needs device/network validation.

Earlier previews exposed an upstream update banner and missing media preference initialization. Those issues were fixed in the source. Use the newest preview that passes the build workflow.

## Remaining validation and deployment

The live Laya service is not deployed: the existing server's host/domain/access method was not supplied. The APK currently uses explicit local rules until an HTTPS service is connected and metadata processing is enabled. Semantic filtering and prompt application require that service.

A stable release also needs a persistent signing key and broader physical-device playback, casting and USB-audio validation. This record does not claim every upstream feature or codec was tested.
