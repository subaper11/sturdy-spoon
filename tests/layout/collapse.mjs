// Game Tools used to be a module of its own that could be minimized (this file used to test that). It was retired: its buttons live in the dock's tool row (#toolRow, inside .ctrls)
// in every mode, and #tools stays only as an empty, hidden shell so the floating registry and old saved layouts keep working. This suite guards that state.
import { launch, openGame, closeGame } from './lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const b = await launch();
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const WSKEY = 'scrabble.floatWorkspace.v2';
const mk = (extra = {}) => ({ 'scrabble.layout': '{}', [WSKEY]: JSON.stringify({ v: 2, enabled: true, portrait: {}, landscape: {}, ...extra }) });
const mobile = (w, h) => ({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), desk = (w, h) => ({ width: w, height: h, deviceScaleFactor: 1 });
const TOOLS = ['bLog', 'bPause', 'bSettings', 'bNew'];   // visible in every mode (bFs is Floating-only, bReplay appears after a game)
const info = p => p.evaluate(tools => {
  const t = document.querySelector('#tools'), row = document.querySelector('#toolRow'), dock = document.querySelector('.ctrls'), r = dock.getBoundingClientRect();
  const shown = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
  return { shell: !!t && getComputedStyle(t).display === 'none' && !t.querySelector('.btn') && t.dataset.min === undefined, toggle: !!document.getElementById('toolsToggle'),
    inRow: tools.every(id => document.getElementById(id)?.parentNode === row) && !!row.closest('.ctrls'), shown: tools.every(shown), fs: shown('bFs'),
    inView: r.x >= -0.5 && r.y >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 };
}, TOOLS);

for (const [name, vp, storage] of [
  ['default layout, phone portrait 390x844', mobile(390, 844), { 'scrabble.layout': '{}' }],
  ['default layout, desktop 1366x768', desk(1366, 768), { 'scrabble.layout': '{}' }],
  ['floating, phone portrait 390x844', mobile(390, 844), mk()],
  ['floating, phone landscape 844x390', mobile(844, 390), mk()],
  ['floating, tablet 768x1024', desk(768, 1024), mk()],
  ['floating, desktop 1366x768', desk(1366, 768), mk()],
  ['floating, legacy saved state tools:"min"', mobile(390, 844), mk({ tools: 'min' })],
  ['floating, legacy saved state tools:"open"', desk(1366, 768), mk({ tools: 'open' })],
]) {
  console.log('\n# ' + name);
  const { page: p, errors } = await openGame(b, vp, { storage }); await settle(p); await settle(p);
  const i = await info(p), floating = name.startsWith('floating');
  ok(i.shell, '#tools is a hidden shell with no tool buttons and no minimize state (only the engine\'s own drag handles)');
  ok(!i.toggle, 'no #toolsToggle button exists any more');
  ok(i.inRow, 'the tool buttons live in #toolRow inside the dock');
  ok(i.shown, 'the tool buttons are visible and have a size');
  ok(i.fs === floating, `fullscreen button follows the mode (${floating ? 'shown in Floating' : 'hidden in the default layout'})`);
  ok(i.inView, 'the dock is inside the viewport');
  ok(errors.length === 0, 'no page errors ' + errors.slice(0, 2));
  await closeGame(p);
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
