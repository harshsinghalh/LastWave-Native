import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STATE = {
  version: 1,
  settings: {
    theme: 'dark',
    accent: '#c6f100',
    djEnergy: true,
    loudnessNormalization: false,
    crossfadeSeconds: 0,
    lyricsProvider: 'lrclib',
    downloadFolder: '',
    audioQuality: 'best',
    lastfm: { apiKey: '', apiSecret: '', username: '', sessionKey: '' }
  },
  liked: [],
  playlists: [],
  history: [],
  excluded: [],
  downloads: [],
  friends: [],
  searchHistory: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class JsonStore {
  constructor(root) {
    this.dir = root;
    this.file = path.join(root, 'lastwave-desktop.json');
    fs.mkdirSync(root, { recursive: true });
    this.state = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        ...clone(DEFAULT_STATE),
        ...parsed,
        settings: {
          ...clone(DEFAULT_STATE.settings),
          ...(parsed.settings || {}),
          lastfm: {
            ...clone(DEFAULT_STATE.settings.lastfm),
            ...(parsed.settings?.lastfm || {})
          }
        }
      };
    } catch {
      return clone(DEFAULT_STATE);
    }
  }

  save() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
    return this.snapshot();
  }

  snapshot() {
    return clone(this.state);
  }

  updateSettings(patch) {
    this.state.settings = {
      ...this.state.settings,
      ...patch,
      lastfm: patch.lastfm
        ? { ...this.state.settings.lastfm, ...patch.lastfm }
        : this.state.settings.lastfm
    };
    return this.save().settings;
  }

  addSearch(query) {
    const q = String(query || '').trim();
    if (!q) return;
    this.state.searchHistory = [q, ...this.state.searchHistory.filter(x => x !== q)].slice(0, 30);
    this.save();
  }

  toggleLike(track) {
    const id = track?.videoId;
    if (!id) return false;
    const index = this.state.liked.findIndex(x => x.videoId === id);
    if (index >= 0) {
      this.state.liked.splice(index, 1);
      this.save();
      return false;
    }
    this.state.liked.unshift({ ...track, likedAt: Date.now() });
    this.state.liked = this.state.liked.slice(0, 5000);
    this.save();
    return true;
  }

  isLiked(videoId) {
    return this.state.liked.some(x => x.videoId === videoId);
  }

  addHistory(track, progress = 0) {
    if (!track?.videoId) return;
    const event = { ...track, playedAt: Date.now(), progress };
    this.state.history.unshift(event);
    this.state.history = this.state.history.slice(0, 4000);
    this.save();
  }

  createPlaylist(name) {
    const title = String(name || '').trim() || 'New Playlist';
    const playlist = {
      id: 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      createdAt: Date.now(),
      tracks: []
    };
    this.state.playlists.unshift(playlist);
    this.save();
    return clone(playlist);
  }

  renamePlaylist(id, title) {
    const p = this.state.playlists.find(x => x.id === id);
    if (!p) return null;
    p.title = String(title || '').trim() || p.title;
    this.save();
    return clone(p);
  }

  deletePlaylist(id) {
    const before = this.state.playlists.length;
    this.state.playlists = this.state.playlists.filter(x => x.id !== id);
    if (this.state.playlists.length !== before) this.save();
    return this.state.playlists.length !== before;
  }

  addToPlaylist(id, tracks) {
    const p = this.state.playlists.find(x => x.id === id);
    if (!p) return null;
    const seen = new Set(p.tracks.map(x => x.videoId));
    for (const track of Array.isArray(tracks) ? tracks : [tracks]) {
      if (track?.videoId && !seen.has(track.videoId)) {
        p.tracks.push(track);
        seen.add(track.videoId);
      }
    }
    this.save();
    return clone(p);
  }

  removeFromPlaylist(id, videoId) {
    const p = this.state.playlists.find(x => x.id === id);
    if (!p) return null;
    p.tracks = p.tracks.filter(x => x.videoId !== videoId);
    this.save();
    return clone(p);
  }

  saveImportedPlaylist(title, tracks, source = 'import') {
    const p = this.createPlaylist(title);
    const target = this.state.playlists.find(x => x.id === p.id);
    target.source = source;
    target.tracks = [...tracks];
    this.save();
    return clone(target);
  }

  setFriends(friends) {
    this.state.friends = Array.isArray(friends) ? friends : [];
    this.save();
    return clone(this.state.friends);
  }

  excludeTrack(track) {
    const id = track?.videoId;
    if (!id) return false;
    if (!this.state.excluded.some(x => x.videoId === id)) {
      this.state.excluded.unshift({ ...track, excludedAt: Date.now() });
      this.state.excluded = this.state.excluded.slice(0, 5000);
      this.save();
    }
    return true;
  }

  restoreExcluded(videoId) {
    const before = this.state.excluded.length;
    this.state.excluded = this.state.excluded.filter(x => x.videoId !== videoId);
    if (this.state.excluded.length !== before) this.save();
    return this.state.excluded.length !== before;
  }

  isExcluded(videoId) {
    return this.state.excluded.some(x => x.videoId === videoId);
  }

  addDownload(entry) {
    this.state.downloads = [
      { ...entry, savedAt: Date.now() },
      ...this.state.downloads.filter(x => x.videoId !== entry.videoId)
    ].slice(0, 2000);
    this.save();
  }

  stats() {
    const plays = this.state.history;
    const byArtist = new Map();
    const byTrack = new Map();
    for (const item of plays) {
      const artist = item.artist || 'Unknown artist';
      byArtist.set(artist, (byArtist.get(artist) || 0) + 1);
      const key = item.videoId || item.title;
      const prev = byTrack.get(key) || { ...item, plays: 0 };
      prev.plays++;
      byTrack.set(key, prev);
    }
    const topArtists = [...byArtist.entries()]
      .sort((a,b) => b[1] - a[1]).slice(0, 12)
      .map(([artist, plays]) => ({ artist, plays }));
    const topTracks = [...byTrack.values()]
      .sort((a,b) => b.plays - a.plays).slice(0, 20);
    const days = new Set(plays.map(x => new Date(x.playedAt).toISOString().slice(0,10))).size;
    return {
      totalPlays: plays.length,
      uniqueTracks: byTrack.size,
      activeDays: days,
      topArtists,
      topTracks
    };
  }

  smartMix({ limit = 30 } = {}) {
    const seed = [...this.state.liked, ...this.state.history.slice(0, 200)];
    const seen = new Set();
    const unique = seed.filter(x => x?.videoId && !seen.has(x.videoId) && seen.add(x.videoId));
    unique.sort((a,b) => (b.likedAt || b.playedAt || 0) - (a.likedAt || a.playedAt || 0));
    return unique.slice(0, limit);
  }
}

export { DEFAULT_STATE };
