package com.lastwave.app.ui.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lastwave.app.playback.DjCuePreferences
import com.lastwave.app.playback.DjCueMode
import com.lastwave.app.playback.DjHighlightFocus
import com.lastwave.app.playback.DjHighlightSpacing
import com.lastwave.app.playback.LayaModel
import kotlin.math.roundToInt

@Composable
internal fun DjCueDialog(onDismiss: () -> Unit, onEnable: () -> Unit) {
    val context = LocalContext.current
    var profile by remember { mutableStateOf(DjCuePreferences.read(context)) }
    val laya = remember { LayaModel.get(context) }
    val layaState by laya.state.collectAsState()
    var cue by remember { mutableStateOf("${profile.cueMs / 60000}:${(profile.cueMs / 1000 % 60).toString().padStart(2, '0')}") }
    val parts = cue.trim().split(":")
    val minutes = parts.getOrNull(0)?.toLongOrNull()
    val seconds = parts.getOrNull(1)?.toLongOrNull()
    val validCue = if (parts.size == 2 && minutes != null && minutes in 0..1439 && seconds != null && seconds in 0..59)
        (minutes * 60 + seconds) * 1000 else null
    AlertDialog(onDismissRequest = onDismiss, title = { Text("DJ Cue") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Choose a timed cue, audio highlights or Laya AI highlights.")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Enable DJ Cue")
                Switch(profile.enabled, { profile = profile.copy(enabled = it) })
            }
            Text("How should the DJ boost start?")
            DjChoice("Timed cue", profile.mode == DjCueMode.TIMED) { profile = profile.copy(mode = DjCueMode.TIMED) }
            DjChoice("Automatic highlights", profile.mode == DjCueMode.HIGHLIGHTS) { profile = profile.copy(mode = DjCueMode.HIGHLIGHTS) }
            DjChoice("Laya AI highlights", profile.mode == DjCueMode.LAYA) { profile = profile.copy(mode = DjCueMode.LAYA) }
            if (profile.mode != DjCueMode.TIMED) {
                Text("Which moments should stand out?")
                DjChoice("Strong energy rises", profile.focus == DjHighlightFocus.ENERGY) { profile = profile.copy(focus = DjHighlightFocus.ENERGY) }
                DjChoice("Bass-led drops", profile.focus == DjHighlightFocus.BEATS) { profile = profile.copy(focus = DjHighlightFocus.BEATS) }
                DjChoice("Vocal-led lifts", profile.focus == DjHighlightFocus.VOCALS) { profile = profile.copy(focus = DjHighlightFocus.VOCALS) }
                Text("How often should boosts happen?")
                DjChoice("Occasional (35 seconds apart)", profile.spacing == DjHighlightSpacing.OCCASIONAL) { profile = profile.copy(spacing = DjHighlightSpacing.OCCASIONAL) }
                DjChoice("Rare (60 seconds apart)", profile.spacing == DjHighlightSpacing.RARE) { profile = profile.copy(spacing = DjHighlightSpacing.RARE) }
                Text("After 10 seconds of listening, sustained energy rises can trigger a five-second highlight. Volume dips briefly to 70%, rises to 80% within 1.5 seconds, then returns to normal. Ordinary passages keep their original level. Quiet, steady and short tracks may have no boost.")
                if (profile.mode == DjCueMode.LAYA) {
                    Text("Laya scores the measured energy, bass and vocal-range activity using your choices above. No training dataset or account is required. This zero-shot score estimates a section's highlight appeal; it has not been calibrated against listener popularity.")
                    Text("One-time download: 424 MB. After download, inference runs on your phone and audio stays on your phone. Missing, failed or late decisions leave that section unchanged.")
                    Text(layaState.message)
                    if (layaState.downloading) {
                        LinearProgressIndicator(progress = { (layaState.downloadedBytes.toFloat() / LayaModel.MODEL_BYTES).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
                        TextButton(onClick = { laya.cancelDownload() }) { Text("Cancel download") }
                    } else if (!layaState.ready) {
                        TextButton(enabled = !layaState.checking, onClick = { laya.download() }) { Text("Download Laya (424 MB)") }
                    }
                    layaState.lastProbability?.let { Text("Last highlight score: ${(it * 100).roundToInt()}%") }
                    DjCueSlider("Minimum Laya score", profile.layaThreshold * 100, 40f..95f, "%") { profile = profile.copy(layaThreshold = it / 100) }
                } else {
                    Text("Selection uses on-device audio energy and frequency activity. Vocal activity includes instruments in the same range. No song or audio is uploaded.")
                }
            } else {
                Text("One saved cue repeats on each track. Pause and seek follow the song's timeline.")
                OutlinedTextField(cue, { cue = it }, label = { Text("Cue time (minutes:seconds)") },
                singleLine = true, isError = validCue == null, modifier = Modifier.fillMaxWidth())
                if (validCue == null) Text("Enter a valid time, such as 2:45.", color = MaterialTheme.colorScheme.error)
                DjCueSlider("Before cue volume", profile.before * 100, 0f..100f, "%") { profile = profile.copy(before = it / 100) }
                DjCueSlider("After cue volume", profile.after * 100, 0f..100f, "%") { profile = profile.copy(after = it / 100) }
                DjCueSlider("Transition", profile.rampMs / 1000f, .1f..30f, "s") { profile = profile.copy(rampMs = (it * 1000).toLong()) }
                TextButton(onClick = { profile = profile.copy(before = .7f, after = .8f, rampMs = 1_500) }) { Text("Use 1.5 s / 80% preset") }
            }
            DjCueSlider("Energy gain", profile.energyDb, 0f..6f, "dB") { profile = profile.copy(energyDb = it) }
            DjCueSlider("Vocal presence", profile.vocalsDb, 0f..6f, "dB") { profile = profile.copy(vocalsDb = it) }
            DjCueSlider("Beat / bass emphasis", profile.beatsDb, 0f..6f, "dB") { profile = profile.copy(beatsDb = it) }
            Text("Volume is relative to the current output: 70% means a 30% amplitude reduction. Vocal presence also affects instruments in the same frequency range. Peak protection can reduce the boost on loud songs.")
            Text("Saving enabled DJ Cue switches off the separate DJ Energy mode. Re-enabling DJ Energy suspends DJ Cue. Also suspended during Bit-Perfect, USB Exclusive, System Audio Effects, casting, and spatial playback. Timed mode keeps short songs at the before-cue level.")
        }
    }, confirmButton = {
        TextButton(enabled = profile.mode != DjCueMode.TIMED || validCue != null, onClick = {
            DjCuePreferences.save(context, profile.copy(cueMs = validCue ?: profile.cueMs))
            if (profile.enabled) onEnable()
            onDismiss()
        }) { Text("Save") }
    }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
private fun DjChoice(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().selectable(selected = selected, onClick = onClick),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = null)
        Text(label)
    }
}

@Composable
private fun DjCueSlider(label: String, value: Float, range: ClosedFloatingPointRange<Float>, unit: String, onChange: (Float) -> Unit) {
    Text("$label: ${(value * 10).roundToInt() / 10f} $unit")
    Slider(value = value, onValueChange = onChange, valueRange = range)
}
