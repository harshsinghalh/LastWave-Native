import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const htmlPath = new URL('../renderer/index.html', import.meta.url);
const appPath = new URL('../renderer/app.js', import.meta.url);
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/<script[^>]*src="\.\/app\.js"[^>]*><\/script>/i, '');
const script = fs.readFileSync(appPath, 'utf8');

const dom = new JSDOM(html, {
  url: 'https://lastwave.local/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

window.confirm = () => true;
window.alert = () => {};
window.AudioContext = class {};
window.webkitAudioContext = window.AudioContext;

const sampleTrack = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Parity Test Track',
  artist: 'LastWave Test',
  album: 'Parity',
  artworkUrl: '',
  durationSeconds: 180
};

const state = {
  settings: {
    theme: 'dark',
    accent: '#c6f100',
    djEnergy: true,
    lastfm: {},
    homeHiddenSections: []
  },
  liked: [],
  playlists: [],
  history: [],
  excluded: [],
  downloads: [],
  friends: [],
  searchHistory: ['parity test']
};

const calls = { search: 0 };

window.lastwave = {
  bootstrap: async () => ({
    state,
    profile: { minimum_db: -2, maximum_db: 5, lookahead_ms: 80 },
    streamBase: 'http://127.0.0.1:32123/stream/',
    appVersion: '4.5.0',
    platform: 'win32'
  }),
  state: async () => state,
  openExternal: async () => {},
  showFile: async () => {},
  openDownloads: async () => {},
  settings: {
    update: async patch => Object.assign(state.settings, patch),
    chooseDownloadFolder: async () => ''
  },
  library: {
    toggleLike: async () => true,
    createPlaylist: async name => ({ id: 'local-test', title: name, tracks: [] }),
    renamePlaylist: async () => null,
    deletePlaylist: async () => true,
    addToPlaylist: async () => null,
    removeFromPlaylist: async () => null,
    stats: async () => ({ totalPlays: 0, uniqueTracks: 0, activeDays: 0, topArtists: [], topTracks: [] }),
    smartMix: async () => [sampleTrack],
    excludeTrack: async () => true,
    restoreExcluded: async () => true
  },
  search: { clearHistory: async () => { state.searchHistory = []; } },
  history: { add: async () => true },
  youtube: {
    login: async () => ({ connected: false }),
    logout: async () => true,
    home: async () => [{ title: 'Quick picks', tracks: [sampleTrack] }],
    explore: async () => ({ sections: [], tracks: [sampleTrack], entities: [] }),
    search: async () => { calls.search++; return { tracks: [sampleTrack], entities: [] }; },
    suggestions: async () => ['Parity Test Track'],
    entity: async () => ({ title: 'Entity', tracks: [sampleTrack], entities: [] }),
    playlist: async () => ({ title: 'Playlist', tracks: [sampleTrack] }),
    upNext: async () => [sampleTrack],
    related: async () => [sampleTrack]
  },
  lyrics: { get: async () => ({ provider: 'Test', synced: '', plain: 'Test lyrics', instrumental: false }) },
  downloads: { track: async () => ({ file: 'test.webm', name: 'test.webm' }) },
  imports: {
    youtubePlaylist: async () => ({ id: 'imported', title: 'Imported', tracks: [sampleTrack] }),
    externalUrl: async () => ({ id: 'imported', title: 'Imported', tracks: [sampleTrack] }),
    file: async () => null
  },
  backup: { export: async () => '', import: async () => null },
  lastfm: {
    save: async patch => patch,
    authUrl: async () => '',
    user: async username => ({ username, playcount: 0 }),
    recent: async () => [],
    top: async () => [],
    friends: async () => [],
    searchUsers: async () => [],
    nowPlaying: async () => null,
    scrobble: async () => null,
    love: async () => null
  },
  onLastFmAuth: () => {}
};

window.eval(script);
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const tick = () => new Promise(resolve => setTimeout(resolve, 25));
await tick();
await tick();

assert.equal(document.body.dataset.route, 'feed');
assert.match(document.querySelector('#page')?.textContent || '', /Home/);

const generatorButton = document.querySelector('[data-route="generator"]');
assert.ok(generatorButton, 'Generator navigation button missing');
generatorButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();

assert.equal(document.body.dataset.route, 'generator');
assert.ok(document.querySelector('#generateBtn'), 'Generator screen did not render');

document.querySelector('#genSeed').value = 'parity';
document.querySelector('#generateBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();
await tick();

assert.ok(calls.search > 0, 'Generate did not call YouTube search');
assert.match(document.querySelector('#generatedMix')?.textContent || '', /Parity Test Track/);

// Search parity route should render its Android search header and recent history.
const searchButton = document.querySelector('[data-route="search"]');
assert.ok(searchButton, 'Search navigation button missing');
searchButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await tick();
assert.equal(document.body.dataset.route, 'search');
assert.ok(document.querySelector('.android-search-header'), 'Android search header missing');
assert.match(document.querySelector('#searchBody')?.textContent || '', /Recent searches/);

console.log('LastWave renderer interaction smoke test passed.');
