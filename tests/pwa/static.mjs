// Static PWA checks (no browser): manifest, icons, paths, precache coverage, version stamp.
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).split(path.sep).join('/')]);

// --- manifest
const mf = JSON.parse(rd('manifest.webmanifest'));
for (const k of ['name', 'short_name', 'description', 'lang', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons']) ok(mf[k], `manifest has ${k}`);
ok(mf.display === 'standalone', 'display standalone');
ok(mf.start_url === './' && mf.scope === './', 'start_url and scope are relative to the manifest (deployment base path)');
ok(!/^\//.test(mf.start_url) && mf.icons.every(i => !/^\//.test(i.src)), 'no root-relative URLs in the manifest');
ok(mf.short_name.length <= 15, 'short_name is short enough for a home screen label');
const png = p => { const b = fs.readFileSync(path.join(root, p)); return { sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] }; };
for (const i of mf.icons) {
  ok(fs.existsSync(path.join(root, i.src)), `icon exists: ${i.src}`);
  const { sig, w, h } = png(i.src), [sw, sh] = i.sizes.split('x').map(Number);
  ok(sig === '89504e470d0a1a0a' && w === sw && h === sh, `${i.src} is a real PNG of ${i.sizes} (got ${w}x${h})`);
}
ok(mf.icons.some(i => i.sizes === '192x192' && i.purpose === 'any') && mf.icons.some(i => i.sizes === '512x512' && i.purpose === 'any'), '192 and 512 any icons');
ok(mf.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), '512 maskable icon');
ok(mf.icons.every(i => !/\s/.test(i.purpose) ), 'purposes are not combined ("any maskable" renders badly on some launchers)');
const apple = png('assets/icons/apple-touch-icon.png');
ok(apple.w === 180 && apple.h === 180 && apple.type === 2, 'apple-touch-icon is 180x180 and opaque (colour type RGB, no alpha)');
ok(png('assets/icons/maskable-512.png').type === 2, 'maskable icon is opaque full-bleed');
ok(png('assets/icons/icon-512.png').type === 6, '"any" icon keeps its transparent rounded corners');

// --- index.html
const html = rd('index.html');
ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'manifest linked (relative)');
ok(/<meta name="theme-color"/.test(html) && /<meta name="viewport"[^>]*viewport-fit=cover/.test(html), 'theme-color and viewport-fit=cover');
ok(/rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon\.png"/.test(html), 'apple-touch-icon linked');
ok(/apple-mobile-web-app-capable/.test(html) && /mobile-web-app-capable" content="yes"/.test(html) && /apple-mobile-web-app-title/.test(html), 'iOS + Chromium web-app metadata');
const refs = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^(https?:|data:|mailto:)/.test(u));
for (const r of refs) { ok(!r.startsWith('/'), `index.html reference is relative: ${r}`); ok(fs.existsSync(path.join(root, r)), `index.html reference resolves: ${r}`); }

// --- no root-relative URLs anywhere in shipped code (would break a /repo/ sub-path)
for (const f of ['index.html', 'sw.js', ...walk('css'), ...walk('js')]) {
  const t = rd(f);
  const bad = [...t.matchAll(/(?:url\(\s*['"]?|href=["']|src=["']|fetch\(\s*['"`]|register\(\s*['"`]|from\s+['"])\/(?!\/)/g)];
  ok(bad.length === 0, `no root-relative URL in ${f}`);
}

// --- service worker: precache list covers everything the game loads, nothing missing, version stamped
const sw = rd('sw.js');
const list = new Function('return ' + /const PRECACHE = (\[[\s\S]*?\]);/.exec(sw)[1])();
ok(new Set(list).size === list.length, 'PRECACHE has no duplicates');
for (const p of list) ok(fs.existsSync(path.join(root, p)), `PRECACHE file exists: ${p}`);
const shipped = ['index.html', 'manifest.webmanifest', ...walk('css'), ...walk('js'), ...walk('assets')];
for (const p of shipped) ok(list.includes(p), `shipped file is precached: ${p}`);
const mods = walk('js').flatMap(f => [...rd(f).matchAll(/(?:from\s+|import\()\s*'(\.{1,2}\/[^']+)'/g)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]))));   // resolved against the importing file (js/online/* imports ../x.js)
for (const m of mods) ok(list.includes(m), `imported module is precached: ${m}`);
for (const m of rd('css/style.css').matchAll(/url\('\.\.\/([^']+)'\)/g)) ok(list.includes(m[1]), `CSS asset is precached: ${m[1]}`);
ok(!list.some(p => /^(tests|tools)\//.test(p)), 'dev-only folders are not precached');
ok(!/const VERSION = 'dev'/.test(sw), 'sw.js VERSION has been stamped');
try { execFileSync('node', ['tools/stamp-sw.mjs', '--check'], { cwd: root, stdio: 'pipe' }); ok(true); }
catch (e) { ok(false, 'sw.js VERSION is current: ' + (e.stderr || e.stdout || e.message)); }

// --- themes + board styling guards
const themesCss = rd('css/themes.css'), styleCss = rd('css/style.css');
const themeBlocks = [...themesCss.matchAll(/\[data-theme="(\w+)"\]\s*\{([\s\S]*?)\n\}/g)].map(m => [m[1], new Set([...m[2].matchAll(/(--[\w-]+)\s*:/g)].map(t => t[1]))]);
const allTokens = new Set(themeBlocks.flatMap(([, t]) => [...t]));
ok(themeBlocks.length === 4, 'four theme blocks found in themes.css');
for (const [id, toks] of themeBlocks) { const missing = [...allTokens].filter(t => !toks.has(t)); ok(!missing.length, `theme ${id} defines every token (missing: ${missing.join(', ')})`); }
ok(allTokens.has('--tile-cast'), 'themes define --tile-cast (colour of the shadow a placed tile casts)');
// Placed tiles carry no glow and no coloured outline: a pending tile (.cur) is told apart by tint + lifted shadow only. The flicker belongs to .pick (touch) only.
const curRule = styleCss.match(/\n\.tile\.cur\{([^}]*)\}/);
ok(curRule && !/box-shadow/.test(curRule[1]) && /background:/.test(curRule[1]), '.tile.cur (placed, unscored tile) has no box-shadow of its own: no ring, no glow (edge + cast shadow come from .sq .tile and .sq.has::before)');
ok(!/tile-cur-ring/.test(styleCss + themesCss), 'the old pending-tile ring token is gone');
const rm = styleCss.match(/@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\n\.tile\.pick::after\{[^}]*\}\}/);
ok(rm && /\.tile\.pick::after\{animation:blink[^}]*!important/.test(rm[0]) && /\*,\*::before,\*::after\{animation:none!important/.test(rm[0]), 'reduce-motion still disables every animation except the picked tile\'s flicker');
ok(/\.sq\.has::before\{[^}]*var\(--tile-cast/.test(styleCss), 'board tiles cast their shadow from the square (.sq.has::before, themed by --tile-cast)');
ok(/\.sq\.has\.fall::before\{animation:cast/.test(styleCss) && /@keyframes cast\{from\{transform:[^}]*opacity/.test(styleCss), 'landing shadow animates transform + opacity only');
ok(!/@keyframes cast\{[^]*?(box-shadow|filter)/.test(styleCss.match(/@keyframes cast\{[^\n]*/)[0]), 'landing shadow keyframes do not animate box-shadow/filter (repaint-free)');
// Word log: a regular member of the control palette (.ctrls), same icon + .lbl structure as its siblings, with an accessible name
const indexHtml = rd('index.html'), bLog = indexHtml.match(/<button[^>]*id="bLog"[^>]*>([\s\S]*?)<\/button>/), ctrlsHtml = (indexHtml.match(/<div class="ctrls"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/) || [])[1] || '';
ok(bLog && /aria-label="[^"]+"/.test(bLog[0]) && /<svg class="ic"/.test(bLog[1]) && /<span class="lbl">[^<]+<\/span>/.test(bLog[1]) && ctrlsHtml.includes('id="bLog"') && (indexHtml.match(/id="bLog"/g) || []).length === 1 && !/<section class="boardWrap">[\s\S]*?<\/section>/.exec(indexHtml)[0].includes('bLog'), 'word-log button lives in .ctrls (svg.ic + span.lbl, aria-label), exactly once, not in .boardWrap');


// v5.10.1 motion budget: the dock never animates a layout property; the picked tile / turn glow / pause pulse animate opacity only
{
  const barCss = fs.readFileSync(path.join(root, 'css/bar.css'), 'utf8');
  const btnRule = /body #ctrls \.btn\{[^}]*\}/.exec(barCss)?.[0] || '';
  ok(btnRule && !/transition:[^;}]*(width|flex|margin|max-width|padding)/.test(btnRule), 'dock buttons do not transition width / flex / margin (layout reflow on every frame)');
  ok(!/#toolRow\{[^}]*transition:[^;}]*(max-width|padding)/.test(barCss), 'the tool row does not transition max-width / padding');
  ok(/:is\(#bSwap,#bPass,#bUndo\)\{display:none\}/.test(barCss), 'buttons outside the current dock state are display:none');
  const stCss = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  ok(!/@keyframes blink\{[^\n]*box-shadow/.test(stCss), 'blink keyframes do not animate box-shadow');
  ok(!/\.panel\{[^}]*transition:[^;}]*box-shadow/.test(stCss), 'panel does not transition box-shadow');
}


// v5.10.3 start-up: no transitions while booting (1,100+ colour transitions on the 225 squares at load were non-composited work on the critical path)
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok(/classList\.add\('boot'\)/.test(html) && /html\.boot \*,html\.boot \*::before,html\.boot \*::after\{transition:none!important\}/.test(fs.readFileSync(path.join(root, 'css/style.css'), 'utf8')) && /classList\.remove\('boot'\)/.test(fs.readFileSync(path.join(root, 'js/main.js'), 'utf8')), 'no transitions while booting, and boot is released by main.js');
}

// v5.10.4 layout stability: the player panels + 7-slot racks ship in the HTML (nothing is inserted when js/ui.js runs), and a synchronous first-paint fit sets --fill / --ui before the first frame
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8'), css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  const pl = /<div class="players" id="players">([\s\S]*?)<\/div><\/div><\/div>\s*<div class="ctrls"/.exec(html);
  ok(!!pl && /id="pn0"/.test(pl[1]) && /id="pn1"/.test(pl[1]) && /id="rk0"/.test(pl[1]) && /id="rk1"/.test(pl[1]) && /id="t0"/.test(pl[1]) && /id="sc1"/.test(pl[1]), 'panels, clocks, scores and racks are in index.html');
  ok((pl ? pl[1].match(/class="slot" data-p="[01]" data-i="[0-6]"/g) || [] : []).length === 14, 'both racks ship 7 slots');
  ok(/if \(!\$\('#pn0'\)\) \$\('#players'\)\.innerHTML/.test(ui), 'buildDom reuses the shipped panels (builds them only when missing)');
  ok(/data-pp/.test(html) && /html\.boot:not\(\[data-pp\]\) :is\(\.app,\.cover\)\{visibility:hidden\}/.test(css), 'first-paint fit marks data-pp; the game area and the landing screen wait for it only while .boot is on');
  ok(/setProperty\('--ui'/.test(html) && /setProperty\('--fill'/.test(html) && /scrabble\.floatWorkspace\.v2/.test(html), 'first-paint fit sets --ui and --fill and skips Floating Workspace');
  ok(html.indexOf('</main>') < html.indexOf("setAttribute('data-pp'") && html.indexOf("setAttribute('data-pp'") < html.indexOf('js/main.js'), 'first-paint fit runs after the game area and before the module');
}

// v5.10.4b: the landing screen is part of the first paint, the game area is not drawn behind it, data-app-ready is set when start-up is complete
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(root, 'css/cover.css'), 'utf8'), main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  ok(/<section id="cover" class="cover" aria-label="[^"]*">/.test(html) && !/<section id="cover"[^>]*hidden/.test(html), 'the landing screen is not hidden in index.html');
  ok((html.match(/class="cl" data-v="\d+" style="--i:\d+"/g) || []).length === 14, 'the 14 title tiles ship in index.html');
  ok(/<body class="coverOn">/.test(html) && /<main class="app" inert>/.test(html), 'body.coverOn and an inert game area from the first byte');
  ok(/body\.coverOn \.app\{visibility:hidden\}/.test(css), 'the game area is not drawn while the landing screen is up');
  ok(!/animation:tileIn/.test(css), 'no tile entrance animation at start-up (desktop TBT)');
  ok(/data-app-ready/.test(main) && main.indexOf('showCover') < main.indexOf("data-app-ready"), 'data-app-ready is set after the cover is wired');
}

// v5.10.4c: the landing screen's labels are translated in the first-paint script and must equal the dictionary (a label that appeared only after start-up was the LCP element, ~4 s)
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), dict = fs.readFileSync(path.join(root, 'js/i18n-ui.js'), 'utf8');
  const T = /var T=\{id:\[([^\]]*)\],en:\[([^\]]*)\]\}/.exec(html), parse = s => [...s.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\u00b7/g, '\u00b7'));
  ok(!!T, 'first-paint script carries the cover labels');
  if (T) {
    const id = parse(T[1]), en = parse(T[2]), ar = ['\u0644\u0639\u0628 \u0645\u062d\u0644\u064a \u00b7 \u062c\u0647\u0627\u0632 \u0648\u0627\u062d\u062f', '\u0627\u0644\u0644\u0639\u0628 \u0639\u0628\u0631 \u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a', '\u0627\u062f\u0639\u0645 \u062a\u0637\u0648\u064a\u0631 \u0627\u0644\u0644\u0639\u0628\u0629', '(\u064a\u0641\u062a\u062d \u0641\u064a \u0646\u0627\u0641\u0630\u0629 \u062c\u062f\u064a\u062f\u0629)', '\u0625\u0646 \u0623\u0639\u062c\u0628\u062a\u0643 \u0627\u0644\u0644\u0639\u0628\u0629 \u0641\u0627\u062f\u0639\u0645 \u062a\u0637\u0648\u064a\u0631\u0647\u0627 \u0628\u062a\u0628\u0631\u0651\u0639 \u0627\u062e\u062a\u064a\u0627\u0631\u064a'];
    ok(id.length === 5 && en.length === 5, 'five labels per language');
    ar.forEach((a, i) => { const line = dict.split('\n').find(l => l.includes('"' + a + '"')) || ''; ok(line.includes('"' + id[i] + '"') && line.includes('"' + en[i] + '"'), `cover label ${i + 1}: first-paint id/en text = dictionary entry`); });
  }
}

// v5.11.0 Settings / navigation / update bar
{
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), pwa = fs.readFileSync(path.join(root, 'js/pwa.js'), 'utf8'), lay = fs.readFileSync(path.join(root, 'js/layout.js'), 'utf8'), main = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
  const ad = /<dialog id="ad"[\s\S]*?<\/dialog>/.exec(html)?.[0] || '';
  ok(ad.indexOf('id="lyFloat"') > 0 && ad.indexOf('id="lyFloat"') < ad.indexOf('id="fsSet"') && ad.indexOf('id="fsSet"') < ad.indexOf('id="lyLang"') && ad.indexOf('id="lyLang"') < ad.indexOf('id="setGameT"'), 'Settings: Floating Mode first, then Fullscreen and Language, then the match');
  ok(ad.indexOf('id="setEssT"') < ad.indexOf('id="setGameT"') && ad.indexOf('id="setGameT"') < ad.indexOf('id="setLookT"') && ad.indexOf('id="setLookT"') < ad.indexOf('id="setHelpT"'), 'Settings: groups in order of importance');
  ok(/id="guideLink" href="https:\/\/arscguide\.vercel\.app\/" target="_blank" rel="noopener noreferrer"/.test(ad) && !/data-rules/.test(ad), 'Settings: one guide link (new tab, noopener), no in-app rules entry');
  ok(/id="goHome"[^>]*aria-label=/.test(ad), 'Settings: main-screen button with an accessible name');
  ok(/role="switch"/.test(lay) && /role="switch"/.test(ad), 'Floating Mode and Fullscreen are switches');
  const bar = /<div id="pwaUpdate"[\s\S]*?<\/div>\s*<button[^>]*id="pwaUpdateGo"[^>]*>[^<]*<\/button>\s*<\/div>/.exec(html)?.[0] || '';
  ok(bar && (bar.match(/<button/g) || []).length === 1 && !/لاحق|pwaUpdateLater/.test(bar), 'update bar: one button, no "later"');
  ok(!/pwaUpdateLater|updateLater/.test(pwa) && /eas\.updated/.test(pwa) && /eas\.updTry/.test(pwa) && /eas\.updated/.test(main), 'update flow: saves, flags the reload once, rate-limited fallback, consumed after the reload');
  ok(!/relog|ريلوج/i.test(html + pwa), 'no "Relog" wording');
}

console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
