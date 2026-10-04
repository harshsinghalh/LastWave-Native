package com.lastwave.app.ui.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.lastwave.app.playback.DjCuePreferences
import com.lastwave.app.playback.DjCueProfile
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test

class DjCueDialogDeviceTest {
    @get:Rule val compose = createComposeRule()
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun reset() { DjCuePreferences.save(context, DjCueProfile()) }

    private fun show(onEnable: () -> Unit = {}, onDismiss: () -> Unit = {}) {
        compose.setContent { MaterialTheme { DjCueDialog(onDismiss = onDismiss, onEnable = onEnable) } }
    }

    @Test fun invalidTimeCannotBeSaved() {
        show()
        compose.onNode(hasSetTextAction()).performTextReplacement("2:99")
        compose.onNodeWithText("Save").assertIsNotEnabled()
        assertEquals(165_000L, DjCuePreferences.read(context).cueMs)
    }

    @Test fun savePersistsCueAndEnabledMode() {
        var enabledCallback = false
        var dismissed = false
        show(onEnable = { enabledCallback = true }, onDismiss = { dismissed = true })
        compose.onNode(isToggleable()).performClick()
        compose.onNode(hasSetTextAction()).performTextReplacement("0:10")
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle {
            val saved = DjCuePreferences.read(context)
            assertTrue(saved.enabled)
            assertEquals(10_000L, saved.cueMs)
            assertTrue(enabledCallback)
            assertTrue(dismissed)
        }
    }

    @Test fun cancelDiscardsDraft() {
        show()
        compose.onNode(isToggleable()).performClick()
        compose.onNode(hasSetTextAction()).performTextReplacement("0:10")
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(DjCueProfile(), DjCuePreferences.read(context))
    }
}
