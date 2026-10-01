import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('lastwave', {
  bootstrap: () => invoke('app:bootstrap'),
  state: () => invoke('state:get'),
  search: {
    clearHistory: () => invoke('search:clear-history')
  },
  openExternal: url => invoke('app:open-external', url),
  showFile: file => invoke('app:show-file', file),
  openDownloads: () => invoke('app:open-downloads'),

  settings: {
    update: patch => invoke('settings:update', patch),
    chooseDownloadFolder: () => invoke('settings:choose-download-folder')
  },

  library: {
    toggleLike: track => invoke('library:toggle-like', track),
    excludeTrack: track => invoke('library:exclude-track', track),
    restoreExcluded: videoId => invoke('library:restore-excluded', videoId),
    createPlaylist: name => invoke('library:create-playlist', name),
    renamePlaylist: (id, title) => invoke('library:rename-playlist', id, title),
    deletePlaylist: id => invoke('library:delete-playlist', id),
    addToPlaylist: (id, tracks) => invoke('library:add-to-playlist', id, tracks),
    removeFromPlaylist: (id, videoId) => invoke('library:remove-from-playlist', id, videoId),
    stats: () => invoke('library:stats'),
    smartMix: options => invoke('library:smart-mix', options)
  },

  history: {
    add: (track, progress) => invoke('history:add', track, progress)
  },

  youtube: {
    login: () => invoke('yt:login'),
    logout: () => invoke('yt:logout'),
    home: () => invoke('yt:home'),
    explore: () => invoke('yt:explore'),
    search: (query, type) => invoke('yt:search', query, type),
    suggestions: query => invoke('yt:suggestions', query),
    entity: (kind, id) => invoke('yt:entity', kind, id),
    playlist: id => invoke('yt:playlist', id),
    upNext: videoId => invoke('yt:up-next', videoId),
    related: videoId => invoke('yt:related', videoId)
  },

  lyrics: {
    get: track => invoke('lyrics:get', track)
  },

  downloads: {
    track: track => invoke('download:track', track)
  },

  imports: {
    youtubePlaylist: input => invoke('import:youtube-playlist', input),
    externalUrl: input => invoke('import:external-url', input),
    file: () => invoke('import:file')
  },

  backup: {
    export: () => invoke('backup:export'),
    import: () => invoke('backup:import')
  },

  lastfm: {
    save: patch => invoke('lastfm:save', patch),
    authUrl: () => invoke('lastfm:auth-url'),
    user: username => invoke('lastfm:user', username),
    searchUsers: (query, limit = 30) => invoke('lastfm:search-users', query, limit),
    recent: (username, limit = 50) => invoke('lastfm:recent', username, limit),
    top: (username, period = '7day', limit = 50) => invoke('lastfm:top', username, period, limit),
    friends: username => invoke('lastfm:friends', username),
    nowPlaying: track => invoke('lastfm:now-playing', track),
    scrobble: (track, timestamp) => invoke('lastfm:scrobble', track, timestamp),
    love: (track, loved = true) => invoke('lastfm:love', track, loved)
  },

  onLastFmAuth: callback => {
    ipcRenderer.on('lastfm:auth-complete', (_e, value) => callback({ ok: true, value }));
    ipcRenderer.on('lastfm:auth-error', (_e, message) => callback({ ok: false, message }));
  }
});
