import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/android-parity.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8');

assert.match(html, /android-parity\.css/);

for (const route of ['feed','stats','playlists','generator']) {
  assert.match(html, new RegExp('data-route="' + route + '"'));
}

assert.match(css, /#nav\s*\{/);
assert.match(css, /\.android-header|\.page-head/);
assert.match(css, /\.player\s*\{/);
assert.match(css, /\.android-full-player/);
assert.match(css, /--android-max:920px/);
assert.match(css, /@media\(max-width:839px\)/);
assert.match(css, /@media\(max-width:599px\)/);
assert.match(css, /@media\(min-width:840px\)/);

assert.match(js, /function pageHead/);
assert.match(js, /document\.body\.dataset\.route = route/);
assert.match(js, /async function renderFeed/);
assert.match(js, /class="android-quick-grid"/);
assert.match(js, /async function renderSearch/);
assert.match(js, /function showFullPlayer/);
assert.match(js, /function fullPlayerNowMarkup/);
assert.match(js, /function fullPlayerLyricsMarkup/);
assert.match(js, /function fullPlayerQueueMarkup/);
assert.match(js, /android-hidden/);
assert.match(js, /renderNewReleases/);
assert.match(js, /renderProviderModules/);
assert.match(js, /renderHomeSections/);
assert.match(js, /renderExcludedSongs/);
assert.match(js, /renderYouTubeLoginPage/);
assert.match(js, /renderImportPage/);
assert.match(js, /android-settings-tabs/);
assert.match(js, /homeHiddenSections/);
assert.match(js, /excludeTrack/);

// Regression guard: the visible renderer must not use the old permanent
// desktop shell as its primary responsive model.
assert.match(css, /\.topbar\{position:fixed!important;left:-10000px/);
assert.match(css, /\.sidebar\{/);
assert.match(css, /position:fixed!important;inset:auto 0 var\(--android-dock-bottom\)/);

console.log('LastWave Windows Android-UI parity smoke tests passed.');
