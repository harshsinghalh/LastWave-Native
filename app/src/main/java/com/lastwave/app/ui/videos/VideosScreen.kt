package com.lastwave.app.ui.videos

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.harsh.laya.LayaClient
import com.harsh.laya.PolicyStore
import com.lastwave.app.ui.common.ExpressiveHeader
import com.lastwave.app.ui.common.LiquidGlassCard
import com.lastwave.app.ui.common.HeaderActionIcon
import com.lastwave.app.ui.shell.FloatingNavDefaults
import com.liskovsoft.mediaserviceinterfaces.data.MediaGroup
import com.liskovsoft.youtubeapi.service.YouTubeServiceManager
import com.liskovsoft.smartyoutubetv2.common.app.models.data.Video
import com.liskovsoft.smartyoutubetv2.common.app.presenters.dialogs.VideoActionPresenter
import com.newtube.mobile.ui.settings.MobileSettingsActivity
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@HiltViewModel
class VideosViewModel @Inject constructor(@ApplicationContext private val context: android.content.Context,
    private val musicPlayer: com.lastwave.app.playback.MusicPlayer,
) : ViewModel() {
    private val _videos = MutableStateFlow<List<Video>>(emptyList())
    val videos = _videos.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()
    private val _decisions = MutableStateFlow<Map<String, LayaClient.Decision>>(emptyMap())
    val decisions = _decisions.asStateFlow()
    private var groups: List<MediaGroup> = emptyList()
    private var generation = 0
    private var contentGeneration = 0
    private val client = LayaClient.get(context)
    private val store = PolicyStore.get(context)
    private val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key != "status") { generation++; _decisions.value = emptyMap(); evaluate() }
    }
    init {
        store.preferences().registerOnSharedPreferenceChangeListener(listener)
        if (store.endpoint().isBlank() && com.lastwave.app.BuildConfig.LAYA_BASE_URL.isNotBlank()) store.setEndpoint(com.lastwave.app.BuildConfig.LAYA_BASE_URL)
        load("")
    }
    fun load(query: String) {
        if (_busy.value) return
        _busy.value = true
        _error.value = null
        val version = ++contentGeneration
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) {
                    val service = YouTubeServiceManager.instance().contentService
                    if (query.isBlank()) service.home else service.getSearch(query)
                }
                if (version == contentGeneration) {
                    groups = result?.filterNotNull().orEmpty()
                    generation++
                    _videos.value = playableVideos(groups)
                    _decisions.value = emptyMap()
                    evaluate()
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { _error.value = "YouTube could not load. Check your connection and try again." }
            finally { _busy.value = false }
        }
    }
    fun more() {
        if (_busy.value) return
        val candidates = groups.filter { !it.nextPageKey.isNullOrBlank() }
        if (candidates.isEmpty()) return
        _busy.value = true
        val version = contentGeneration
        viewModelScope.launch {
            try {
                val result = withContext(Dispatchers.IO) { candidates.mapNotNull { YouTubeServiceManager.instance().contentService.continueGroup(it) } }
                if(version == contentGeneration) {
                    groups = result
                    _videos.value = (_videos.value + playableVideos(result)).distinctBy { it.videoId }
                    evaluate()
                }
            } catch (e: CancellationException) { throw e }
            catch (e: Exception) { _error.value = "Could not load more videos. Try again." }
            finally { _busy.value = false }
        }
    }
    private fun playableVideos(rows: List<MediaGroup>): List<Video> = rows
        .flatMap { it.mediaItems.orEmpty() }
        .mapNotNull { Video.from(it) }
        .filter { !it.isShorts && !it.videoId.isNullOrBlank() }
        .distinctBy { it.videoId }

    private fun evaluate() {
        val version = generation
        _videos.value.forEach { video ->
            val id = id(video)
            if (!_decisions.value.containsKey(id)) {
                _decisions.value = _decisions.value + (id to client.initial(id, video.getTitle() ?: "", video.getAuthor() ?: "", "video"))
                client.evaluate(id, video.getTitle() ?: "", video.getAuthor() ?: "", "video") { decision ->
                if (version == generation) _decisions.value = _decisions.value + (id to decision)
                }
            }
        }
    }
    fun open(context: android.content.Context, video: Video) { musicPlayer.pause(); VideoActionPresenter.instance(context).apply(video) }
    fun reveal(video: Video) { client.reveal(id(video)); _decisions.value = _decisions.value + (id(video) to LayaClient.Decision(false, "Revealed for this session", "user")) }
    fun undoReveal(video: Video) { client.undoReveal(id(video)); _decisions.value = _decisions.value - id(video); evaluate() }
    fun id(video: Video): String = "video:" + (video.videoId ?: video.channelId ?: video.getTitle())
    override fun onCleared() { store.preferences().unregisterOnSharedPreferenceChangeListener(listener); generation++ }
}

