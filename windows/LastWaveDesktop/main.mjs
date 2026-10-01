import { app, BrowserWindow, dialog, ipcMain, shell, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import { JsonStore } from './services/store.mjs';
import { YouTubeMusicService } from './services/ytmusic.mjs';
import { LastFmService } from './services/lastfm.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let store;
let youtube;
let lastfm;
let proxyServer;
let proxyPort = 0;
let personalProfile = {};

const clean = value => JSON.parse(JSON.stringify(value ?? null));

function profilePath() {
  const packaged = path.join(process.resourcesPath, 'resources', 'generated_profile.json');
  const dev = path.join(__dirname, 'resources', 'generated_profile.json');
  return app.isPackaged ? packaged : dev;
}

function loadProfile() {
  try { return JSON.parse(fs.readFileSync(profilePath(), 'utf8')); }
  catch {
    return {
      minimum_db: -2, maximum_db: 5, pre_drop_db: -2, impact_db: 5,
      lookahead_ms: 80, impact_hold_ms: 70, cooldown_ms: 420,
      strong_surge_db: 4.5, loud_surge_db: 2.5,
      pre_duck_ms: 22, impact_attack_ms: 6, impact_release_ms: 180,
      source: 'embedded-fallback'
    };
  }
}

function sanitizeFileName(input) {
  return String(input || 'track')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 160) || 'track';
}

function downloadRoot() {
  const configured = store.state.settings.downloadFolder;
  const root = configured || path.join(app.getPath('music'), 'LastWave');
  fs.mkdirSync(root, { recursive: true });
  return root;
}

