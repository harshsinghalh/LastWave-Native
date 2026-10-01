import { BotGuardClient, getChallenge } from 'bgutils-js/botguard';
import { buildURL, getHeaders, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const MIN_REFRESH_MARGIN_MS = 60_000;

function defineGlobal(name, value) {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  } catch {
    try { globalThis[name] = value; } catch {}
  }
}

/**
 * Desktop equivalent of Android's BotGuardTokenGenerator.
 *
 * It keeps one BotGuard/WebPO minter warm and can mint tokens bound either to
 * a video ID (player/content token) or to visitorData (GVS/session token).
 * The implementation follows the official BgUtils Node example.
 */
export class PoTokenService {
  constructor() {
    this.minter = null;
    this.expiresAt = 0;
    this.bootstrapPromise = null;
    this.dom = null;
    this.lastBootstrapError = null;
  }

  get ready() {
    return Boolean(this.minter && Date.now() + MIN_REFRESH_MARGIN_MS < this.expiresAt);
  }

  async mint(identifier) {
    const value = String(identifier || '').trim();
    if (!value) throw new Error('PO token binding identifier is empty.');
    const minter = await this.#ensureMinter();
    return minter.mintAsWebsafeString(value);
  }

  async mintPair(videoId, visitorData) {
    const minter = await this.#ensureMinter();
    const playerToken = await minter.mintAsWebsafeString(String(videoId));
    const binding = String(visitorData || videoId);
    const sessionToken = binding === String(videoId)
      ? playerToken
      : await minter.mintAsWebsafeString(binding);
    return { playerToken, sessionToken };
  }

  async #ensureMinter() {
    if (this.ready) return this.minter;
    if (this.bootstrapPromise) return this.bootstrapPromise;

    this.bootstrapPromise = this.#bootstrap()
      .finally(() => { this.bootstrapPromise = null; });
    return this.bootstrapPromise;
  }

  async #bootstrap() {
    try {
      this.#installDom();

      const challenge = await getChallenge({
        fetchFunction: fetch,
        requestKey: REQUEST_KEY
      });

      const interpreterJavascript =
        challenge?.interpreterJavascript?.privateDoNotAccessOrElseSafeScriptWrappedValue;
      if (!interpreterJavascript) {
        throw new Error('BotGuard challenge did not contain interpreter JavaScript.');
      }

      new Function(interpreterJavascript)();

      const botGuardClient = await BotGuardClient.create({
        program: challenge.program,
        globalName: challenge.globalName,
        globalObject: globalThis
      });

      const webPoSignalOutput = [];
      const botguardResponse = await botGuardClient.snapshot({ webPoSignalOutput });

      const response = await fetch(buildURL('GenerateIT', true), {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify([REQUEST_KEY, botguardResponse])
      });
      if (!response.ok) {
        throw new Error(`GenerateIT returned HTTP ${response.status}.`);
      }

      const payload = await response.json();
      if (!Array.isArray(payload) || !payload[0]) {
        throw new Error('GenerateIT returned an unsupported token payload.');
      }

      const [integrityToken, estimatedTtlSecs, mintRefreshThreshold, websafeFallbackToken] = payload;
      const integrityTokenData = {
        integrityToken,
        estimatedTtlSecs,
        mintRefreshThreshold,
        websafeFallbackToken
      };

      this.minter = await WebPoMinter.create(integrityTokenData, webPoSignalOutput);
      const ttlSeconds = Number(estimatedTtlSecs);
      this.expiresAt = Date.now() +
        (Number.isFinite(ttlSeconds) && ttlSeconds > 120 ? (ttlSeconds - 60) * 1000 : 45 * 60 * 1000);
      this.lastBootstrapError = null;
      return this.minter;
    } catch (error) {
      this.minter = null;
      this.expiresAt = 0;
      this.lastBootstrapError = error?.message || String(error);
      throw error;
    }
  }

  #installDom() {
    if (this.dom) return;

    const dom = new JSDOM(
      '<!DOCTYPE html><html lang="en"><head><title>LastWave BotGuard</title></head><body></body></html>',
      {
        url: 'https://www.youtube.com/',
        referrer: 'https://www.youtube.com/',
        userAgent: USER_AGENT
      }
    );

    this.dom = dom;
    defineGlobal('window', dom.window);
    defineGlobal('document', dom.window.document);
    defineGlobal('location', dom.window.location);
    defineGlobal('origin', dom.window.origin);
    defineGlobal('navigator', dom.window.navigator);
    defineGlobal('self', dom.window);
  }
}

export function appendPoToken(rawUrl, token) {
  if (!token) return rawUrl;
  try {
    const url = new URL(rawUrl);
    url.searchParams.set('pot', token);
    return url.toString();
  } catch {
    const separator = String(rawUrl).includes('?') ? '&' : '?';
    return String(rawUrl) + separator + 'pot=' + encodeURIComponent(token);
  }
}
