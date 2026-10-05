package com.lastwave.app.playback

import android.Manifest
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.rule.GrantPermissionRule
import com.lastwave.app.MainActivity
import com.lastwave.app.ui.auth.AuthViewModel
import com.lastwave.app.ui.navigation.Screen
import com.lastwave.app.ui.player.PlayerViewModel
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.first
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import kotlin.math.*

/** Real application, Hilt graph, Settings screen, MusicPlayer, decoder and output. */
class DjAppWorkflowDeviceTest {
    @get:Rule(order = 0) val permissions = GrantPermissionRule.grant(Manifest.permission.POST_NOTIFICATIONS)
    @get:Rule(order = 1) val compose = createAndroidComposeRule<MainActivity>()

    private fun screenshot(name: String) {
        val ui = InstrumentationRegistry.getInstrumentation().uiAutomation
        android.os.ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand("mkdir -p /sdcard/Download/dj-energy-ui")).use { it.readBytes() }
        android.os.ParcelFileDescriptor.AutoCloseInputStream(ui.executeShellCommand("screencap -p /sdcard/Download/dj-energy-ui/$name.png")).use { it.readBytes() }
    }

    @Test fun originalSettingsSwitchControlsAutomaticMusicPlayerBoostOffline() = runBlocking {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val wave = File(context.cacheDir, "dj-app-workflow.wav")
        val frames = 48_000 * 60
        val data = ByteBuffer.allocate(44 + frames * 4).order(ByteOrder.LITTLE_ENDIAN)
        data.put("RIFF".toByteArray()); data.putInt(36 + frames * 4); data.put("WAVEfmt ".toByteArray())
        data.putInt(16); data.putShort(1); data.putShort(2); data.putInt(48_000); data.putInt(192_000)
        data.putShort(4); data.putShort(16); data.put("data".toByteArray()); data.putInt(frames * 4)
        repeat(frames) { n ->
            val amp = if (n >= 48_000 * 30) .16 else .03
            val x = (amp * 32_000 * (sin(n * 90.0 * 2 * PI / 48_000) + sin(n * 900.0 * 2 * PI / 48_000))).roundToInt().toShort()
            data.putShort(x); data.putShort(x)
        }
        wave.writeBytes(data.array())
        lateinit var player: MusicPlayer
        var playerCreated = false
        val settings = compose.activity.settingsPreferences
        try {
            withContext(Dispatchers.Main) {
                val models = ViewModelProvider(compose.activity)
                models[AuthViewModel::class.java].continueAsGuest()
                player = models[PlayerViewModel::class.java].player
                playerCreated = true
            }
            settings.setDjEnergyEnabled(false)
            settings.setBitPerfectEnabled(true)
            withContext(Dispatchers.Main) {
                player.play(PlayableTrack("DJ validation", "Offline", playbackUrl = wave.absolutePath,
                    playbackMimeType = "audio/wav", durationMs = 60_000), startRadio = false)
                compose.activity.appRouteNavigator.get().navigateTo(Screen.Settings.route)
            }
            withTimeout(20_000) { while (!player.state.value.isPlaying) delay(50) }
            compose.waitUntil(30_000) { compose.onAllNodesWithText("Audio & Playback").fetchSemanticsNodes().isNotEmpty() }
            compose.onNodeWithText("Audio & Playback").performClick()
            compose.onNodeWithText("DJ Energy").performScrollTo()
            screenshot("01-original-audio-settings")
            compose.onNodeWithText("DJ Energy").performClick()
            withTimeout(10_000) { settings.settings.first { it.djEnergyEnabled && !it.isBitPerfectEnabled } }
            for (text in listOf("Timed cue", "DJ Energy options", "Download Laya (424 MB)", "Save")) {
                compose.onNodeWithText(text).assertDoesNotExist()
            }
            var sawLow = false
            var sawHigh = false
            withTimeout(45_000) {
                while (!sawHigh) {
                    val status = player.djEnergyStatus.value
                    if (status.boosts > 0 && status.volumePercent <= 72) sawLow = true
                    if (sawLow && status.boosts > 0 && status.volumePercent in 79..80) sawHigh = true
                    delay(20)
                }
            }
            assertTrue("The actual Settings switch must enable the low-to-high boost in MusicPlayer", sawLow && sawHigh)
            assertTrue("Automatic DJ must keep the track playing", player.state.value.isPlaying)
            screenshot("02-automatic-boost-active")
            compose.onNodeWithText("DJ Energy").performClick()
            withTimeout(10_000) {
                settings.settings.first { !it.djEnergyEnabled }
                while (player.djEnergyStatus.value.volumePercent != 100 || player.djEnergyStatus.value.canPreview) delay(50)
            }
            assertTrue("Turning DJ Energy off must preserve normal playback", player.state.value.isPlaying)
            screenshot("03-dj-off-playback-continues")
            player.pause()
            withTimeout(5_000) { while (player.state.value.isPlaying) delay(50) }
            assertEquals(1, android.provider.Settings.Global.getInt(context.contentResolver, "airplane_mode_on", 0))
        } finally {
            if (playerCreated) player.pause()
            settings.setDjEnergyEnabled(false)
            settings.setBitPerfectEnabled(false)
            wave.delete()
        }
    }
}
