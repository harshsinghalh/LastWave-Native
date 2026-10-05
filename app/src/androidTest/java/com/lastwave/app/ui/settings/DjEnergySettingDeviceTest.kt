package com.lastwave.app.ui.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.lastwave.app.playback.DjEnergyStatus
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test

class DjEnergySettingDeviceTest {
    @get:Rule val compose = createComposeRule()

    @Test fun oneSwitchWorksWithoutCueModeDownloadOrSave() {
        var changes = 0
        compose.setContent {
            var enabled by remember { mutableStateOf(false) }
            MaterialTheme {
                DjEnergySetting(enabled, DjEnergyStatus("Listening for highlights…"), {
                    enabled = it
                    changes++
                })
            }
        }
        compose.onAllNodes(isToggleable()).assertCountEquals(1)
        compose.onNode(isToggleable()).assertIsOff().performClick().assertIsOn()
        compose.onNodeWithText("DJ Energy").assertExists()
        compose.onNodeWithText("Listening for highlights…").assertExists()
        for (text in listOf("Timed cue", "DJ Energy options", "Automatic highlights", "Laya AI highlights",
            "Download Laya (424 MB)", "Save", "Cue time (minutes:seconds)")) {
            compose.onNodeWithText(text).assertDoesNotExist()
        }
        compose.onNode(isToggleable()).performClick().assertIsOff()
        compose.runOnIdle { assertEquals(2, changes) }
    }

    @Test fun showsActualBoostStatusInTheOriginalCard() {
        compose.setContent { MaterialTheme {
            DjEnergySetting(true, DjEnergyStatus("DJ boost active • 80%", 80, 1), {})
        } }
        compose.onNodeWithText("DJ boost active • 80%").assertExists()
        compose.onAllNodes(isToggleable()).assertCountEquals(1)
    }
}
