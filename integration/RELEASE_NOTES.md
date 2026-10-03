LayaWave Android integration preview: LastWave's complete music app plus NewTube v1.15.0 video playback and shared Laya filtering controls.

Install the APK on Android 10 or later (arm64 or x86_64). This preview uses Android's debug signing key. A production signing identity must be configured before a stable release.

Configure your deployed Laya service's HTTPS address and allow metadata processing under Settings → Laya Feed Control. Without that service, explicit local metadata rules remain available; semantic filtering and prompt application require the backend.

The backend implementation, deployment files and exact Android integration source are in this release's commit. Filtering considers text metadata, offers reasons and reveal actions, and does not guarantee visual content detection or factual verification. NewTube's native video player and video settings remain part of the preview; the main shell and music frontend are LastWave's original UI.
