import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { YouTubeMusicService } from '../services/ytmusic.mjs';
import { BrowserStreamResolver } from '../services/browserstream.mjs';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const timeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + ' timed out')), ms)
    )
  ]);

async function main() {
  await app.whenReady();

  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'lastwave-yt-smoke-'));
  const service = new YouTubeMusicService(cache);
  const browser = new BrowserStreamResolver('lastwave-ci-stream-smoke');

  await timeout(service.init(), 45_000, 'YouTube Music initialization');

  const result = await timeout(
    service.search('Daft Punk One More Time', 'song'),
    45_000,
    'YouTube Music search'
  );
  if (!result?.tracks?.length) {
    throw new Error('YouTube Music search returned no playable tracks.');
  }

  const first = result.tracks.find(x => x.videoId);
  if (!first) throw new Error('Search results contained no video ID.');

  let stream;
  let resolver = 'innertube';
  try {
    stream = await timeout(
      service.resolveStream(first.videoId),
      35_000,
      'InnerTube audio stream resolution'
    );
  } catch (error) {
    console.warn('InnerTube stream resolution unavailable:', error?.message || error);
    resolver = 'official-embed-browser';
    stream = await timeout(
      browser.resolve(first.videoId, 35_000),
      40_000,
      'Browser-assisted audio resolution'
    );
  }

  if (!stream?.url?.startsWith('http')) {
    throw new Error('Audio resolver returned no direct URL.');
  }

  const probe = await timeout(
    fetch(stream.url, { headers: { Range: 'bytes=0-4095' } }),
    25_000,
    'Resolved audio URL probe'
  );
  if (![200, 206].includes(probe.status)) {
    throw new Error('Resolved audio URL returned HTTP ' + probe.status);
  }
  const bytes = new Uint8Array(await probe.arrayBuffer());
  if (!bytes.length) throw new Error('Resolved audio URL returned no bytes.');

  console.log(JSON.stringify({
    queryResult: {
      videoId: first.videoId,
      title: first.title,
      artist: first.artist
    },
    resolver,
    stream: {
      mimeType: stream.mimeType,
      clientProfile: stream.clientProfile,
      httpStatus: probe.status,
      bytesRead: bytes.length
    }
  }, null, 2));
  console.log('LastWave live desktop playback smoke test passed.');
}

try {
  await main();
  app.quit();
} catch (error) {
  console.error(error);
  app.exit(1);
}
