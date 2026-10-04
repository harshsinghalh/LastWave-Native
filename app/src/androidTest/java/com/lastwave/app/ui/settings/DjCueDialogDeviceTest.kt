package com.lastwave.app.ui.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.lastwave.app.playback.DjCuePreferences
import com.lastwave.app.playback.DjCueProfile
import com.lastwave.app.playback.DjCueMode
import com.lastwave.app.playback.DjHighlightFocus
import com.lastwave.app.playback.DjHighlightSpacing
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
        compose.onNode(hasSetTextAction()).performScrollTo().performTextReplacement("2:99")
        compose.onNodeWithText("Save").assertIsNotEnabled()
        assertEquals(165_000L, DjCuePreferences.read(context).cueMs)
    }

    @Test fun savePersistsCueAndEnabledMode() {
        var enabledCallback = false
        var dismissed = false
        show(onEnable = { enabledCallback = true }, onDismiss = { dismissed = true })
        compose.onNode(isToggleable()).performClick()
        compose.onNode(hasSetTextAction()).performScrollTo().performTextReplacement("0:10")
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
        compose.onNode(hasSetTextAction()).performScrollTo().performTextReplacement("0:10")
        compose.onNodeWithText("Cancel").performClick()
        assertEquals(DjCueProfile(), DjCuePreferences.read(context))
    }

    @Test fun automaticQuestionsPersistAndTimedFieldsReturn() {
        show()
        compose.onNode(isToggleable()).performClick()
        compose.onNodeWithText("Automatic highlights").performScrollTo().performClick()
        compose.onNodeWithText("Vocal-led lifts").performScrollTo().performClick()
        compose.onNodeWithText("Rare (60 seconds apart)").performScrollTo().performClick()
        compose.onNodeWithText("Timed cue").performScrollTo().performClick()
        compose.onNode(hasSetTextAction()).assertExists()
        compose.onNodeWithText("Automatic highlights").performScrollTo().performClick()
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle {
            val p = DjCuePreferences.read(context)
            assertTrue(p.enabled)
            assertEquals(DjCueMode.HIGHLIGHTS, p.mode)
            assertEquals(DjHighlightFocus.VOCALS, p.focus)
            assertEquals(DjHighlightSpacing.RARE, p.spacing)
            assertEquals(1_500L, p.rampMs)
            assertEquals(.8f, p.after, 0f)
        }
    }

    @Test fun previousDefaultsUpgradeButCustomValuesSurvive() {
        val raw = context.getSharedPreferences("lastwave_dj_cue", 0)
        raw.edit().clear().putLong("ramp", 2_000).putFloat("after", .9f).commit()
        assertEquals(1_500L, DjCuePreferences.read(context).rampMs)
        assertEquals(.8f, DjCuePreferences.read(context).after, 0f)
        raw.edit().putLong("ramp", 4_000).putFloat("after", .65f).commit()
        assertEquals(4_000L, DjCuePreferences.read(context).rampMs)
        assertEquals(.65f, DjCuePreferences.read(context).after, 0f)
    }

    @Test fun layaChoiceAndQuestionsPersistWithoutChangingTimedDefaults() {
        show()
        compose.onNode(isToggleable()).performClick()
        compose.onNodeWithText("Laya AI highlights").performScrollTo().performClick()
        compose.onNodeWithText("Bass-led drops").performScrollTo().performClick()
        compose.onNodeWithText("Rare (60 seconds apart)").performScrollTo().performClick()
        compose.onNodeWithText("Save").performClick()
        compose.runOnIdle {
            val p = DjCuePreferences.read(context)
            assertEquals(DjCueMode.LAYA, p.mode)
            assertEquals(DjHighlightFocus.BEATS, p.focus)
            assertEquals(DjHighlightSpacing.RARE, p.spacing)
            assertEquals(.50f, p.layaThreshold, 0f)
            assertEquals(1_500L, p.rampMs)
            assertEquals(.8f, p.after, 0f)
        }
    }
}
