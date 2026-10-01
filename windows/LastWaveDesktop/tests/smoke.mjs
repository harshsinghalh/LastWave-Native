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

console.log('LastWave full desktop smoke tests passed.');
