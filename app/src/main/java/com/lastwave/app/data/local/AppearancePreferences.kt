package com.lastwave.app.data.local

import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey

enum class GlassStyle(val label: String, val key: String) {
    VASO("Vaso", "vaso"), LASTWAVE("LastWave", "lastwave");
}

enum class GlassControl(val label: String, val key: String, val min: Float, val max: Float) {
    BLUR("Frost", "blur", 0f, 24f),
    DEPTH("Lens depth", "depth", -2.5f, 2.5f),
    DISPERSION("Light dispersion", "dispersion", 0f, 1.5f),
    OPACITY("Surface opacity", "opacity", 0.08f, 0.85f),
    HIGHLIGHT("Rim highlight", "highlight", 0f, 1f),
    TINT("Accent tint", "tint", 0f, 0.4f),
    ROUNDNESS("Corner radius", "roundness", 12f, 36f),
    SHADOW("Shadow depth", "shadow", 0f, 1f),
    SATURATION("Backdrop color", "saturation", 0.7f, 1.8f);

    fun safe(value: Float, fallback: Float): Float =
        if (value.isFinite()) value.coerceIn(min, max) else fallback
}

data class GlassProfile(
    val blur: Float, val depth: Float, val dispersion: Float,
    val opacity: Float, val highlight: Float, val tint: Float,
    val roundness: Float, val shadow: Float, val saturation: Float,
) {
    fun value(control: GlassControl): Float = when (control) {
        GlassControl.BLUR -> blur
        GlassControl.DEPTH -> depth
        GlassControl.DISPERSION -> dispersion
        GlassControl.OPACITY -> opacity
        GlassControl.HIGHLIGHT -> highlight
        GlassControl.TINT -> tint
        GlassControl.ROUNDNESS -> roundness
        GlassControl.SHADOW -> shadow
        GlassControl.SATURATION -> saturation
    }

    companion object {
        fun defaults(style: GlassStyle): GlassProfile = when (style) {
            GlassStyle.VASO -> GlassProfile(2f, 1.2f, 0.45f, 0.18f, 0.8f, 0.04f, 26f, 0.35f, 1.1f)
            GlassStyle.LASTWAVE -> GlassProfile(12f, 1f, 0f, 0.36f, 0.55f, 0.09f, 30f, 0.25f, 1.5f)
        }
    }
}

enum class GlassPreset(val label: String) {
    BALANCED("Balanced"), CRYSTAL("Crystal"), FROSTED("Frosted");

    fun profile(style: GlassStyle): GlassProfile {
        val base = GlassProfile.defaults(style)
        return when (this) {
            BALANCED -> base
            CRYSTAL -> base.copy(blur = 0.5f, depth = 1.5f, dispersion = 0.7f, opacity = 0.12f, highlight = 0.9f)
            FROSTED -> base.copy(blur = 20f, depth = 0.35f, dispersion = 0f, opacity = 0.52f, highlight = 0.65f)
        }
    }
}

enum class AppearanceBackground(val label: String) { AURORA("Aurora"), PRISM("Prism"), SUNSET("Sunset"), PLAIN("Plain") }
enum class InterfaceSpacing(val label: String, val padding: Float) { COMPACT("Compact", 12f), BALANCED("Balanced", 16f), ROOMY("Roomy", 22f) }
enum class DockStyle(val label: String) { FLOATING("Floating"), CLASSIC("Full width") }
enum class VideoCardSize(val label: String, val width: Float) { SMALL("Small", 220f), MEDIUM("Medium", 300f), LARGE("Large", 380f) }
enum class AppearanceOption { BACKGROUND, SPACING, DOCK, VIDEO_SIZE, REDUCED_MOTION, REDUCE_TRANSPARENCY, HIGH_CONTRAST, GLASS_CARDS, TEXT_SCALE }

data class AppearancePrefs(
    val style: GlassStyle = GlassStyle.VASO,
    val vaso: GlassProfile = GlassProfile.defaults(GlassStyle.VASO),
    val lastwave: GlassProfile = GlassProfile.defaults(GlassStyle.LASTWAVE),
    val background: AppearanceBackground = AppearanceBackground.AURORA,
    val spacing: InterfaceSpacing = InterfaceSpacing.BALANCED,
    val dock: DockStyle = DockStyle.FLOATING,
    val videoSize: VideoCardSize = VideoCardSize.MEDIUM,
    val reducedMotion: Boolean = false,
    val reduceTransparency: Boolean = false,
    val highContrast: Boolean = false,
    val glassCards: Boolean = true,
    val textScale: Float = 1f,
) {
    val profile: GlassProfile get() = profile(style)
    fun profile(style: GlassStyle): GlassProfile = if (style == GlassStyle.VASO) vaso else lastwave
    val permitsBackdrop: Boolean get() = !reduceTransparency && !highContrast
}

