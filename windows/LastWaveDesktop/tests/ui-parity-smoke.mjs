import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/android-parity.css', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../renderer/android-parity.js', import.meta.url), 'utf8');

const androidAdaptive = fs.readFileSync(new URL('../../../app/src/main/java/com/lastwave/app/ui/common/AdaptiveLayout.kt', import.meta.url), 'utf8');
const androidShell = fs.readFileSync(new URL('../../../app/src/main/java/com/lastwave/app/ui/shell/MainShell.kt', import.meta.url), 'utf8');
const androidFeed = fs.readFileSync(new URL('../../../app/src/main/java/com/lastwave/app/ui/feed/FeedScreen.kt', import.meta.url), 'utf8');
const androidPlayer = fs.readFileSync(new URL('../../../app/src/main/java/com/lastwave/app/ui/player/PlayerHost.kt', import.meta.url), 'utf8');

assert.ok(!html.includes('class="sidebar"'), 'Desktop sidebar must not return');
assert.ok(!html.includes('class="topbar"'), 'Desktop top bar must not return');
assert.ok(html.includes('id="floatingDock"'), 'Floating Android dock is required');
assert.ok(html.includes('data-route="feed"') && html.includes('data-route="stats"') && html.includes('data-route="playlists"'), 'Root dock must preserve Android Feed/Stats/Playlists');
assert.ok(html.includes('id="miniPlayer"') && html.includes('id="fullPlayer"'), 'Android mini/full player surfaces are required');
assert.ok(html.includes('android-parity.css') && html.includes('android-parity.js'), 'Parity renderer must be the loaded renderer');

assert.ok(androidAdaptive.includes('screenWidth < 600') && androidAdaptive.includes('screenWidth < 840'), 'Android adaptive breakpoints changed');
assert.ok(css.includes('@media(max-width:839px)') && css.includes('@media(max-width:599px)'), 'Windows must mirror Android 600/840 breakpoints');
assert.ok(androidFeed.includes('adaptiveContentWidth(maxWidth = 920.dp)'), 'Android Feed width contract changed');
assert.ok(css.includes('--header-max:920px'), 'Windows Feed must keep the Android 920dp max-width contract');
assert.ok(css.includes('--screen-max:860px'), 'Windows pushed/root secondary screens must keep the Android 860dp contract');

assert.ok(androidShell.includes('private val DockShape: CornerBasedShape = RoundedCornerShape(32.dp)'), 'Android dock shape changed');
assert.ok(css.includes('border-radius:32px'), 'Windows floating dock must retain Android 32dp shape');
assert.ok(androidShell.includes('Modifier.height(48.dp)'), 'Android nav item height changed');
assert.ok(css.includes('height:48px'), 'Windows dock item must retain Android 48dp height');

assert.ok(androidPlayer.includes('.widthIn(max = 680.dp)'), 'Android mini-player width contract changed');
assert.ok(css.includes('680px'), 'Windows mini/full player must retain Android 680dp max width');
assert.ok(androidPlayer.includes('Modifier.size(56.dp)'), 'Android mini-player art contract changed');
assert.ok(css.includes('width:56px;height:56px'), 'Windows mini-player artwork must retain Android 56dp size');
assert.ok(androidPlayer.includes('RoundedCornerShape(18.dp)'), 'Android mini-player artwork radius changed');
assert.ok(css.includes('border-radius:18px'), 'Windows mini-player artwork must retain Android 18dp shape');

for (const fn of ['renderFeed','renderStats','renderPlaylists','renderSearch','renderDiscover','renderGenres','renderSettings','showFullPlayer']) {
  assert.ok(js.includes('function '+fn+'(') || js.includes('async function '+fn+'('), 'Missing parity renderer function: '+fn);
}
assert.ok(js.includes("S.fullTab==='lyrics'") && !js.includes("if(!S.lyrics)showLyrics()"), 'Lyrics tab must not recurse into showLyrics');

console.log('LastWave Android UI parity smoke test passed.');
