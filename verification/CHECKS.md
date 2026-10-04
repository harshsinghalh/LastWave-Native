# LayaWave integration verification

The APK uses the actual LastWave-Native music frontend and the pinned NewTube v1.15.0 engine. The video feed, Laya controls, video settings tree and settings search use LastWave components and its theme. The video player, account, comment and casting panels retain NewTube layouts. This is a debug-signed preview.

## Automated checks

- 27 shared Laya policy tests: passed, with zero failures, errors or skipped tests. These include the 16 local policy/contract tests and 11 client integration tests using a local HTTPS server and Android preferences. They cover consent revocation, stale requests, prompt edits, response identity, redirects, readiness and evidence expiry. See `client-preview-12.json` and the [JUnit reports](https://github.com/harshsinghalh/LastWave-Native/actions/runs/37148697974/artifacts/11283391135).
- 23 backend API/policy contract tests: passed. These include evidence expiry, removal and replacement. Their named inference test double does not measure model accuracy.
- 229 inherited LastWave unit tests passed in the earlier verification. These were not rerun in this continuation; see `continuation-unit-checks.json` for the distinction.
- Real pinned Laya weights: English and multilingual startup, content evaluation and prompt compilation passed in the earlier model smoke checks. See the JSON records here, including disabling and enabling filters with prompts. These checks were not rerun for preview 12; the SDK, model pins and inference heads did not change.

The Hindi smoke input remained visible because its abuse score fell below the conservative threshold. Inference is not a guarantee of content classification accuracy.

## Runtime checks

Verified release: [laya-preview-12](https://github.com/harshsinghalh/LastWave-Native/releases/tag/laya-preview-12). Its [build and Android runtime gate](https://github.com/harshsinghalh/LastWave-Native/actions/runs/37148697974) passed before publication. APK source commit: `2bbe94c08be46af0f2325d417055624328444429`.

APK SHA-256: `9d872ef2ab92b51e7f01974e5383c678b99e334c08276c1593005df4ea31397a`. Size: 172,841,862 bytes. The downloaded APK matches both GitHub's asset digest and the published checksum file.


GitHub's accelerated API 35 x86_64 Android emulator verifies:

- Installation and combined Application/MainActivity startup.
- LastWave music and video navigation.
- Shared Laya settings and the saved master toggle after reopening.
- Enable/disable prompt commands without a service URL.
- Playback choices and gesture switches in LastWave's settings frontend, including reopening the pages and reading the original NewTube gesture preference.
- The video settings tree and global settings search, including navigation to Captions.

The build workflow gates publication on these checks and verifies that NewTube's media context was initialized. UI screenshots and application/crash logs are stored in the [runtime artifact](https://github.com/harshsinghalh/LastWave-Native/actions/runs/37148697974/artifacts/11283496238). The exact checklist is also in `android-preview-12.json`.

Preview 12 returned 17 NewTube home rows; its crash buffer was empty and no missing media-context error was recorded. YouTube's player warmup returned LOGIN_REQUIRED with a sign-in challenge on the CI network. Successful online playback is therefore not established by this CI run and needs device/network validation.

Some returned video metadata lacked a title, so the UI used its generic fallback. The grid excludes entries without a playable video ID and uses NewTube's title/author accessors, including its subtitle fallback for author names. Metadata and player access still depend on YouTube responses.

Earlier previews exposed an upstream update banner and missing media preference initialization. Those issues were fixed in the source. Use the newest preview that passes the build workflow.

## Remaining validation and deployment

The live Laya service is not deployed: the existing server's host/domain/access method was not supplied. The APK uses explicit local rules and recognized toggle prompts without a service. Semantic filtering and free-form prompt compilation require an HTTPS Laya service and consent to metadata processing. Saving a service address checks that both Laya models are ready without sending content or prompt metadata.

Laya requests enforce HTTPS addresses and disable redirects. NewTube's local HTTP transport remains available for TV discovery; physical casting has not been verified. A feed refresh now has a separate generation from policy evaluation, so settings changes during a load do not discard its content response.

Requests capture the saved policy, destination and consent together. Changing any of these cancels obsolete metadata calls and drops their queued work; an old prompt response cannot replace newer edits. Client decisions have a five-minute cache limit and respect earlier evidence expiry. The backend excludes expired or removed evidence on subsequent requests. Existing rows are reevaluated when refreshed; evidence changes are not pushed into an already displayed feed.

CI previews use ephemeral debug signing keys. Installing over an earlier CI preview can fail with an incompatible-signature error; uninstall that earlier preview first, after preserving any settings you need.

A stable release also needs a persistent signing key and broader physical-device playback, casting and USB-audio validation. This record does not claim every upstream feature or codec was tested.
