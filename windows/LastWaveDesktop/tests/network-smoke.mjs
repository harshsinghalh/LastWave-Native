import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YouTubeMusicService } from '../services/ytmusic.mjs';

if (process.env.LASTWAVE_NETWORK_SMOKE !== '1') {
  console.log('Network smoke test skipped.');
  process.exit(0);
}

const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'lastwave-yt-smoke-'));
const service = new YouTubeMusicService(cache);

const timeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms))
  ]);

await timeout(service.init(), 45_000, 'YouTube Music initialization');

const result = await timeout(service.search('Daft Punk One More Time', 'song'), 45_000, 'YouTube Music search');
if (!result?.tracks?.length) throw new Error('YouTube Music search returned no playable tracks.');

const first = result.tracks.find(x => x.videoId);
if (!first) throw new Error('Search results contained no video ID.');

const stream = await timeout(service.resolveStream(first.videoId), 60_000, 'Audio stream resolution');
if (!stream?.url?.startsWith('http')) throw new Error('Audio stream resolver returned no direct URL.');

console.log(JSON.stringify({
  queryResult: { videoId: first.videoId, title: first.title, artist: first.artist },
  stream: { mimeType: stream.mimeType, bitrate: stream.bitrate, urlResolved: true }
}, null, 2));
console.log('LastWave live YouTube Music service smoke test passed.');
