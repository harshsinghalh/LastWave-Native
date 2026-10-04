package com.lastwave.app.ui.appearance

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.lastwave.app.data.local.*
import com.lastwave.app.data.repository.ThemeUiState
import com.lastwave.app.ui.common.ExpressiveHeader
import com.lastwave.app.ui.common.HeaderActionIcon
import com.lastwave.app.ui.common.LiquidGlassCard
import com.lastwave.app.ui.theme.*
import kotlin.math.roundToInt

private enum class StudioTab(val title: String) { GLASS("Glass"), LAYOUT("Layout"), COMFORT("Comfort") }

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AppearanceStudioScreen(theme: ThemeUiState, viewModel: AppearanceViewModel, onBack: () -> Unit) {
    val prefs = theme.appearance
    var tab by rememberSaveable { mutableStateOf(StudioTab.GLASS) }
    var showReset by rememberSaveable { mutableStateOf(false) }
    val error by viewModel.error.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        ExpressiveHeader("Appearance", subtitle = "Your space. Your style.", onBack = onBack, actions = {
            HeaderActionIcon(Icons.Filled.RestartAlt, "Reset glass style") { showReset = true }
        })
        LazyColumn(
            modifier = Modifier.weight(1f).widthIn(max = 760.dp).fillMaxWidth().align(Alignment.CenterHorizontally),
            contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item {
                Text("Make it yours", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Text("Two takes on glass. Tune each one to the way you like to listen and watch.",
                    style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp))
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    GlassStyle.entries.forEach { style ->
                        StyleCard(style, prefs.style == style, Modifier.weight(1f)) { viewModel.style(style) }
                    }
                }
            }
            item { GlassPreview() }
            item {
                ToggleRow("Liquid glass", "Apply your selected style across the app", theme.liquidGlass, onChange = viewModel::enabled)
                Text("Changes save automatically. Each style keeps its own glass tuning.", style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    StudioTab.entries.forEach { t -> FilterChip(selected = tab == t, onClick = { tab = t }, label = { Text(t.title) }) }
                }
            }
            if (tab == StudioTab.GLASS) {
                item {
                    SectionTitle("${prefs.style.label} material", "Start with a preset, then make it your own.")
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassPreset.entries.forEach { preset ->
                            FilterChip(selected = prefs.profile == preset.profile(prefs.style),
                                onClick = { viewModel.preset(prefs.style, preset) }, label = { Text(preset.label) })
                        }
                    }
                    if (!prefs.permitsBackdrop) Text("Comfort settings are using opaque surfaces. Your glass tuning is saved.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                GlassControl.entries.forEach { control ->
                    item(key = control.key) {
                        val value = prefs.profile.value(control)
                        TuningSlider(control.label, controlDescription(control), value, control.min..control.max,
                            enabled = theme.liquidGlass && prefs.permitsBackdrop,
                            display = when (control) {
                                GlassControl.BLUR, GlassControl.ROUNDNESS -> "${value.roundToInt()} dp"
                                GlassControl.OPACITY, GlassControl.HIGHLIGHT, GlassControl.TINT, GlassControl.SHADOW -> "${(value * 100).roundToInt()}%"
                                else -> "%.2f".format(value)
                            }, onCommit = { viewModel.control(prefs.style, control, it) })
                    }
                }
            }
            if (tab == StudioTab.LAYOUT) {
                item { ChoiceGroup("Theme", ThemeMode.entries.toList(), theme.themeMode,
                    { when (it) { ThemeMode.SYSTEM -> "System"; ThemeMode.LIGHT -> "Light"; ThemeMode.DARK -> "Dark" } }, viewModel::mode) }
                item { AccentPicker(theme, viewModel) }
                item { ChoiceGroup("Glass backdrop", AppearanceBackground.entries.toList(), prefs.background, { it.label }) {
                    viewModel.option(AppearanceOption.BACKGROUND, it.name) } }
                item { ChoiceGroup("Navigation", DockStyle.entries.toList(), prefs.dock, { it.label }) {
                    viewModel.option(AppearanceOption.DOCK, it.name) } }
                item { ChoiceGroup("Card spacing", InterfaceSpacing.entries.toList(), prefs.spacing, { it.label }) {
                    viewModel.option(AppearanceOption.SPACING, it.name) } }
                item { ChoiceGroup("Video card size", VideoCardSize.entries.toList(), prefs.videoSize, { it.label }) {
                    viewModel.option(AppearanceOption.VIDEO_SIZE, it.name) } }
                item { ToggleRow("Glass cards", "Use glass for cards and video settings", prefs.glassCards) {
                    viewModel.option(AppearanceOption.GLASS_CARDS, it.toString()) } }
                item { ToggleRow("Application font", "LastWave's rounded typeface; turn off for the system font", theme.useCustomFont, onChange = viewModel::font) }
                item { ToggleRow("Black backgrounds", "A deeper black in dark mode", theme.amoled, onChange = viewModel::amoled, enabled = theme.themeMode != ThemeMode.LIGHT) }
            }
            if (tab == StudioTab.COMFORT) {
                item { SectionTitle("Easy on the eyes", "Keep the look you love, with less movement or more contrast.") }
                item { ToggleRow("Reduced motion", "No glass press stretch or animated navigation selection", prefs.reducedMotion) {
                    viewModel.option(AppearanceOption.REDUCED_MOTION, it.toString()) } }
                item { ToggleRow("Reduce transparency", "Opaque surfaces for clarity and lighter rendering", prefs.reduceTransparency) {
                    viewModel.option(AppearanceOption.REDUCE_TRANSPARENCY, it.toString()) } }
                item { ToggleRow("High contrast", "Solid surfaces with stronger text contrast", prefs.highContrast) {
                    viewModel.option(AppearanceOption.HIGH_CONTRAST, it.toString()) } }
                item { TuningSlider("Text size", "Adds to your device's font-size setting", prefs.textScale, 0.85f..1.5f,
                    display = "${(prefs.textScale * 100).roundToInt()}%", onCommit = { viewModel.option(AppearanceOption.TEXT_SCALE, it.toString()) }) }
            }
            item { Text("Vaso's optical glass, adapted for Android · LastWave's native frosted glass",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
    if (showReset) AlertDialog(onDismissRequest = { showReset = false },
        title = { Text("Reset ${prefs.style.label} glass?") },
        text = { Text("Restore this style's material defaults. Your other style, colors and layout stay saved.") },
        confirmButton = { TextButton(onClick = { viewModel.reset(prefs.style); showReset = false }) { Text("Reset style") } },
        dismissButton = { TextButton(onClick = { showReset = false }) { Text("Cancel") } })
    error?.let { message -> AlertDialog(onDismissRequest = viewModel::dismissError, title = { Text("Change not saved") },
        text = { Text(message) }, confirmButton = { TextButton(onClick = viewModel::dismissError) { Text("OK") } }) }
}

@Composable
private fun StyleCard(style: GlassStyle, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    val accent = MaterialTheme.colorScheme.primary
    Column(modifier.clip(shape).background(if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHigh)
        .border(if (selected) 2.dp else 1.dp, if (selected) accent else MaterialTheme.colorScheme.outlineVariant, shape)
        .selectable(selected = selected, role = Role.RadioButton, onClick = onClick).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Icon(if (style == GlassStyle.VASO) Icons.Filled.AutoAwesome else Icons.Filled.BlurOn, null,
                modifier = Modifier.size(28.dp), tint = accent)
            if (selected) Icon(Icons.Filled.CheckCircle, "Selected", tint = accent, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(16.dp))
        Text(style.label, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(if (style == GlassStyle.VASO) "Clear · Prismatic" else "Soft · Frosted", style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun GlassPreview() {
    val appearance = LocalAppearance.current
    val backdrop = rememberLayerBackdrop()
    val accent = MaterialTheme.colorScheme.primary
    val dark = LocalIsDarkTheme.current
    var playing by rememberSaveable { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().heightIn(min = 226.dp).clip(RoundedCornerShape(30.dp))) {
        Canvas(Modifier.matchParentSize().then(if (backdrop != null && isLiquidGlassBackdropSupported()) Modifier.layerBackdropCompat(backdrop) else Modifier)) {
            drawRect(Color(0xFF243A56))
            drawRect(Brush.linearGradient(if (dark) listOf(Color(0xFF426EC1), Color(0xFF9D6CA9), Color(0xFFC78564))
                else listOf(Color(0xFFB8D8EE), Color(0xFFD7BAE1), Color(0xFFF2D0AD))))
            drawCircle(Brush.radialGradient(listOf(Color(0xFFB2E0ED), Color.Transparent), Offset(size.width * 0.16f, size.height * 0.18f), size.width * 0.48f),
                radius = size.width * 0.48f, center = Offset(size.width * 0.16f, size.height * 0.18f))
            for (i in 0..6) drawLine(Color.White.copy(alpha = 0.2f), Offset(size.width * i / 6f, 0f), Offset(size.width * i / 6f - 40f, size.height), 1.5f)
        }
        CompositionLocalProvider(LocalLiquidGlassBackdrop provides backdrop) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("LIVE PREVIEW", style = MaterialTheme.typography.labelSmall, color = if (dark) Color.White else Color(0xFF304354))
                LiquidGlassCard(modifier = Modifier.fillMaxWidth(), contentColor = MaterialTheme.colorScheme.onSurface) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(52.dp).clip(RoundedCornerShape(16.dp)).background(Brush.linearGradient(listOf(accent, Color(0xFF50B9B4)))), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.GraphicEq, null, tint = Color.White)
                        }
                        Column(Modifier.weight(1f)) {
                            Text("A little more you", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("${appearance.style.label} · Your everyday mix", style = MaterialTheme.typography.bodySmall)
                        }
                        FilledTonalIconButton(onClick = { playing = !playing }) {
                            Icon(if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow, if (playing) "Pause preview" else "Play preview")
                        }
                    }
                    LinearProgressIndicator(progress = { if (playing) 0.64f else 0.36f }, modifier = Modifier.fillMaxWidth().padding(top = 16.dp), color = accent)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    Box(Modifier.liquidGlass(backdrop = backdrop ?: LocalLiquidGlassBackdrop.current ?: return@Row,
                        shape = RoundedCornerShape(30.dp), interactive = false).padding(horizontal = 20.dp, vertical = 10.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                            Icon(Icons.Filled.Home, "Home preview", tint = MaterialTheme.colorScheme.onSurface)
                            Icon(Icons.Filled.PlayCircle, "Videos preview", tint = MaterialTheme.colorScheme.onSurface)
                            Icon(Icons.Filled.QueueMusic, "Library preview", tint = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, subtitle: String? = null) {
    Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    subtitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)) }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun <T> ChoiceGroup(title: String, choices: List<T>, value: T, label: (T) -> String, onSelect: (T) -> Unit) {
    LiquidGlassCard {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            choices.forEach { option -> FilterChip(selected = value == option, onClick = { onSelect(option) }, label = { Text(label(option)) }) }
        }
    }
}

@Composable
private fun ToggleRow(title: String, subtitle: String, value: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    LiquidGlassCard {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(checked = value, onCheckedChange = onChange, enabled = enabled, modifier = Modifier.semantics { contentDescription = title })
        }
    }
}

@Composable
private fun TuningSlider(title: String, subtitle: String, value: Float, range: ClosedFloatingPointRange<Float>,
                         display: String, enabled: Boolean = true, onCommit: (Float) -> Unit) {
    var drag by remember { mutableStateOf<Float?>(null) }
    LiquidGlassCard {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(display, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Slider(value = drag ?: value, onValueChange = { drag = it; onCommit(it) },
            onValueChangeFinished = { drag = null }, valueRange = range, enabled = enabled,
            modifier = Modifier.semantics { contentDescription = title })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccentPicker(theme: ThemeUiState, viewModel: AppearanceViewModel) {
    var custom by rememberSaveable { mutableStateOf(false) }
    var hex by rememberSaveable { mutableStateOf(theme.accentColorHex) }
    val valid = hex.matches(Regex("#[0-9a-fA-F]{6}"))
    val colors = listOf("#4D83E8", "#6A65D8", "#B76ECA", "#DB7896", "#DD8755", "#BD9F42", "#47A38A", "#E03030")
    LiquidGlassCard {
        Text("Accent color", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(vertical = 12.dp)) {
            colors.forEach { color ->
                val selected = theme.mode == AccentMode.MANUAL && theme.accentColorHex.equals(color, true)
                Box(Modifier.size(48.dp).clip(CircleShape).background(Color(android.graphics.Color.parseColor(color)))
                    .border(if (selected) 3.dp else 0.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                    .selectable(selected = selected, role = Role.RadioButton) { viewModel.accent(color) }.semantics { contentDescription = "Accent $color" },
                    contentAlignment = Alignment.Center) {
                    if (selected) Icon(Icons.Filled.Check, "Selected accent", tint = Color.White)
                }
            }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = theme.mode == AccentMode.DYNAMIC, onClick = { viewModel.accentMode(AccentMode.DYNAMIC) }, label = { Text("Wallpaper") })
            FilterChip(selected = theme.mode == AccentMode.MONOCHROME, onClick = { viewModel.accentMode(AccentMode.MONOCHROME) }, label = { Text("Monochrome") })
            FilterChip(selected = theme.mode == AccentMode.MANUAL && colors.none { it.equals(theme.accentColorHex, true) },
                onClick = { hex = theme.accentColorHex; custom = true }, label = { Text("Custom") })
        }
    }
    if (custom) AlertDialog(onDismissRequest = { custom = false }, title = { Text("Your accent color") },
        text = { OutlinedTextField(hex, { hex = it.take(7) }, label = { Text("Hex color") }, placeholder = { Text("#4D83E8") },
            singleLine = true, isError = !valid, supportingText = { Text("Use # followed by six hex digits") }) },
        confirmButton = { TextButton(enabled = valid, onClick = { viewModel.accent(hex); custom = false }) { Text("Apply color") } },
        dismissButton = { TextButton(onClick = { custom = false }) { Text("Cancel") } })
}

private fun controlDescription(control: GlassControl): String = when (control) {
    GlassControl.BLUR -> "Clear detail or a softer frosted finish"
    GlassControl.DEPTH -> "Negative values compress; positive values magnify the edge"
    GlassControl.DISPERSION -> "Separate light into a subtle rainbow at the rim"
    GlassControl.OPACITY -> "Add a solid veil behind labels and controls"
    GlassControl.HIGHLIGHT -> "Brightness of the glass edge"
    GlassControl.TINT -> "Mix your accent color into the material"
    GlassControl.ROUNDNESS -> "Shape of cards and setting surfaces"
    GlassControl.SHADOW -> "Lift glass surfaces from the background"
    GlassControl.SATURATION -> "Muted or vivid colors behind the glass"
}
