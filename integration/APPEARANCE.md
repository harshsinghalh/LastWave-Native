# Native appearance architecture

The user-provided vaso-main.zip identifies Vaso 1.0.0 by huozhi (https://github.com/huozhi/vaso), declared MIT in its package and README. Its browser implementation uses an SVG displacement map, a convex squircle/Snell-law profile, spectral samples and specular edges. Android uses a native adaptation of that optical method through Backdrop 2.0.1's public cached runtime-shader API; it does not embed React, a browser or a DOM clone.

ThemePreferences owns the existing DataStore. AppearanceCodec adds separate typed keys for Vaso and LastWave profiles, with finite range checks and tolerant reads. Each control writes only its own key inside edit; it cannot overwrite another simultaneous control using a stale UI copy. Changing styles does not copy or delete either profile. A profile reset removes only that style's material keys. Existing explicit glass opt-outs are honored; new installations use Vaso glass by default.

ThemeRepository exposes appearance state alongside the existing palette, font and theme. LastWaveTheme publishes this state through LocalAppearance, adds to the device font scale and captures a background-only layer. This layer is a sibling of the UI, preventing self-capture recursion or refraction of foreground labels. Player and navigation overlays retain their existing dedicated content sources and use the same material profile.

LiquidGlass selects the native Vaso shader or the original LastWave lens recipe. Prismatic or concave custom materials use the Vaso shader in either style. The shader is compiled once per drawing node and updates uniforms as controls change. Blur, tint, highlight, opacity, saturation and shadow also come from the profile. There is no ambient animation or network-dependent appearance setting. Card radius and spacing are applied in LiquidGlassCard; video card width uses the existing adaptive grid. The navigation layout switches between a floating dock and the original full-width bar.

Reduced motion removes glass press deformation and navigation-selection springs/page animations; other upstream screen/player animations retain their original behavior. Reduced transparency and high contrast suppress the backdrop renderer while retaining the selected material settings. High contrast also strengthens foreground surface text. Text scale multiplies the device's font scale. The studio uses wrapping choices, scalable rows, insets and a 760dp content limit.

Capability gates retain safe surfaces on Android 10/11, low-RAM or non-accelerated devices. Android 12 has blur and highlights; cached AGSL optical refraction is available on Android 13+. No effect is required for settings, playback controls or navigation to remain usable.

The change concentrates on appearance. Existing content policies, inference and backend deployment are unchanged. It does not claim that every native NewTube Android View panel has been converted into Compose, or that all upstream device features were tested.
