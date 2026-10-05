package com.lastwave.app.playback

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.platform.app.InstrumentationRegistry
import com.lastwave.app.data.local.SettingsPreferences
import java.io.File
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class DjEnergyPreferencesDeviceTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    @Before fun reset() { context.getSharedPreferences("lastwave_dj_cue", 0).edit().clear().commit() }

    private fun withSettings(block: suspend (SettingsPreferences) -> Unit) = runBlocking {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        val store = PreferenceDataStoreFactory.create(scope = scope) {
            File(context.cacheDir, "dj-energy-${System.nanoTime()}.preferences_pb")
        }
        try { withTimeout(10_000) { block(SettingsPreferences(store, context)) } }
        finally { scope.cancel() }
    }

    @Test fun oldTimedSettingsBecomeAutomaticAndTurningEnergyOffStaysOff() = withSettings { settings ->
        val raw = context.getSharedPreferences("lastwave_dj_cue", 0)
        raw.edit().putBoolean("enabled", true).putInt("mode", 0).putLong("cue", 600_000)
            .putLong("ramp", 30_000).putFloat("after", .2f).commit()
        settings.migrateDjEnergyProgram()
        assertTrue(settings.settings.first { it.djEnergyEnabled }.djEnergyEnabled)
        assertEquals(DjEnergyProfile(enabled = true), DjEnergyPreferences.read(context))
        settings.setDjEnergyEnabled(false)
        settings.settings.first { !it.djEnergyEnabled }
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
        assertFalse(raw.contains("mode"))
        assertFalse(raw.contains("cue"))
    }

    @Test fun freshInstallNeedsOnlyOneSwitchAndUsesRequestedPreset() = withSettings { settings ->
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
        settings.setDjEnergyEnabled(true)
        assertTrue(settings.settings.first { it.djEnergyEnabled }.djEnergyEnabled)
        assertEquals(DjEnergyProfile(enabled = true), DjEnergyPreferences.read(context))
        assertEquals(1_500L, DjEnergyPreferences.read(context).rampMs)
        assertEquals(.7f, DjEnergyPreferences.read(context).before, 0f)
        assertEquals(.8f, DjEnergyPreferences.read(context).after, 0f)
    }

    @Test fun migrationPreservesBitPerfectPriority() = withSettings { settings ->
        DjEnergyPreferences.setEnabled(context, true)
        settings.setBitPerfectEnabled(true)
        settings.settings.first { it.isBitPerfectEnabled }
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
        assertTrue(settings.settings.first().isBitPerfectEnabled)
    }
}
