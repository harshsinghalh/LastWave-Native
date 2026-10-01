import crypto from 'node:crypto';

const API = 'https://ws.audioscrobbler.com/2.0/';

function sign(params, secret) {
  const body = Object.keys(params)
    .filter(k => k !== 'format' && k !== 'callback')
    .sort()
    .map(k => k + String(params[k]))
    .join('') + secret;
  return crypto.createHash('md5').update(body, 'utf8').digest('hex');
}

async function parseResponse(response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('Last.fm returned an unreadable response.'); }
  if (!response.ok || data?.error) {
    throw new Error(data?.message || ('Last.fm error ' + response.status));
  }
  return data;
}

export class LastFmService {
  constructor(getSettings) {
    this.getSettings = getSettings;
  }

  creds() {
    const s = this.getSettings()?.lastfm || {};
    return {
      apiKey: String(s.apiKey || '').trim(),
      apiSecret: String(s.apiSecret || '').trim(),
      username: String(s.username || '').trim(),
      sessionKey: String(s.sessionKey || '').trim()
    };
  }

  configured() {
    return Boolean(this.creds().apiKey);
  }

  async get(method, params = {}) {
    const c = this.creds();
    if (!c.apiKey) throw new Error('Add a Last.fm API key in Settings → Integrations.');
    const q = new URLSearchParams({ method, api_key: c.apiKey, format: 'json', ...params });
    return parseResponse(await fetch(API + '?' + q.toString()));
  }

  async post(method, params = {}, requireSession = true) {
    const c = this.creds();
    if (!c.apiKey || !c.apiSecret) throw new Error('Add a Last.fm API key and secret first.');
    if (requireSession && !c.sessionKey) throw new Error('A Last.fm session key is required for scrobbling.');
    const base = {
      method,
      api_key: c.apiKey,
      ...(requireSession ? { sk: c.sessionKey } : {}),
      ...params
    };
    const body = new URLSearchParams({ ...base, api_sig: sign(base, c.apiSecret), format: 'json' });
    return parseResponse(await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    }));
  }

  authUrl(callback = 'lastwave://auth-callback') {
    const c = this.creds();
    if (!c.apiKey) return '';
    const u = new URL('https://www.last.fm/api/auth/');
    u.searchParams.set('api_key', c.apiKey);
    u.searchParams.set('cb', callback);
    return u.toString();
  }

  async completeAuth(token) {
    const c = this.creds();
    if (!c.apiKey || !c.apiSecret) throw new Error('API key and secret are required.');
    const base = { method: 'auth.getSession', token, api_key: c.apiKey };
    const body = new URLSearchParams({ ...base, api_sig: sign(base, c.apiSecret), format: 'json' });
    const data = await parseResponse(await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    }));
    return {
      username: data?.session?.name || '',
      sessionKey: data?.session?.key || ''
    };
  }

  async userInfo(username) {
    const user = username || this.creds().username;
    if (!user) throw new Error('Enter a Last.fm username.');
    const d = await this.get('user.getInfo', { user });
    const u = d.user || {};
    return {
      username: u.name || user,
      realname: u.realname || '',
      playcount: Number(u.playcount || 0),
      playlists: Number(u.playlists || 0),
      image: (u.image || []).at(-1)?.['#text'] || '',
      url: u.url || ''
    };
  }

  async recentTracks(username, limit = 50) {
    const user = username || this.creds().username;
    if (!user) return [];
    const d = await this.get('user.getRecentTracks', { user, limit: String(limit), extended: '1' });
    const rows = d?.recenttracks?.track || [];
    return rows.map(x => ({
      title: x.name || '',
      artist: x.artist?.name || x.artist?.['#text'] || '',
      album: x.album?.['#text'] || '',
      artworkUrl: (x.image || []).at(-1)?.['#text'] || '',
      url: x.url || '',
      playedAt: x.date?.uts ? Number(x.date.uts) * 1000 : Date.now(),
      nowPlaying: x['@attr']?.nowplaying === 'true'
    }));
  }

  async topTracks(username, period = '7day', limit = 50) {
    const user = username || this.creds().username;
    if (!user) return [];
    const d = await this.get('user.getTopTracks', { user, period, limit: String(limit) });
    return (d?.toptracks?.track || []).map(x => ({
      title: x.name || '',
      artist: x.artist?.name || '',
      artworkUrl: (x.image || []).at(-1)?.['#text'] || '',
      plays: Number(x.playcount || 0),
      url: x.url || ''
    }));
  }

  async searchUsers(query, limit = 30) {
    const q = String(query || '').trim();
    if (!q) return [];
    const d = await this.get('user.search', { user: q, limit: String(limit) });
    const rows = d?.results?.usermatches?.user || [];
    return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(u => ({
      username: u.name || '',
      realname: u.realname || '',
      artworkUrl: (u.image || []).at(-1)?.['#text'] || '',
      url: u.url || '',
      playcount: Number(u.playcount || 0)
    }));
  }

  async friends(username, limit = 50) {
    const user = username || this.creds().username;
    if (!user) return [];
    const d = await this.get('user.getFriends', { user, recenttracks: '1', limit: String(limit) });
    return (d?.friends?.user || []).map(u => ({
      username: u.name || '',
      realname: u.realname || '',
      artworkUrl: (u.image || []).at(-1)?.['#text'] || '',
      url: u.url || '',
      recentTrack: u.recenttrack ? {
        title: u.recenttrack.name || '',
        artist: u.recenttrack.artist?.name || u.recenttrack.artist?.['#text'] || ''
      } : null
    }));
  }

  async updateNowPlaying(track) {
    if (!track?.title || !track?.artist) return null;
    return this.post('track.updateNowPlaying', {
      artist: track.artist,
      track: track.title,
      ...(track.album ? { album: track.album } : {}),
      ...(track.durationSeconds ? { duration: String(Math.round(track.durationSeconds)) } : {})
    });
  }

  async scrobble(track, timestamp = Math.floor(Date.now() / 1000)) {
    if (!track?.title || !track?.artist) return null;
    return this.post('track.scrobble', {
      artist: track.artist,
      track: track.title,
      timestamp: String(timestamp),
      ...(track.album ? { album: track.album } : {})
    });
  }

  async love(track, loved = true) {
    if (!track?.title || !track?.artist) return null;
    return this.post(loved ? 'track.love' : 'track.unlove', {
      artist: track.artist,
      track: track.title
    });
  }
}

export { sign as signLastFm };
