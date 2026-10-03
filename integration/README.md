# LayaWave Android integration

The application keeps LastWave-Native's original Compose frontend, music player, settings, playlists and library. A Videos tab uses the same header, glass cards, themes and floating navigation. NewTube v1.15.0 supplies video discovery, accounts, playback, comments, live chat, downloads and casting. The full video settings tree, choice dialogs and global settings search now use LastWave's actual Compose components and shared appearance preferences. NewTube retains the underlying setting actions and saved values. Its player, account sheets and other secondary video panels still use upstream layouts in this preview.

One `laya-policy` module owns persistent preferences, local rules, the bounded HTTP queue, result cache, reasons and session reveals. Video feed items, native recommendations, comments and chat use that module. `backend/service.py` owns actual Laya inference and prompt compilation. No model weights or Python runtime are included in the APK.

## Build

Use JDK 21, Android platform 37, build tools 37.0.0, NDK 29.0.14206865 and CMake 3.22.1.

```sh
git clone --branch laya-newtube-android --recurse-submodules https://github.com/harshsinghalh/LastWave-Native.git
cd LastWave-Native
python3 tools/prepare_newtube.py
./gradlew :laya-policy:testDebugUnitTest :app:assembleDebug
```

The NewTube submodule is pinned; the three reviewed patches also modify its SharedModules and MediaServiceCore submodules. `tools/prepare_newtube.py` verifies the root commit and applies each patch once. It must run after checkout, including in Android Studio workspaces. SDK installations naming the platform `android-37.0` need an `android-37` alias, as shown in the CI workflow.

CI builds and publishes a debug-signed preview APK on this integration branch. Production releases need a stable signing key. `LAYA_BASE_URL` is an optional default service address at build time; users can change it in settings. Metadata processing requires consent before any content is sent. Upstream addon services still require their own existing credentials; the public build does not invent those credentials.

## Filtering behavior

- Excluded creators and phrases override allowed creators. Allowed creators bypass topic and required phrase preferences, while safety checks still apply.
- ANY accepts one selected topic; ALL requires all selected topics; NONE removes topic restrictions. Empty topics are unrestricted.
- Configurable filters can be paused in settings or by a prompt. Exact control commands such as `disable filters`, `enable filters`, `hide spam` and `allow abuse` work locally, including without a server or metadata consent. Compound commands are applied together; ambiguous or free-form commands require Laya. Control commands retain the existing semantic preference and topics. Explicit metadata safety remains active while configurable filters are paused.
- Pending remote decisions mask text and artwork. Service failures keep local rules active and report local-only operation.
- Reasons describe text metadata decisions. Reveal actions are temporary; the Videos tab also offers Undo reveal.
- Unsupported truth claims stay visible. An optional operator-curated, expiring evidence file can support exact content IDs; Laya is not treated as a fact-checking source.

This preview does not scan video frames or audio, and model decisions can be wrong. Multilingual real-model testing detected a Hindi insult below the conservative blocking threshold. Native video player and remaining secondary-panel UI parity with LastWave, physical-device playback, casting and USB audio need broader device validation before a stable release. Back closes a video when the LastWave shell has no native video mini-player host; Android PiP remains available through NewTube.

See `../backend/README.md` for deployment and `../verification/` for the recorded checks.

Saving a service address now checks `/healthz` off the UI thread and requires a ready Laya engine with both English and multilingual models. The readiness request sends no content metadata. Content and prompt requests require consent and do not follow redirects to another address.

The merged app preserves NewTube's cleartext transport setting for local TV discovery (DIAL devices advertise HTTP endpoints). Laya service addresses are separately validated as HTTPS and are checked again before every request; metadata requests never follow redirects. Physical-TV discovery and playback still require device testing. Feed-request generations are separate from policy generations, so changing a filter during a request does not discard its returned videos.