/** Uses the existing theme DataStore; each control is updated atomically, never from a stale UI copy. */
internal object AppearanceCodec {
    val styleKey = stringPreferencesKey("lw_glass_style")
    private fun numberKey(style: GlassStyle, control: GlassControl) = floatPreferencesKey("lw_glass_${style.key}_${control.key}")
    private fun textKey(option: AppearanceOption) = stringPreferencesKey("lw_appearance_${option.name.lowercase()}")
    private fun flagKey(option: AppearanceOption) = booleanPreferencesKey("lw_appearance_${option.name.lowercase()}")
    private val scaleKey = floatPreferencesKey("lw_appearance_text_scale")

    private inline fun <reified T : Enum<T>> enum(value: String?, fallback: T): T =
        enumValues<T>().firstOrNull { it.name == value } ?: fallback

    fun read(p: Preferences): AppearancePrefs = AppearancePrefs(
        style = GlassStyle.entries.firstOrNull { it.key == p.readSafely(styleKey) } ?: GlassStyle.VASO,
        vaso = profile(p, GlassStyle.VASO), lastwave = profile(p, GlassStyle.LASTWAVE),
        background = enum(p.readSafely(textKey(AppearanceOption.BACKGROUND)), AppearanceBackground.AURORA),
        spacing = enum(p.readSafely(textKey(AppearanceOption.SPACING)), InterfaceSpacing.BALANCED),
        dock = enum(p.readSafely(textKey(AppearanceOption.DOCK)), DockStyle.FLOATING),
        videoSize = enum(p.readSafely(textKey(AppearanceOption.VIDEO_SIZE)), VideoCardSize.MEDIUM),
        reducedMotion = p.readSafely(flagKey(AppearanceOption.REDUCED_MOTION)) ?: false,
        reduceTransparency = p.readSafely(flagKey(AppearanceOption.REDUCE_TRANSPARENCY)) ?: false,
        highContrast = p.readSafely(flagKey(AppearanceOption.HIGH_CONTRAST)) ?: false,
        glassCards = p.readSafely(flagKey(AppearanceOption.GLASS_CARDS)) ?: true,
        textScale = (p.readSafely(scaleKey) ?: 1f).let { if (it.isFinite()) it.coerceIn(0.85f, 1.5f) else 1f },
    )

    private fun profile(p: Preferences, style: GlassStyle): GlassProfile {
        val defaults = GlassProfile.defaults(style)
        fun n(c: GlassControl) = c.safe(p.readSafely(numberKey(style, c)) ?: defaults.value(c), defaults.value(c))
        return GlassProfile(n(GlassControl.BLUR), n(GlassControl.DEPTH), n(GlassControl.DISPERSION),
            n(GlassControl.OPACITY), n(GlassControl.HIGHLIGHT), n(GlassControl.TINT),
            n(GlassControl.ROUNDNESS), n(GlassControl.SHADOW), n(GlassControl.SATURATION))
    }

    fun setControl(p: MutablePreferences, style: GlassStyle, control: GlassControl, value: Float) {
        p[numberKey(style, control)] = control.safe(value, GlassProfile.defaults(style).value(control))
    }

    fun setPreset(p: MutablePreferences, style: GlassStyle, preset: GlassPreset) {
        val profile = preset.profile(style)
        GlassControl.entries.forEach { setControl(p, style, it, profile.value(it)) }
    }

    fun resetProfile(p: MutablePreferences, style: GlassStyle) {
        GlassControl.entries.forEach { p.remove(numberKey(style, it)) }
    }

    fun setOption(p: MutablePreferences, option: AppearanceOption, value: String) {
        when (option) {
            AppearanceOption.BACKGROUND -> p[textKey(option)] = AppearanceBackground.valueOf(value).name
            AppearanceOption.SPACING -> p[textKey(option)] = InterfaceSpacing.valueOf(value).name
            AppearanceOption.DOCK -> p[textKey(option)] = DockStyle.valueOf(value).name
            AppearanceOption.VIDEO_SIZE -> p[textKey(option)] = VideoCardSize.valueOf(value).name
            AppearanceOption.TEXT_SCALE -> p[scaleKey] = value.toFloat().let { if (it.isFinite()) it.coerceIn(0.85f, 1.5f) else 1f }
            else -> p[flagKey(option)] = value.toBooleanStrict()
        }
    }
}
