package com.lastwave.app.ui.appearance

import android.os.Bundle
import android.content.Context
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import com.lastwave.app.ui.theme.LastWaveTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class AppearanceActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val viewModel: AppearanceViewModel = hiltViewModel()
            val theme by viewModel.theme.collectAsStateWithLifecycle()
            LastWaveTheme(theme) { AppearanceStudioScreen(theme, viewModel, onBack = { finish() }) }
        }
    }
    companion object {
        fun open(context: Context) { context.startActivity(Intent(context, AppearanceActivity::class.java)) }
    }
}
