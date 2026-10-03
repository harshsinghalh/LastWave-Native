package com.lastwave.app.ui.laya

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import com.lastwave.app.ui.theme.LastWaveTheme
import com.lastwave.app.ui.theme.ThemeViewModel
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class LayaSettingsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val viewModel: ThemeViewModel = hiltViewModel()
            val theme by viewModel.uiState.collectAsStateWithLifecycle()
            LastWaveTheme(themeState = theme) { LayaSettingsScreen(onBack = { finish() }) }
        }
    }
}
