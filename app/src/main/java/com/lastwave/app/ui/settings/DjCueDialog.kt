package com.lastwave.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lastwave.app.playback.DjCuePreferences
import kotlin.math.roundToInt

@Composable
internal fun DjCueDialog(onDismiss: () -> Unit, onEnable: () -> Unit) {
    val context = LocalContext.current
    var profile by remember { mutableStateOf(DjCuePreferences.read(context)) }
    var cue by remember { mutableStateOf("${profile.cueMs / 60000}:${(profile.cueMs / 1000 % 60).toString().padStart(2, '0')}") }
    val parts = cue.trim().split(":")
    val minutes = parts.getOrNull(0)?.toLongOrNull()
    val seconds = parts.getOrNull(1)?.toLongOrNull()
    val validCue = if (parts.size == 2 && minutes != null && minutes in 0..1439 && seconds != null && seconds in 0..59)
        (minutes * 60 + seconds) * 1000 else null
    AlertDialog(onDismissRequest = onDismiss, title = { Text("DJ Cue") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("One saved cue repeats on each track. Pause and seek follow the song's timeline.")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Enable DJ Cue")
                Switch(profile.enabled, { profile = profile.copy(enabled = it) })
            }
            OutlinedTextField(cue, { cue = it }, label = { Text("Cue time (minutes:seconds)") },
                singleLine = true, isError = validCue == null, modifier = Modifier.fillMaxWidth())
            if (validCue == null) Text("Enter a valid time, such as 2:45.", color = MaterialTheme.colorScheme.error)
            DjCueSlider("Before cue volume", profile.before * 100, 0f..100f, "%") { profile = profile.copy(before = it / 100) }
            DjCueSlider("After cue volume", profile.after * 100, 0f..100f, "%") { profile = profile.copy(after = it / 100) }
            DjCueSlider("Transition", profile.rampMs / 1000f, .1f..30f, "s") { profile = profile.copy(rampMs = (it * 1000).toLong()) }
            DjCueSlider("Energy gain", profile.energyDb, 0f..6f, "dB") { profile = profile.copy(energyDb = it) }
            DjCueSlider("Vocal presence", profile.vocalsDb, 0f..6f, "dB") { profile = profile.copy(vocalsDb = it) }
            DjCueSlider("Beat / bass emphasis", profile.beatsDb, 0f..6f, "dB") { profile = profile.copy(beatsDb = it) }
            Text("Volume is relative to the current output: 70% means a 30% amplitude reduction. Vocal presence also affects instruments in the same frequency range. Peak protection can reduce the boost on loud songs.")
            Text("Saving an enabled cue switches off automatic DJ Energy. Re-enabling DJ Energy suspends the cue. Also suspended during Bit-Perfect, USB Exclusive, System Audio Effects, casting, and spatial playback. Songs shorter than the cue keep the before-cue level.")
        }
    }, confirmButton = {
        TextButton(enabled = validCue != null, onClick = {
            DjCuePreferences.save(context, profile.copy(cueMs = validCue!!))
            if (profile.enabled) onEnable()
            onDismiss()
        }) { Text("Save") }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
private fun DjCueSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, unit: String, onChange: (Float) -> Unit) {
    Text("$label: ${(value * 10).roundToInt() / 10f} $unit")
    Slider(value = value, onValueChange = onChange, valueRange = range)
}
