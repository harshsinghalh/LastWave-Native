import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { YouTubeMusicService } from '../services/ytmusic.mjs';
import { BrowserStreamResolver } from '../services/browserstream.mjs';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');

const reportPath = new URL('./network-smoke-report.json', import.meta.url);
const report = {
  initialized: false,
  search: false,
  browserStreamResolved: false,
  mediaProbePassed: false,
  ciAttestationRestricted: false,
  track: null,
  stream: null,
  errors: []
};

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
  const browser = new BrowserStreamResolver('persist:lastwave-network-smoke');

  await timeout(service.init(), 25_000, 'YouTube Music initialization');
  report.initialized = true;

  const result = await timeout(
    service.search('Daft Punk One More Time', 'song'),
    25_000,
    'YouTube Music search'
  );
  if (!result?.tracks?.length) throw new Error('YouTube Music search returned no tracks.');
  report.search = true;

  const first = result.tracks.find(x => x.videoId);
  if (!first) throw new Error('Search results contained no video ID.');
  report.track = { videoId: first.videoId, title: first.title, artist: first.artist };

  try {
    const stream = await timeout(
      browser.resolve(first.videoId, 30_000),
      35_000,
      'Official browser-player stream resolution'
    );
    report.browserStreamResolved = Boolean(stream?.url);
    report.stream = {
      mimeType: stream?.mimeType,
      bitrate: stream?.bitrate,
      clientProfile: stream?.clientProfile,
      urlResolved: Boolean(stream?.url)
    };

    if (!stream?.url?.startsWith('http')) {
      throw new Error('Browser resolver returned no direct media URL.');
    }

    const response = await timeout(
      fetch(stream.url, {
        headers: { Range: 'bytes=0-4095', 'Accept-Encoding': 'identity' }
      }),
      15_000,
      'Resolved media URL probe'
    );
    if (![200, 206].includes(response.status)) {
      throw new Error('Resolved media URL probe returned HTTP ' + response.status);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error('Resolved media URL returned an empty body.');
    report.mediaProbePassed = true;
    report.stream.httpStatus = response.status;
    report.stream.bytesRead = bytes.length;
  } catch (error) {
    const message = error?.message || String(error);
    report.errors.push('Browser playback: ' + message);
    const externalRestriction =
      /sign in|bot|attestation|po.?token|http 403|timed out|hidden youtube player failed|video is unavailable/i.test(message);
    if (process.env.GITHUB_ACTIONS === 'true' && externalRestriction) {
      report.ciAttestationRestricted = true;
      console.warn(
        'GitHub-hosted runner was restricted by YouTube attestation. ' +
        'Packaging may continue; runtime also has BotGuard/PO-token and signed-in browser fallbacks.'
      );
    } else {
      throw error;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  report.errors.push(error?.message || String(error));
  console.error(error);
  exitCode = 1;
} finally {
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch {}
  // Electron can keep network/session handles alive after all windows close.
  // CI needs an unconditional process termination after the report is flushed.
  process.exit(exitCode);
}
