package com.lastwave.app.ui.videos

import android.view.View
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ChevronRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.ViewCompositionStrategy
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.fragment.app.Fragment
import com.lastwave.app.LastWaveApplication
import com.lastwave.app.R
import com.lastwave.app.ui.common.ExpressiveHeader
import com.lastwave.app.ui.common.HeaderActionIcon
import com.lastwave.app.ui.common.LiquidGlassCard
import com.lastwave.app.ui.theme.LastWaveTheme
import com.newtube.mobile.ui.settings.SettingsFrontend
import com.newtube.mobile.ui.settings.SettingsPageFragment
import com.newtube.mobile.ui.settings.SettingsPages
import com.newtube.mobile.ui.settings.SettingsRow
import com.newtube.mobile.ui.settings.SettingsSearch
import com.newtube.mobile.ui.settings.SettingsSearchFragment
import kotlinx.coroutines.launch

/** NewTube owns each preference and its action; LastWave owns the visible settings tree. */
object LastWaveVideoSettings : SettingsFrontend {
    override fun create(fragment: SettingsPageFragment): View {
        val model = mutableStateOf(SettingsPages.build(fragment.requireContext(), fragment.pageId))
        return themedView(fragment) { VideoSettingsPage(fragment, model.value) }.apply {
            setTag(R.id.video_settings_model, model)
        }
    }

    override fun createSearch(fragment: SettingsSearchFragment): View =
        themedView(fragment) { VideoSettingsSearch(fragment) }

    private fun themedView(fragment: Fragment, content: @Composable () -> Unit): ComposeView {
        val repository = (fragment.requireActivity().application as LastWaveApplication).themeRepository.get()
        return ComposeView(fragment.requireContext()).apply {
            setViewCompositionStrategy(ViewCompositionStrategy.DisposeOnViewTreeLifecycleDestroyed)
            setContent {
                val theme by repository.uiState.collectAsStateWithLifecycle()
                LastWaveTheme(theme, content)
            }
        }
    }

    override fun update(view: View, model: SettingsPages.Page) {
        @Suppress("UNCHECKED_CAST")
        (view.getTag(R.id.video_settings_model) as? MutableState<SettingsPages.Page>)?.value = model
    }
}

@Composable
private fun VideoSettingsSearch(fragment: SettingsSearchFragment) {
    var query by rememberSaveable { mutableStateOf(fragment.query) }
    var index by remember { mutableStateOf<SettingsSearch?>(null) }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    DisposableEffect(fragment) {
        var active = true
        SettingsSearch.buildAsync(fragment.requireContext()) { if (active) index = it }
        onDispose { active = false }
    }
    val hits = remember(index, query) { index?.find(query).orEmpty() }
    Column(Modifier.fillMaxSize()) {
        ExpressiveHeader("Search video settings", onBack = {
            keyboard?.hide()
            fragment.requireActivity().onBackPressedDispatcher.onBackPressed()
        })
        OutlinedTextField(
            value = query,
            onValueChange = { query = it.take(256); fragment.query = query },
            label = { Text("Search video settings") }, singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        )
        if (index == null) LinearProgressIndicator(Modifier.fillMaxWidth())
        LazyColumn(
            modifier = Modifier.weight(1f), contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(hits) { _, entry ->
                LiquidGlassCard {
                    Column(Modifier.fillMaxWidth().clickable {
                        keyboard?.hide()
                        fragment.open(entry)
                    }.padding(vertical = 6.dp)) {
                        Text(entry.title.toString(), style = MaterialTheme.typography.titleMedium)
                        Text(entry.path, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (index != null && query.isNotBlank() && hits.isEmpty()) {
                item { Text("No settings match this search.") }
            }
            item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.safeDrawing)) }
        }
    }
}

@Composable
private fun VideoSettingsPage(fragment: SettingsPageFragment, model: SettingsPages.Page) {
    var choice by remember { mutableStateOf<SettingsRow?>(null) }
    val repository = remember { (fragment.requireActivity().application as LastWaveApplication).themeRepository.get() }
    val appearance by repository.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val themeTitle = fragment.getString(com.liskovsoft.smartyoutubetv2.tv.R.string.mobile_theme)
    val themeIndex = when (appearance.themeMode) {
        com.lastwave.app.data.local.ThemeMode.SYSTEM -> 0
        com.lastwave.app.data.local.ThemeMode.LIGHT -> 1
        com.lastwave.app.data.local.ThemeMode.DARK -> 2
    }
    Column(Modifier.fillMaxSize()) {
        ExpressiveHeader(
            title = model.title.toString(),
            subtitle = "Video settings",
            onBack = { fragment.requireActivity().onBackPressedDispatcher.onBackPressed() },
            actions = {
                if (fragment.pageId == SettingsPages.ROOT) {
                    HeaderActionIcon(Icons.Filled.Search, "Search video settings", fragment::openSearch)
                }
            },
        )
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            itemsIndexed(model.rows) { _, row ->
                when (row.kind) {
                    SettingsRow.KIND_HEADER -> Text(
                        row.title.toString(), Modifier.padding(top = 10.dp),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    SettingsRow.KIND_DIVIDER -> HorizontalDivider()
                    SettingsRow.KIND_NOTE -> Text(
                        row.title.toString(), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    else -> LiquidGlassCard {
                        val enabled = row.isEnabled
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = enabled) {
                                if (row.kind == SettingsRow.KIND_CHOICE) choice = row
                                else fragment.onRowClicked(row)
                            }.padding(vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    row.title.toString(), style = MaterialTheme.typography.titleMedium,
                                    color = if (row.isDestructive) MaterialTheme.colorScheme.error
                                        else MaterialTheme.colorScheme.onSurface.copy(alpha = if (enabled) 1f else .45f),
                                )
                                val summary = if (row.title.toString() == themeTitle) row.options.getOrNull(themeIndex)?.label
                                    else row.summaryText()
                                summary?.takeIf { it.isNotBlank() }?.let {
                                    Text(it.toString(), style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                            if (row.kind == SettingsRow.KIND_SWITCH) {
                                Switch(checked = row.isChecked, enabled = enabled,
                                    onCheckedChange = { fragment.onRowClicked(row) })
                            } else {
                                Icon(Icons.AutoMirrored.Filled.ChevronRight, contentDescription = null)
                            }
                        }
                    }
                }
            }
            item { Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.safeDrawing)) }
        }
    }
    choice?.let { row ->
        AlertDialog(
            onDismissRequest = { choice = null },
            title = { Text(row.title.toString()) },
            text = {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    itemsIndexed(row.options) { index, option ->
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                if (row.title.toString() == themeTitle) {
                                    scope.launch {
                                        repository.setThemeMode(when (index) {
                                            1 -> com.lastwave.app.data.local.ThemeMode.LIGHT
                                            2 -> com.lastwave.app.data.local.ThemeMode.DARK
                                            else -> com.lastwave.app.data.local.ThemeMode.SYSTEM
                                        })
                                        fragment.pickChoice(row, index)
                                    }
                                } else fragment.pickChoice(row, index)
                                choice = null
                            }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = index == if (row.title.toString() == themeTitle) themeIndex else row.currentIndex(), onClick = null)
                            Column(Modifier.weight(1f).padding(start = 8.dp)) {
                                Text(option.label.toString(), style = MaterialTheme.typography.bodyLarge)
                                option.description?.let { Text(it.toString(), style = MaterialTheme.typography.bodySmall) }
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { choice = null }) { Text("Cancel") } },
        )
    }
}
