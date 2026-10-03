package com.lastwave.app.ui.laya

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.harsh.laya.PolicyStore
import com.harsh.laya.LayaClient
import com.lastwave.app.ui.common.ExpressiveHeader
import com.lastwave.app.ui.common.LiquidGlassCard
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONArray

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LayaSettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val store = remember { PolicyStore.get(context) }
    var policy by remember { mutableStateOf(store.snapshot()) }
    var endpoint by remember { mutableStateOf(store.endpoint()) }
    var prompt by remember { mutableStateOf(policy.optString("prompt")) }
    var status by remember { mutableStateOf(store.status()) }
    var consent by remember { mutableStateOf(store.consent()) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    DisposableEffect(store) {
        val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
            status = store.status()
        }
        store.preferences().registerOnSharedPreferenceChangeListener(listener)
        onDispose { store.preferences().unregisterOnSharedPreferenceChangeListener(listener) }
    }
    fun update(key: String, value: Any) {
        policy = JSONObject(policy.toString()).put(key, value)
        store.save(policy)
    }
    Column(Modifier.fillMaxSize()) {
        ExpressiveHeader("Laya Feed Control", subtitle = "Your feed, your preferences", onBack = onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            LiquidGlassCard {
                Text("Feed controls", style = MaterialTheme.typography.titleLarge)
                Text(status, style = MaterialTheme.typography.bodySmall)
                SettingSwitch("Filter videos and comments", policy.optBoolean("enabled", true)) { update("enabled", it) }
                SettingSwitch("Hide abusive language", policy.optBoolean("abuse", true)) { update("abuse", it) }
                SettingSwitch("Hide spam", policy.optBoolean("spam", false)) { update("spam", it) }
            }
            LiquidGlassCard {
                Text("Choose topics", style = MaterialTheme.typography.titleMedium)
                Text("ANY matches one selected topic. ALL requires every selected topic. NONE leaves topics unrestricted.")
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("ANY", "ALL", "NONE").forEach { mode ->
                        FilterChip(selected = policy.optString("mode") == mode, onClick = { update("mode", mode) }, label = { Text(mode) })
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Education", "Technology", "Programming", "Science", "Mathematics", "History", "Business", "Music", "Sports", "News").forEach { topic ->
                        val selected = (0 until policy.getJSONArray("topics").length()).map { policy.getJSONArray("topics").optString(it) }
                        FilterChip(selected = topic in selected, onClick = { update("topics", JSONArray(if (topic in selected) selected - topic else selected + topic)) }, label = { Text(topic) })
                    }
                }
            }
            LiquidGlassCard {
                Text("Describe what you want", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(value = prompt, onValueChange = { prompt = it.take(1000) }, label = { Text("Your prompt") }, placeholder = { Text("Only education and programming. Hide spam.") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
                Button(enabled = !busy && consent && endpoint.isNotBlank() && prompt.isNotBlank(), onClick = {
                    busy = true
                    scope.launch {
                        try {
                            val result = withContext(Dispatchers.IO) {
                                store.setEndpoint(endpoint)
                                LayaClient.get(context).post("/v1/policy/compile", JSONObject().put("prompt", prompt).put("policy", policy))
                            }
                            policy = result.getJSONObject("policy")
                            store.save(policy)
                            status = "Prompt applied. Review the controls above."
                        } catch (e: Exception) { status = e.message ?: "Could not apply prompt" }
                        finally { busy = false }
                    }
                }) { Text(if (busy) "Applying…" else "Apply prompt") }
                Text("Your prompt also guides Laya's content decisions. Prompt changes do not override excluded creators or safety rules.", style = MaterialTheme.typography.bodySmall)
            }
            LiquidGlassCard {
                Text("Keywords and creators", style = MaterialTheme.typography.titleMedium)
                listOf("include" to "Include phrases", "exclude" to "Exclude phrases", "allowedCreators" to "Allowed creators", "excludedCreators" to "Excluded creators").forEach { (key, label) ->
                    var value by remember(key) { mutableStateOf((0 until policy.getJSONArray(key).length()).joinToString(", ") { policy.getJSONArray(key).optString(it) }) }
                    OutlinedTextField(value = value, onValueChange = {
                        value = it
                        update(key, JSONArray(it.split(',').map(String::trim).filter(String::isNotBlank).take(32)))
                    }, label = { Text(label) }, supportingText = { Text("Separate entries with commas") }, modifier = Modifier.fillMaxWidth())
                }
            }
            LiquidGlassCard {
                Text("Laya connection", style = MaterialTheme.typography.titleMedium)
                Text("Laya runs on the service, so customers do not download model files. A connected service is required for semantic filtering.")
                OutlinedTextField(value = endpoint, onValueChange = { endpoint = it }, label = { Text("Service HTTPS address") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                SettingSwitch("Allow metadata processing by this service", consent) { consent = it; store.setConsent(it) }
                Text("Sends video titles, creator names, comment text and your filtering preferences. Account credentials, watched video frames and audio are never sent.", style = MaterialTheme.typography.bodySmall)
                Button(enabled = !busy, onClick = {
                    try { store.setEndpoint(endpoint); status = if (endpoint.isBlank()) "Local rules only" else "Connection saved" }
                    catch (e: Exception) { status = e.message ?: "Invalid address" }
                }) { Text("Save connection") }
            }
            LiquidGlassCard {
                Text("What filtering can verify", style = MaterialTheme.typography.titleMedium)
                Text("Decisions use available text metadata. Laya is not a visual content scanner or a fact-checking source. Unsupported truth claims remain visible. Multilingual support can still miss abuse or hide benign text; every hidden item offers a reason and reveal control.")
            }
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, Modifier.weight(1f).padding(end = 12.dp))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
