package com.lastwave.app.ui.appearance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.lastwave.app.data.local.*
import com.lastwave.app.data.repository.ThemeRepository
import androidx.compose.ui.graphics.Color
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AppearanceViewModel @Inject constructor(private val repository: ThemeRepository) : ViewModel() {
    val theme = repository.uiState
    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()
    private fun save(block: suspend () -> Unit) = viewModelScope.launch {
        try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { _error.value = "Couldn't save this change. Please try again." }
    }
    fun dismissError() { _error.value = null }
    fun enabled(value: Boolean) = save { repository.setLiquidGlass(value) }
    fun style(value: GlassStyle) = save { repository.setGlassStyle(value) }
    fun control(style: GlassStyle, control: GlassControl, value: Float) = save { repository.setGlassControl(style, control, value) }
    fun preset(style: GlassStyle, preset: GlassPreset) = save { repository.setGlassPreset(style, preset) }
    fun reset(style: GlassStyle) = save { repository.resetGlassProfile(style) }
    fun option(option: AppearanceOption, value: String) = save { repository.setAppearanceOption(option, value) }
    fun mode(value: ThemeMode) = save { repository.setThemeMode(value) }
    fun accent(value: String) = save { repository.setManualAccent(Color(android.graphics.Color.parseColor(value))) }
    fun accentMode(value: AccentMode) = save { repository.setMode(value) }
    fun amoled(value: Boolean) = save { repository.setAmoled(value) }
    fun font(value: Boolean) = save { repository.setUseCustomFont(value) }
}
