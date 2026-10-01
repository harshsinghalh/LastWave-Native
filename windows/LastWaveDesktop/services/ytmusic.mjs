import { Innertube, UniversalCache, Platform } from 'youtubei.js';

Platform.shim.eval = async data => new Function(data.output)();
import path from 'node:path';

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(', ');
  if (typeof value.text === 'string') return value.text;
  if (Array.isArray(value.runs)) return value.runs.map(r => r?.text || '').join('');
  if (typeof value.name === 'string') return value.name;
  try {
    const s = value.toString?.();
    if (s && s !== '[object Object]') return String(s);
  } catch {}
  return '';
}

function thumbnailOf(node) {
  const candidates = [
    node?.thumbnail?.thumbnails,
    node?.thumbnails,
    node?.thumbnail,
    node?.image?.thumbnails,
    node?.avatar?.thumbnails,
    node?.music_thumbnail_renderer?.thumbnail?.thumbnails
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length) {
      const last = c[c.length - 1];
      if (last?.url) return last.url;
    }
    if (c?.url) return c.url;
  }
  return '';
}

function endpointPayload(node) {
  return node?.endpoint?.payload ||
    node?.navigation_endpoint?.payload ||
    node?.overlay?.content?.endpoint?.payload ||
    node?.menu?.endpoint?.payload ||
    {};
}

function videoIdOf(node) {
  const candidates = [
    node?.video_id, node?.videoId, node?.id,
    node?.endpoint?.payload?.videoId,
    node?.navigation_endpoint?.payload?.videoId,
    node?.overlay?.content?.endpoint?.payload?.videoId
  ];
  return candidates.find(v => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v)) || '';
}

function browseIdOf(node) {
  const p = endpointPayload(node);
  return node?.browse_id || node?.browseId || p?.browseId || '';
}

function artistOf(node) {
  const artists = node?.artists || node?.artist || node?.authors || node?.author;
  if (Array.isArray(artists)) {
    return artists.map(x => textOf(x?.name || x)).filter(Boolean).join(', ');
  }
  return textOf(artists?.name || artists) || textOf(node?.subtitle);
}

function albumOf(node) {
  return textOf(node?.album?.name || node?.album || node?.secondary_text);
}

function durationOf(node) {
  const d = node?.duration?.seconds ?? node?.duration_seconds ?? node?.duration?.text ?? node?.duration;
  if (typeof d === 'number') return d;
  if (typeof d === 'string' && /^\d+:\d+/.test(d)) {
    return d.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  }
  return null;
}

function safeObject(value) {
  if (!value || typeof value !== 'object') return value;
  try {
    if (typeof value.toJSON === 'function') return value.toJSON();
  } catch {}
  return value;
}

export function collectTracks(root, limit = 120) {
  const out = [];
  const seenIds = new Set();
  const visited = new WeakSet();
  const stack = [root];
  let steps = 0;

  while (stack.length && out.length < limit && steps++ < 30000) {
    let node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    const id = videoIdOf(node);
    const title = textOf(node?.title || node?.name || node?.headline);
    if (id && title && !seenIds.has(id)) {
      seenIds.add(id);
      out.push({
        videoId: id,
        title,
        artist: artistOf(node) || 'YouTube Music',
        album: albumOf(node) || '',
        artworkUrl: thumbnailOf(node),
        durationSeconds: durationOf(node),
        browseId: browseIdOf(node)
      });
    }

    for (const key of Object.keys(node)) {
      if (key.startsWith('#') || key === 'actions' || key === 'session') continue;
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; i--) if (value[i] && typeof value[i] === 'object') stack.push(value[i]);
        } else {
          stack.push(value);
        }
      }
    }
  }
  return out;
}

export function collectEntities(root, limit = 80) {
  const out = [];
  const seen = new Set();
  const visited = new WeakSet();
  const stack = [root];
  let steps = 0;

  while (stack.length && out.length < limit && steps++ < 25000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);

    const browseId = browseIdOf(node);
    const title = textOf(node?.title || node?.name);
    if (browseId && title && !seen.has(browseId)) {
      let kind = 'collection';
      if (browseId.startsWith('UC') || browseId.includes('artist')) kind = 'artist';
      else if (browseId.startsWith('MPRE') || browseId.includes('release')) kind = 'album';
      else if (browseId.startsWith('VL') || browseId.startsWith('PL')) kind = 'playlist';
      if (kind !== 'collection') {
        seen.add(browseId);
        out.push({
          browseId,
          title,
          subtitle: artistOf(node) || textOf(node?.subtitle),
          artworkUrl: thumbnailOf(node),
          kind
        });
      }
    }

    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const child of value) if (child && typeof child === 'object') stack.push(child);
        } else stack.push(value);
      }
    }
  }
  return out;
}

function sectionTitle(node) {
  return textOf(node?.title || node?.header?.title || node?.header?.text || node?.header);
}

