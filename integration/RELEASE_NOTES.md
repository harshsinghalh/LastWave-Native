# Two glass styles, one appearance studio

This preview adds a native appearance studio to the LastWave music frontend and NewTube v1.15.0 integration.

- **Vaso:** clear optical glass with a curved bezel, native refraction, signed lens depth and adjustable spectral dispersion, adapted from the supplied Vaso source.
- **LastWave:** the native frosted glass recipe, with customizable blur, depth and light treatment.
- Each style saves its own nine material controls and Balanced, Crystal and Frosted presets. Switching styles preserves both profiles.
- A live preview includes interactive press feedback; controls update the app's shared surfaces.
- Choose theme, accent color (including custom hex, wallpaper and monochrome), four glass backdrops, navigation layout, card spacing, video card size and application/system font.
- Comfort settings include reduced glass/navigation motion, reduced transparency, high contrast and text scaling that respects the device font setting.
- Reset only the active glass style; other profiles, colors and layout choices stay saved.
- Open **Appearance studio** from the video header, video settings or **Settings → Appearance & Visuals**. It is also searchable in music settings.

Glass dressing applies to the LastWave Compose frontend: shared headers, cards, video settings, navigation and existing player controls. NewTube's native player and secondary Android View panels retain their native layouts. Android 13+ supports optical refraction; Android 12 supports blur/rims; Android 10/11, low-RAM devices and comfort modes use opaque fallbacks. Foreground labels are drawn above the glass effects.

Publication is gated on appearance DataStore tests and Android UI checks, including style/profile persistence after process restart, comfort settings and the Android 10 fallback. See the workflow artifacts for the precise verification scope. Physical-device playback/casting and every upstream feature are not established by these appearance checks.

This is a debug-signed preview. CI signing keys can differ between previews; preserve needed settings before uninstalling an incompatible older preview. Android 10+; arm64-v8a and x86_64.