async function startStreamProxy() {
  proxyServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const match = url.pathname.match(/^\/stream\/([A-Za-z0-9_-]{11})$/);
      if (!match) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not found');
        return;
      }
      const videoId = match[1];
      const stream = await youtube.resolveStream(videoId);
      const headers = {};
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(stream.url, { headers });
      const responseHeaders = {
        'content-type': upstream.headers.get('content-type') || stream.mimeType || 'audio/webm',
        'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
        'access-control-allow-origin': '*',
        'cache-control': 'no-store'
      };
      for (const key of ['content-length','content-range','etag','last-modified']) {
        const value = upstream.headers.get(key);
        if (value) responseHeaders[key] = value;
      }
      res.writeHead(upstream.status, responseHeaders);
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch (error) {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
      res.end(error?.message || 'Could not resolve stream');
    }
  });
  await new Promise((resolve, reject) => {
    proxyServer.once('error', reject);
    proxyServer.listen(0, '127.0.0.1', () => resolve());
  });
  proxyPort = proxyServer.address().port;
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#0b0d0f',
    title: 'LastWave',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function setupProtocolHandling() {
  app.setAsDefaultProtocolClient('lastwave');
  const handleUrl = async raw => {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'lastwave:' || u.hostname !== 'auth-callback') return;
      const token = u.searchParams.get('token');
      if (!token) return;
      const session = await lastfm.completeAuth(token);
      store.updateSettings({ lastfm: session });
      sendToRenderer('lastfm:auth-complete', session);
    } catch (e) {
      sendToRenderer('lastfm:auth-error', e?.message || 'Last.fm sign-in failed');
    }
  };
  app.on('open-url', (event, raw) => {
    event.preventDefault();
    handleUrl(raw);
  });
  app.on('second-instance', (_event, argv) => {
    const raw = argv.find(x => x.startsWith('lastwave://'));
    if (raw) handleUrl(raw);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

async function fetchLyrics(track) {
  const title = track?.title?.trim();
  const artist = track?.artist?.trim();
  if (title && artist) {
    try {
      const u = new URL('https://lrclib.net/api/get');
      u.searchParams.set('track_name', title);
      u.searchParams.set('artist_name', artist);
      if (track.album) u.searchParams.set('album_name', track.album);
      if (track.durationSeconds) u.searchParams.set('duration', String(Math.round(track.durationSeconds)));
      const r = await fetch(u, { headers: { 'User-Agent': 'LastWave Desktop/4.4.0' } });
      if (r.ok) {
        const d = await r.json();
        return {
          provider: 'LRCLIB',
          synced: d.syncedLyrics || '',
          plain: d.plainLyrics || '',
          instrumental: Boolean(d.instrumental)
        };
      }
    } catch {}
  }
  if (track?.videoId) {
    const plain = await youtube.youtubeLyrics(track.videoId).catch(() => '');
    if (plain) return { provider: 'YouTube Music', synced: '', plain, instrumental: false };
  }
  return { provider: '', synced: '', plain: '', instrumental: false };
}

function setupIpc() {
  ipcMain.handle('app:bootstrap', async () => ({
    state: store.snapshot(),
    profile: personalProfile,
    streamBase: `http://127.0.0.1:${proxyPort}/stream/`,
    appVersion: app.getVersion(),
    platform: process.platform
  }));

  ipcMain.handle('app:open-external', (_e, url) => shell.openExternal(String(url)));
  ipcMain.handle('app:show-file', (_e, file) => shell.showItemInFolder(String(file)));
  ipcMain.handle('app:open-downloads', () => shell.openPath(downloadRoot()));

  ipcMain.handle('settings:update', async (_e, patch) => {
    const beforeCookie = store.state.settings.youtubeCookie || '';
    const settings = store.updateSettings(clean(patch) || {});
    nativeTheme.themeSource = settings.theme === 'light' ? 'light' : settings.theme === 'system' ? 'system' : 'dark';
    if ((settings.youtubeCookie || '') !== beforeCookie) {
      await youtube.init(settings.youtubeCookie || '');
    }
    return settings;
  });

  ipcMain.handle('settings:choose-download-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory','createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return '';
    store.updateSettings({ downloadFolder: result.filePaths[0] });
    return result.filePaths[0];
  });

  ipcMain.handle('state:get', () => store.snapshot());
  ipcMain.handle('library:toggle-like', (_e, track) => store.toggleLike(clean(track)));
  ipcMain.handle('library:create-playlist', (_e, name) => store.createPlaylist(name));
  ipcMain.handle('library:rename-playlist', (_e, id, title) => store.renamePlaylist(id, title));
  ipcMain.handle('library:delete-playlist', (_e, id) => store.deletePlaylist(id));
  ipcMain.handle('library:add-to-playlist', (_e, id, tracks) => store.addToPlaylist(id, clean(tracks)));
  ipcMain.handle('library:remove-from-playlist', (_e, id, videoId) => store.removeFromPlaylist(id, videoId));
  ipcMain.handle('library:stats', () => store.stats());
  ipcMain.handle('library:smart-mix', (_e, options) => store.smartMix(clean(options) || {}));

  ipcMain.handle('history:add', (_e, track, progress) => {
    store.addHistory(clean(track), Number(progress) || 0);
    return true;
  });

  ipcMain.handle('yt:home', () => youtube.home());
  ipcMain.handle('yt:explore', () => youtube.explore());
  ipcMain.handle('yt:search', async (_e, query, type) => {
    store.addSearch(query);
    return youtube.search(String(query || ''), type || 'all');
  });
  ipcMain.handle('yt:suggestions', (_e, query) => youtube.suggestions(String(query || '')));
  ipcMain.handle('yt:entity', (_e, kind, id) => youtube.entity(kind, id));
  ipcMain.handle('yt:playlist', (_e, id) => youtube.playlist(id));
  ipcMain.handle('yt:up-next', (_e, videoId) => youtube.upNext(videoId));
  ipcMain.handle('yt:related', (_e, videoId) => youtube.related(videoId));

  ipcMain.handle('lyrics:get', (_e, track) => fetchLyrics(clean(track)));

  ipcMain.handle('download:track', async (_e, track) => {
    const t = clean(track);
    if (!t?.videoId) throw new Error('This item has no playable YouTube ID.');
    const stream = await youtube.resolveStream(t.videoId);
    const response = await fetch(stream.url);
    if (!response.ok || !response.body) throw new Error('Could not download the audio stream.');
    const subtype = (stream.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
    const name = sanitizeFileName(`${t.artist || 'Unknown'} - ${t.title || t.videoId}`) + '.' + subtype;
    const file = path.join(downloadRoot(), name);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(file));
    store.addDownload({ ...t, file, format: subtype });
    return { file, name };
  });

  ipcMain.handle('import:youtube-playlist', async (_e, input) => {
    const raw = String(input || '').trim();
    let id = raw;
    try {
      const u = new URL(raw);
      id = u.searchParams.get('list') || raw.split('/playlist/')[1]?.split(/[?&#/]/)[0] || raw;
    } catch {}
    const result = await youtube.playlist(id);
    if (!result?.tracks?.length) throw new Error('No tracks were found in that playlist.');
    const playlist = store.saveImportedPlaylist(result.title || 'Imported YouTube Playlist', result.tracks, 'youtube');
    return playlist;
  });

  ipcMain.handle('import:file', async () => {
    const d = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Playlist data', extensions: ['csv','txt','json','m3u','m3u8'] }]
    });
    if (d.canceled || !d.filePaths[0]) return null;
    const file = d.filePaths[0];
    const raw = fs.readFileSync(file, 'utf8');
    let queries = [];
    if (file.toLowerCase().endsWith('.json')) {
      const parsed = JSON.parse(raw);
      const rows = Array.isArray(parsed) ? parsed : parsed.tracks || parsed.items || [];
      queries = rows.map(x => typeof x === 'string' ? x : [x.artist, x.title || x.name].filter(Boolean).join(' - '));
    } else {
      queries = raw.split(/\r?\n/).map(line => line.replace(/^#.*$/, '').trim()).filter(Boolean);
      if (file.toLowerCase().endsWith('.csv')) queries = queries.slice(1).map(line => line.split(',').slice(0,2).join(' - '));
    }
    const tracks = [];
    for (const query of queries.slice(0, 500)) {
      const found = await youtube.search(query, 'song').catch(() => ({ tracks: [] }));
      if (found.tracks[0]) tracks.push(found.tracks[0]);
    }
    return store.saveImportedPlaylist(path.basename(file, path.extname(file)), tracks, 'file');
  });

  ipcMain.handle('backup:export', async () => {
    const d = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.join(app.getPath('documents'), 'LastWave-backup.json'),
      filters: [{ name: 'LastWave backup', extensions: ['json'] }]
    });
    if (d.canceled || !d.filePath) return '';
    fs.writeFileSync(d.filePath, JSON.stringify(store.snapshot(), null, 2));
    return d.filePath;
  });

  ipcMain.handle('backup:import', async () => {
    const d = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'LastWave backup', extensions: ['json'] }]
    });
    if (d.canceled || !d.filePaths[0]) return null;
    const incoming = JSON.parse(fs.readFileSync(d.filePaths[0], 'utf8'));
    store.state = { ...store.state, ...incoming, settings: { ...store.state.settings, ...(incoming.settings || {}) } };
    return store.save();
  });

  ipcMain.handle('lastfm:save', (_e, patch) => store.updateSettings({ lastfm: clean(patch) }).lastfm);
  ipcMain.handle('lastfm:auth-url', () => lastfm.authUrl());
  ipcMain.handle('lastfm:user', (_e, username) => lastfm.userInfo(username));
  ipcMain.handle('lastfm:recent', (_e, username, limit) => lastfm.recentTracks(username, limit));
  ipcMain.handle('lastfm:top', (_e, username, period, limit) => lastfm.topTracks(username, period, limit));
  ipcMain.handle('lastfm:friends', (_e, username) => lastfm.friends(username));
  ipcMain.handle('lastfm:now-playing', (_e, track) => lastfm.updateNowPlaying(clean(track)));
  ipcMain.handle('lastfm:scrobble', (_e, track, timestamp) => lastfm.scrobble(clean(track), timestamp));
  ipcMain.handle('lastfm:love', (_e, track, loved) => lastfm.love(clean(track), Boolean(loved)));
}

app.requestSingleInstanceLock();

app.whenReady().then(async () => {
  store = new JsonStore(app.getPath('userData'));
  personalProfile = loadProfile();
  nativeTheme.themeSource = store.state.settings.theme === 'light' ? 'light' : store.state.settings.theme === 'system' ? 'system' : 'dark';
  youtube = new YouTubeMusicService(app.getPath('userData'));
  await youtube.init(store.state.settings.youtubeCookie || '').catch(() => {});
  lastfm = new LastFmService(() => store.state.settings);
  setupProtocolHandling();
  setupIpc();
  await startStreamProxy();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (proxyServer) proxyServer.close();
  if (process.platform !== 'darwin') app.quit();
});
