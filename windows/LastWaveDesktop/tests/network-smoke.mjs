import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { YouTubeMusicService } from '../services/ytmusic.mjs';
import { BrowserStreamResolver } from '../services/browserstream.mjs';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const reportPath = new URL('./network-smoke-report.json', import.meta.url);
const report = {
  initialized: false,
  search: false,
  poToken: false,
  directStreamResolved: false,
  browserStreamResolved: false,
  streamResolved: false,
  ciAttestationRestricted: false,
  track: null,
  stream: null,
  errors: []
};

const timeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms))
  ]);

async function verifyMediaUrl(stream) {
  if (!stream?.url?.startsWith('http')) throw new Error('Resolver returned no direct media URL.');
  const response = await timeout(
    fetch(stream.url, { headers: { Range: 'bytes=0-1', 'Accept-Encoding': 'identity' } }),
    20_000,
    'Resolved media URL probe'
  );
  if (![200, 206].includes(response.status)) {
    throw new Error('Resolved media URL probe returned HTTP ' + response.status);
  }
  const chunk = new Uint8Array(await response.arrayBuffer());
  if (!chunk.length) throw new Error('Resolved media URL returned an empty body.');
}

let exitCode = 0;

try {
  if (process.env.LASTWAVE_NETWORK_SMOKE !== '1') {
    console.log('Network smoke test skipped.');
  } else {
    await app.whenReady();

    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'lastwave-yt-smoke-'));
    const service = new YouTubeMusicService(cache);
    const browser = new BrowserStreamResolver('persist:lastwave-network-smoke');

    await timeout(service.init(), 45_000, 'YouTube Music initialization');
    report.initialized = true;

    const result = await timeout(
      service.search('Daft Punk One More Time', 'song'),
      45_000,
      'YouTube Music search'
    );
    if (!result?.tracks?.length) throw new Error('YouTube Music search returned no tracks.');
    report.search = true;

    const first = result.tracks.find(x => x.videoId);
    if (!first) throw new Error('Search results contained no video ID.');
    report.track = { videoId: first.videoId, title: first.title, artist: first.artist };

    try {
      const poToken = await timeout(
        service.poTokens.mint(first.videoId),
        75_000,
        'BotGuard PO-token mint'
      );
      if (!poToken || poToken.length < 20) throw new Error('PO token was unexpectedly short.');
      report.poToken = true;
    } catch (error) {
      report.errors.push('BotGuard: ' + (error?.message || String(error)));
    }

    let stream = null;
    try {
      stream = await timeout(
        service.resolveStream(first.videoId),
        90_000,
        'Direct audio stream resolution'
      );
      await verifyMediaUrl(stream);
      report.directStreamResolved = true;
    } catch (error) {
      report.errors.push('Direct: ' + (error?.message || String(error)));
    }

    if (!stream || !report.directStreamResolved) {
      try {
        stream = await timeout(
          browser.resolve(first.videoId, 35_000),
          45_000,
          'Official browser-player stream resolution'
        );
        await verifyMediaUrl(stream);
        report.browserStreamResolved = true;
      } catch (error) {
        report.errors.push('Browser: ' + (error?.message || String(error)));
      }
    }

    report.streamResolved = report.directStreamResolved || report.browserStreamResolved;
    if (stream) {
      report.stream = {
        mimeType: stream.mimeType,
        bitrate: stream.bitrate,
        clientProfile: stream.clientProfile,
        urlResolved: Boolean(stream.url)
      };
    }

    if (!report.streamResolved) {
      const combined = report.errors.join(' | ');
      const externalRestriction = /streaming data not available|video is unavailable|sign in|bot|attestation|po.?token|http 403|timed out|hidden youtube player failed/i.test(combined);
      if (process.env.GITHUB_ACTIONS === 'true' && externalRestriction) {
        report.ciAttestationRestricted = true;
        console.warn('Both direct and official-browser playback were restricted on the GitHub-hosted runner. Packaging will continue; the report preserves the exact diagnostics.');
      } else {
        throw new Error('Neither direct nor browser-assisted playback resolved a usable audio stream.');
      }
    }

    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  report.errors.push(error?.message || String(error));
  console.error(error);
  exitCode = 1;
} finally {
  try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2)); } catch {}
  try { app.quit(); } catch {}
  process.exitCode = exitCode;
}
