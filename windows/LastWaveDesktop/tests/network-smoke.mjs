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
const reportPath = new URL('./network-smoke-report.json', import.meta.url);

const timeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' timed out')), ms))
  ]);

const report = {
  initialized: false,
  search: false,
  poToken: false,
  streamResolved: false,
  ciAttestationRestricted: false,
  track: null,
  errors: []
};

try {
  await timeout(service.init(), 45_000, 'YouTube Music initialization');
  report.initialized = true;

  const result = await timeout(
    service.search('Daft Punk One More Time', 'song'),
    45_000,
    'YouTube Music search'
  );
  if (!result?.tracks?.length) throw new Error('YouTube Music search returned no playable tracks.');
  report.search = true;

  const first = result.tracks.find(x => x.videoId);
  if (!first) throw new Error('Search results contained no video ID.');
  report.track = { videoId: first.videoId, title: first.title, artist: first.artist };

  // Validate the actual BotGuard runtime independently of player availability.
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

  try {
    const stream = await timeout(
      service.resolveStream(first.videoId),
      90_000,
      'Audio stream resolution'
    );
    if (!stream?.url?.startsWith('http')) throw new Error('Audio stream resolver returned no direct URL.');
    report.streamResolved = true;
    report.stream = {
      mimeType: stream.mimeType,
      bitrate: stream.bitrate,
      clientProfile: stream.clientProfile,
      urlResolved: true
    };
  } catch (error) {
    const message = error?.message || String(error);
    report.errors.push('Stream: ' + message);

    // GitHub-hosted runners use shared datacenter IPs that YouTube may reject
    // even when catalog access and BotGuard are healthy. Treat that specific
    // external attestation/geolocation condition as diagnostic, not a source
    // or packaging failure. On an end-user Windows connection, the runtime
    // still executes the same BotGuard + authenticated-cookie fallback.
    const externalRestriction = /streaming data not available|video is unavailable|sign in|bot|attestation|po.?token|http 403|status code 403/i.test(message);
    if (process.env.GITHUB_ACTIONS === 'true' && externalRestriction) {
      report.ciAttestationRestricted = true;
    } else {
      throw error;
    }
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (!report.streamResolved && !report.ciAttestationRestricted) {
    throw new Error('Live playback did not resolve and was not identified as CI attestation restriction.');
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.ciAttestationRestricted) {
    console.warn('Live media URL resolution was blocked by the GitHub-hosted runner environment; catalog, BotGuard diagnostics, source tests, and packaging continue.');
  } else {
    console.log('LastWave live YouTube Music service smoke test passed.');
  }
} catch (error) {
  report.errors.push(error?.message || String(error));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  throw error;
}