function collectSections(root) {
  const sections = [];
  const visited = new WeakSet();
  const stack = [root];
  let steps = 0;
  while (stack.length && sections.length < 15 && steps++ < 10000) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) continue;
    visited.add(node);
    const title = sectionTitle(node);
    if (title) {
      const tracks = collectTracks(node, 20);
      if (tracks.length >= 2) sections.push({ title, tracks });
    }
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) value.forEach(x => x && typeof x === 'object' && stack.push(x));
        else stack.push(value);
      }
    }
  }
  const seen = new Set();
  return sections.filter(s => {
    const key = s.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class YouTubeMusicService {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.yt = null;
    this.cookie = '';
    this.streamCache = new Map();
  }

  async init(cookie = '') {
    if (this.yt && cookie === this.cookie) return this.yt;
    this.cookie = cookie || '';
    this.yt = await Innertube.create({
      cookie: this.cookie || undefined,
      cache: new UniversalCache(true, path.join(this.cacheDir, 'youtube-cache')),
      generate_session_locally: true
    });
    this.streamCache.clear();
    return this.yt;
  }

  async search(query, type = 'all') {
    const yt = await this.init(this.cookie);
    const filter = type === 'all' ? {} : { type };
    let result;
    try {
      result = await yt.music.search(query, filter);
    } catch {
      result = await yt.search(query);
    }
    return {
      tracks: collectTracks(result, 80),
      entities: collectEntities(result, 50)
    };
  }

  async suggestions(query) {
    if (!query?.trim()) return [];
    const yt = await this.init(this.cookie);
    try {
      const groups = await yt.music.getSearchSuggestions(query.trim());
      const values = [];
      for (const group of groups || []) {
        const items = group?.contents || group?.suggestions || [];
        for (const item of items) {
          const value = textOf(item?.suggestion || item?.text || item);
          if (value) values.push(value);
        }
      }
      return [...new Set(values)].slice(0, 10);
    } catch {
      try { return (await yt.getSearchSuggestions(query.trim())).slice(0, 10); }
      catch { return []; }
    }
  }

  async home() {
    const yt = await this.init(this.cookie);
    try {
      const feed = await yt.music.getHomeFeed();
      let sections = collectSections(feed);
      if (!sections.length) {
        const tracks = collectTracks(feed, 60);
        sections = [
          { title: 'Quick picks', tracks: tracks.slice(0, 20) },
          { title: 'For you', tracks: tracks.slice(20, 40) },
          { title: 'More music', tracks: tracks.slice(40, 60) }
        ].filter(s => s.tracks.length);
      }
      return sections;
    } catch {
      const fallback = await this.search('popular music');
      return [{ title: 'Explore music', tracks: fallback.tracks.slice(0, 30) }];
    }
  }

  async explore() {
    const yt = await this.init(this.cookie);
    try {
      const feed = await yt.music.getExplore();
      return {
        sections: collectSections(feed),
        tracks: collectTracks(feed, 80),
        entities: collectEntities(feed, 60)
      };
    } catch {
      return this.search('new music');
    }
  }

  async entity(kind, id) {
    const yt = await this.init(this.cookie);
    let value;
    if (kind === 'artist') value = await yt.music.getArtist(id);
    else if (kind === 'album') value = await yt.music.getAlbum(id);
    else value = await yt.music.getPlaylist(id.replace(/^VL/, ''));
    return {
      title: textOf(value?.header?.title || value?.title || value?.name),
      tracks: collectTracks(value, 300),
      entities: collectEntities(value, 100)
    };
  }

  async playlist(id) {
    return this.entity('playlist', id);
  }

  async upNext(videoId) {
    const yt = await this.init(this.cookie);
    try {
      const queue = await yt.music.getUpNext(videoId, true);
      return collectTracks(queue, 80);
    } catch {
      return [];
    }
  }

  async related(videoId) {
    const yt = await this.init(this.cookie);
    try {
      const related = await yt.music.getRelated(videoId);
      return collectTracks(related, 80);
    } catch {
      return [];
    }
  }

  async resolveStream(videoId) {
    const cached = this.streamCache.get(videoId);
    if (cached && cached.expires > Date.now() + 60_000) return cached;
    const yt = await this.init(this.cookie);
    const info = await yt.getBasicInfo(videoId, { client: 'YTMUSIC' });
    let format = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (!format) format = info.chooseFormat({ type: 'audio' });
    if (!format) throw new Error('No playable audio stream was returned.');
    const url = await format.decipher(yt.session.player);
    const entry = {
      url,
      mimeType: format.mime_type || format.mimeType || 'audio/webm',
      bitrate: format.bitrate || 0,
      contentLength: format.content_length || format.contentLength || null,
      expires: Date.now() + 4 * 60 * 60 * 1000
    };
    this.streamCache.set(videoId, entry);
    return entry;
  }

  async youtubeLyrics(videoId) {
    const yt = await this.init(this.cookie);
    try {
      const shelf = await yt.music.getLyrics(videoId);
      return textOf(shelf?.description || shelf?.text || shelf?.contents || shelf);
    } catch {
      return '';
    }
  }

  async rawInfo(videoId) {
    const yt = await this.init(this.cookie);
    const info = await yt.getBasicInfo(videoId, { client: 'YTMUSIC' });
    return safeObject(info);
  }
}
