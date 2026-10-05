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

    @Test fun enabledLayaMigratesOnceAndTurningEnergyOffStaysOff() = withSettings { settings ->
        val original = DjCueProfile(enabled = true, mode = DjCueMode.LAYA, cueMs = 120_000,
            before = .4f, after = .6f, rampMs = 3_000)
        DjCuePreferences.save(context, original)
        settings.migrateDjEnergyProgram()
        assertTrue(settings.settings.first { it.djEnergyEnabled }.djEnergyEnabled)
        assertEquals(original, DjCuePreferences.read(context))
        settings.setDjEnergyEnabled(false)
        settings.settings.first { !it.djEnergyEnabled }
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
    }

    @Test fun freshInstallKeepsEnergyOffAndUsesRequestedPreset() = withSettings { settings ->
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
        val profile = DjCuePreferences.read(context)
        assertEquals(DjCueMode.HIGHLIGHTS, profile.mode)
        assertEquals(165_000L, profile.cueMs)
        assertEquals(1_500L, profile.rampMs)
        assertEquals(.7f, profile.before, 0f)
        assertEquals(.8f, profile.after, 0f)
    }

    @Test fun migrationPreservesBitPerfectPriority() = withSettings { settings ->
        DjCuePreferences.save(context, DjCueProfile(enabled = true, mode = DjCueMode.LAYA))
        settings.setBitPerfectEnabled(true)
        settings.settings.first { it.isBitPerfectEnabled }
        settings.migrateDjEnergyProgram()
        assertFalse(settings.settings.first().djEnergyEnabled)
        assertTrue(settings.settings.first().isBitPerfectEnabled)
    }
}
