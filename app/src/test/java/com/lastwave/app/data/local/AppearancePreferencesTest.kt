package com.lastwave.app.data.local

import android.app.Application
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], manifest = Config.NONE, application = Application::class)
class AppearancePreferencesTest {
    @get:Rule val folder = TemporaryFolder()

    @Test fun switchingStylesKeepsIndependentTuningAndSurvivesReopening() = runTest {
        val file = folder.newFile("theme.preferences_pb")
        val firstScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = firstScope, produceFile = { file })
        val prefs = ThemePreferences(store)
        prefs.setGlassControl(GlassStyle.VASO, GlassControl.DEPTH, -1.4f)
        prefs.setGlassControl(GlassStyle.LASTWAVE, GlassControl.BLUR, 19f)
        prefs.setGlassStyle(GlassStyle.LASTWAVE)
        prefs.setAppearanceOption(AppearanceOption.TEXT_SCALE, "1.25")
        prefs.setManualAccent("#4D83E8", "#4D83E8")
        firstScope.coroutineContext[Job]!!.cancelAndJoin()
        val secondScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        try {
            val reopened = ThemePreferences(PreferenceDataStoreFactory.create(scope = secondScope, produceFile = { file }))
            val saved = reopened.prefs.first()
            assertEquals(GlassStyle.LASTWAVE, saved.appearance.style)
            assertEquals(-1.4f, saved.appearance.vaso.depth, 0.001f)
            assertEquals(19f, saved.appearance.lastwave.blur, 0.001f)
            assertEquals(1.25f, saved.appearance.textScale, 0.001f)
            assertEquals("#4D83E8", saved.accentColor)
        } finally { secondScope.coroutineContext[Job]!!.cancelAndJoin() }
    }

    @Test fun comfortAndMasterTogglesPreserveProfilesAndOtherThemePreferences() = runTest {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val file = folder.newFile("comfort.preferences_pb")
        try {
            val prefs = ThemePreferences(PreferenceDataStoreFactory.create(scope = scope, produceFile = { file }))
            prefs.setGlassPreset(GlassStyle.VASO, GlassPreset.CRYSTAL)
            prefs.setAppearanceOption(AppearanceOption.REDUCE_TRANSPARENCY, "true")
            prefs.setAppearanceOption(AppearanceOption.HIGH_CONTRAST, "true")
            prefs.setAppearanceOption(AppearanceOption.DOCK, DockStyle.CLASSIC.name)
            prefs.setLiquidGlass(false)
            val saved = prefs.prefs.first()
            assertFalse(saved.liquidGlass)
            assertFalse(saved.appearance.permitsBackdrop)
            assertEquals(GlassPreset.CRYSTAL.profile(GlassStyle.VASO), saved.appearance.vaso)
            assertEquals(DockStyle.CLASSIC, saved.appearance.dock)
            prefs.setLiquidGlass(true)
            assertEquals(saved.appearance, prefs.prefs.first().appearance)
        } finally { scope.coroutineContext[Job]!!.cancelAndJoin() }
    }

    @Test fun corruptOrUnknownValuesUseFiniteSafeDefaults() {
        val p = mutablePreferencesOf(
            stringPreferencesKey("lw_glass_style") to "unknown",
            floatPreferencesKey("lw_glass_vaso_depth") to Float.NaN,
            floatPreferencesKey("lw_glass_lastwave_blur") to 999f,
            floatPreferencesKey("lw_appearance_text_scale") to Float.POSITIVE_INFINITY,
            stringPreferencesKey("lw_appearance_spacing") to "future-value",
            stringPreferencesKey("lw_appearance_high_contrast") to "wrong-type",
        )
        val decoded = AppearanceCodec.read(p)
        assertEquals(GlassStyle.VASO, decoded.style)
        assertEquals(GlassProfile.defaults(GlassStyle.VASO).depth, decoded.vaso.depth, 0f)
        assertEquals(24f, decoded.lastwave.blur, 0f)
        assertEquals(1f, decoded.textScale, 0f)
        assertEquals(InterfaceSpacing.BALANCED, decoded.spacing)
        assertFalse(decoded.highContrast)
    }

    @Test fun resettingOneStyleLeavesTheOtherStyleAndLayoutAlone() {
        val p = mutablePreferencesOf()
        AppearanceCodec.setControl(p, GlassStyle.VASO, GlassControl.BLUR, 21f)
        AppearanceCodec.setControl(p, GlassStyle.LASTWAVE, GlassControl.BLUR, 17f)
        AppearanceCodec.setOption(p, AppearanceOption.BACKGROUND, AppearanceBackground.SUNSET.name)
        AppearanceCodec.resetProfile(p, GlassStyle.VASO)
        val decoded = AppearanceCodec.read(p)
        assertEquals(GlassProfile.defaults(GlassStyle.VASO), decoded.vaso)
        assertEquals(17f, decoded.lastwave.blur, 0f)
        assertEquals(AppearanceBackground.SUNSET, decoded.background)
    }

    @Test fun twoControlUpdatesDoNotReplaceEachOtherWithAStaleProfile() {
        val p = mutablePreferencesOf()
        AppearanceCodec.setControl(p, GlassStyle.VASO, GlassControl.BLUR, 11f)
        AppearanceCodec.setControl(p, GlassStyle.VASO, GlassControl.TINT, 0.25f)
        val decoded = AppearanceCodec.read(p)
        assertEquals(11f, decoded.vaso.blur, 0f)
        assertEquals(0.25f, decoded.vaso.tint, 0f)
    }
}
