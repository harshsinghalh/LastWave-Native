import { BrowserWindow, session } from 'electron';

function isAudioVideoplayback(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.hostname.includes('googlevideo.com') && !u.pathname.includes('videoplayback')) return false;
    const mime = decodeURIComponent(u.searchParams.get('mime') || '').toLowerCase();
    if (mime.startsWith('audio/')) return true;
    // Some player requests omit mime from the query but expose an audio-only
    // itag. Keep a conservative set of common audio itags as fallback.
    const itag = u.searchParams.get('itag');
    return ['139','140','141','249','250','251','256','258','325','328'].includes(itag);
  } catch {
    return false;
  }
}

function mimeFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const mime = decodeURIComponent(u.searchParams.get('mime') || '');
    return mime || 'audio/webm';
  } catch {
    return 'audio/webm';
  }
}

export class BrowserStreamResolver {
  constructor(partition = 'persist:lastwave-youtube-login') {
    this.partition = partition;
    this.cache = new Map();
    this.inflight = new Map();
  }

  async resolve(videoId, timeoutMs = 25_000) {
    const cached = this.cache.get(videoId);
    if (cached && cached.expires > Date.now() + 60_000) return cached;
    if (this.inflight.has(videoId)) return this.inflight.get(videoId);

    const work = this.#resolveFresh(videoId, timeoutMs)
      .finally(() => this.inflight.delete(videoId));
    this.inflight.set(videoId, work);
    return work;
  }

  async #resolveFresh(videoId, timeoutMs) {
    const ses = session.fromPartition(this.partition);
    let win;
    let timeout;
    let settled = false;

    return new Promise(async (resolve, reject) => {
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        try { ses.webRequest.onBeforeRequest(null); } catch {}
        try {
          if (win && !win.isDestroyed()) win.destroy();
        } catch {}
      };

      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve(value);
      };

      timeout = setTimeout(() => {
        finish(null, new Error('Browser-assisted YouTube audio resolution timed out.'));
      }, timeoutMs);

      try {
        ses.webRequest.onBeforeRequest(
          { urls: ['*://*.googlevideo.com/videoplayback*'] },
          (details, callback) => {
            if (isAudioVideoplayback(details.url)) {
              const entry = {
                url: details.url,
                mimeType: mimeFromUrl(details.url),
                bitrate: 0,
                contentLength: null,
                clientProfile: 'OFFICIAL_EMBED_BROWSER',
                expires: Date.now() + 3 * 60 * 60 * 1000
              };
              this.cache.set(videoId, entry);
              // Let this request continue. The window is destroyed immediately
              // after resolution so it never becomes a second audible player.
              callback({});
              queueMicrotask(() => finish(entry));
              return;
            }
            callback({});
          }
        );

        win = new BrowserWindow({
          show: false,
          width: 640,
          height: 480,
          webPreferences: {
            partition: this.partition,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            autoplayPolicy: 'no-user-gesture-required'
          }
        });
        win.webContents.setAudioMuted(true);
        win.webContents.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        );
        win.webContents.on('did-finish-load', () => {
          // Autoplay can still be conservative on some Chromium builds even
          // with the command-line policy. Explicitly ask the embedded player
          // element to start so its signed audio request is emitted.
          win.webContents.executeJavaScript(
            `document.querySelector('video')?.play?.().catch?.(() => {})`
          ).catch(() => {});
        });
        win.webContents.on('did-fail-load', (_e, code, desc) => {
          if (code !== -3) finish(null, new Error('Hidden YouTube player failed: ' + desc));
        });

        const embed = new URL('https://www.youtube.com/embed/' + videoId);
        embed.searchParams.set('autoplay', '1');
        embed.searchParams.set('controls', '0');
        embed.searchParams.set('playsinline', '1');
        embed.searchParams.set('enablejsapi', '1');
        embed.searchParams.set('origin', 'https://music.youtube.com');
        await win.loadURL(embed.toString());
      } catch (error) {
        finish(null, error);
      }
    });
  }
}

export { isAudioVideoplayback };
