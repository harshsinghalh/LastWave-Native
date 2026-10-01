import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../services/store.mjs';
import { collectTracks, collectEntities } from '../services/ytmusic.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lastwave-desktop-test-'));
const store = new JsonStore(tmp);

const trackA = { videoId: 'dQw4w9WgXcQ', title: 'Test A', artist: 'Artist A', album: 'Album A' };
const trackB = { videoId: 'M7lc1UVf-VE', title: 'Test B', artist: 'Artist B', album: 'Album B' };

assert.equal(store.toggleLike(trackA), true);
assert.equal(store.isLiked(trackA.videoId), true);
assert.equal(store.toggleLike(trackA), false);
assert.equal(store.isLiked(trackA.videoId), false);

const playlist = store.createPlaylist('Desktop Mix');
store.addToPlaylist(playlist.id, [trackA, trackB, trackA]);
assert.equal(store.state.playlists[0].tracks.length, 2);
store.addHistory(trackA);
store.addHistory(trackB);
store.addHistory(trackA);
assert.equal(store.stats().totalPlays, 3);
assert.equal(store.stats().topTracks[0].videoId, trackA.videoId);

const fake = {
  contents: [
    {
      video_id: trackA.videoId,
      title: { text: trackA.title },
      artists: [{ name: trackA.artist }],
      album: { name: trackA.album },
      thumbnail: { thumbnails: [{ url: 'https://example.com/a.jpg' }] }
    },
    {
      endpoint: { payload: { browseId: 'UC123456789' } },
      title: { text: 'Artist Card' },
      thumbnail: { thumbnails: [{ url: 'https://example.com/artist.jpg' }] }
    }
  ]
};
const tracks = collectTracks(fake);
assert.equal(tracks.length, 1);
assert.equal(tracks[0].videoId, trackA.videoId);
assert.equal(tracks[0].artist, trackA.artist);
const entities = collectEntities(fake);
assert.equal(entities.some(x => x.browseId === 'UC123456789'), true);

const profile = JSON.parse(fs.readFileSync(new URL('../resources/generated_profile.json', import.meta.url), 'utf8'));
assert.equal(profile.minimum_db, -2);
assert.equal(profile.maximum_db, 5);
assert.equal(profile.pre_drop_db, -2);
assert.equal(profile.impact_db, 5);
assert.ok(profile.lookahead_ms >= 40 && profile.lookahead_ms <= 150);


// Android-parity renderer contract. This intentionally checks structure, not
// screenshots: Windows may widen content responsively, but it must keep the
// Android app's hierarchy instead of regressing to a sidebar/topbar/footer UI.
const html = fs.readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/styles.css', import.meta.url), 'utf8');
const renderer = fs.readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8');

assert.equal(html.includes('class="sidebar"'), false, 'desktop sidebar must not return');
assert.equal(html.includes('class="topbar"'), false, 'desktop topbar must not return');
assert.equal(html.includes('class="player"'), false, 'Spotify-style fixed footer must not return');
assert.ok(html.includes('class="floating-nav"'), 'Android floating navigation is required');
assert.ok(html.includes('data-route="feed"') && html.includes('data-route="stats"') && html.includes('data-route="playlists"'));
assert.ok(html.includes('id="generatorFab"'), 'Playlists generator satellite FAB is required');
assert.ok(html.includes('id="miniPlayer"'), 'Android-style mini player is required');
assert.ok(html.includes('id="fullPlayer"'), 'expanded Android player is required');
assert.ok(html.includes('data-player-tab="now"') && html.includes('data-player-tab="lyrics"') && html.includes('data-player-tab="queue"'));

assert.ok(css.includes('--content-max:920px'), 'Feed max width must mirror Android 920dp');
assert.ok(css.includes('--pushed-max:860px'), 'Pushed screens must mirror Android 860dp');
assert.ok(css.includes('--settings-max:760px'), 'Settings/Generator must mirror Android 760dp');
assert.ok(css.includes('width:min(680px'), 'wide mini-player must cap at Android 680dp');
assert.ok(css.includes('@media(max-width:839px)') && css.includes('@media(max-width:599px)'), 'Material width-class breakpoints are required');
assert.ok(css.includes('.expressive-header') && css.includes('border-radius:0 0 24px 24px'));
assert.ok(css.includes('.quick-picks-grid') && css.includes('grid-template-rows:repeat(3,64px)'));

assert.ok(renderer.includes("['feed','stats','playlists']"), 'only the Android three root tabs may persist');
assert.ok(renderer.includes('function openFullPlayer') && renderer.includes('function closeFullPlayer'));
assert.ok(renderer.includes("S.playerTab==='lyrics'"), 'lyrics full-player state is required');
assert.ok(renderer.includes("route !== 'playlists'"), 'Generator FAB must be scoped to Playlists');

console.log('LastWave full desktop smoke tests passed.');