@Composable
fun VideosScreen(onOpenLaya: () -> Unit, viewModel: VideosViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val videos by viewModel.videos.collectAsStateWithLifecycle()
    val decisions by viewModel.decisions.collectAsStateWithLifecycle()
    val busy by viewModel.busy.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    val appearance = com.lastwave.app.ui.theme.LocalAppearance.current
    Column(Modifier.fillMaxSize()) {
        ExpressiveHeader("Videos", subtitle = "Your video feed", actions = {
            HeaderActionIcon(Icons.Filled.Palette, "Appearance studio") { com.lastwave.app.ui.appearance.AppearanceActivity.open(context) }
            HeaderActionIcon(Icons.Filled.Tune, "Feed controls", onOpenLaya)
            HeaderActionIcon(Icons.Filled.Settings, "Video settings") {
                context.startActivity(Intent(context, MobileSettingsActivity::class.java))
            }
            HeaderActionIcon(Icons.Filled.Refresh, "Refresh") { viewModel.load(query) }
        })
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = query, onValueChange = { query = it.take(256) }, label = { Text("Search YouTube") }, modifier = Modifier.weight(1f), singleLine = true)
            Button(onClick = { viewModel.load(query) }, enabled = !busy) { Text("Search") }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        error?.let { Text(it, Modifier.padding(16.dp), color = MaterialTheme.colorScheme.error) }
        LazyVerticalGrid(columns = GridCells.Adaptive(appearance.videoSize.width.dp), contentPadding = PaddingValues(start = appearance.spacing.padding.dp, end = appearance.spacing.padding.dp, bottom = FloatingNavDefaults.contentBottomPadding()), verticalArrangement = Arrangement.spacedBy(appearance.spacing.padding.dp), horizontalArrangement = Arrangement.spacedBy(appearance.spacing.padding.dp)) {
            items(videos, key = { viewModel.id(it) }) { video ->
                val decision = decisions[viewModel.id(video)]
                LiquidGlassCard {
                    if (decision?.hidden == true) {
                        Text(if (decision.engine == "pending") "Checking preferences" else "Hidden from your feed", style = MaterialTheme.typography.titleMedium)
                        Text(decision.reason, style = MaterialTheme.typography.bodyMedium)
                        Text(decision.engine, style = MaterialTheme.typography.labelSmall)
                        if (decision.engine != "pending") TextButton(onClick = { viewModel.reveal(video) }) { Text("Reveal once") }
                    } else {
                        AsyncImage(model = video.getCardImageUrl(), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).clip(RoundedCornerShape(16.dp)).clickable { viewModel.open(context, video) })
                        Text(video.getTitle() ?: "Untitled video", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 10.dp).clickable { viewModel.open(context, video) })
                        Text(video.getAuthor() ?: "", style = MaterialTheme.typography.bodySmall)
                        if (decision?.engine == "user") TextButton(onClick = { viewModel.undoReveal(video) }) { Text("Undo reveal") }
                    }
                }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column {
                    if (videos.isEmpty() && !busy && error == null) Text("No videos yet. Search or refresh to load your feed.", Modifier.padding(16.dp))
                    Button(enabled = !busy, onClick = viewModel::more) { Text("Load more") }
                    TextButton(onClick = { context.startActivity(Intent(context, MobileSettingsActivity::class.java)) }) { Text("Video playback, downloads and casting settings") }
                }
            }
        }
    }
}
