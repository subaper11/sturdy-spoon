// Adaptive board (v5.7): premium labels and tile values follow the board's own width; the just-played marker never covers the letter; "values: always" setting; long-press peek.
import { launch, openGame, VIEWPORTS } from './lib.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const b = await launch(); const DESK = VIEWPORTS['desktop 1366x768'];
const { page, errors } = await openGame(b, DESK);
// one pending tile next to the centre (the star must stay visible) so there is a tile to measure
await page.evaluate(async () => { const { cur } = await import('/js/state.js'); const G = await import('/js/game.js'); const t = cur().rack.find(t => t && !t.blank); G.place(t, 7, 8); });
const probe = w => page.evaluate(w => {
  const bd = document.getElementById('board'); bd.style.width = w + 'px'; bd.style.maxWidth = 'none';
  const d = (el, pseudo) => el ? getComputedStyle(el, pseudo).display : 'none';
  const k1 = document.querySelector('.sq.k1:not(.has)'), k3 = document.querySelector('.sq.k3:not(.has)'), st = document.querySelector('.sq.k5 .pl');
  const bt = document.querySelector('#board .tile'), rt = document.querySelector('#rk0 .tile, .rack .tile');
  return { w: bd.getBoundingClientRect().width, full: d(k1.querySelector('.wl')), short: d(k1.querySelector('.ws')), wWrap: d(k1.querySelector('.w')), m: d(k1.querySelector('.m')),
    pips1: getComputedStyle(k1, '::before').content, pips3: getComputedStyle(k3, '::before').content, star: d(st?.querySelector('.ws')), starFull: d(st?.querySelector('.wl')),
    boardVal: d(bt.querySelector('i')), rackVal: d(rt.querySelector('i')) };
}, w);
const r = {}; for (const w of [720, 620, 520, 420, 380, 260]) r[w] = await probe(w);
ok(r[720].full !== 'none' && r[720].short === 'none', 'large board: the full word is shown (x2 حرف)');
ok(r[520].full === 'none' && r[520].short !== 'none' && r[520].wWrap !== 'none', 'medium board: the short form (x2 ح)');
ok(r[420].wWrap === 'none' && r[420].m !== 'none', 'small board: only x2 / x3');
ok(r[380].wWrap === 'none' && r[380].m !== 'none' && !/●/.test(r[380].pips1), 'lower edge of the x2 tier (380px board): still text, no pips yet');
ok(r[260].m === 'none' && /●/.test(r[260].pips1) && /■/.test(r[260].pips3), 'tiny board: pips replace the text (round = letter, square = word)');
ok(r[520].pips1 === 'none' || r[520].pips1 === 'normal', 'no pips on a medium board');
ok(r[720].star !== undefined && r[260].star !== 'none' && r[720].starFull !== 'none', 'star: word on a large board, ★ on a small one');
ok(r[720].boardVal !== 'none' && r[520].boardVal !== 'none', 'board: tile values shown on a large / medium board');
ok(r[420].boardVal === 'none' && r[260].boardVal === 'none', 'board: tile values hidden when the board is small (the letter stays)');
ok(Object.values(r).every(x => x.rackVal !== 'none'), 'rack tiles keep their value at every board size (named container)');
// "always" setting
await page.evaluate(() => { document.documentElement.dataset.tvals = 'on'; });
ok((await probe(260)).boardVal !== 'none', 'values: always keeps them on a small board');
await page.evaluate(() => { delete document.documentElement.dataset.tvals; });
// setting row + persistence
await page.evaluate(async () => { document.getElementById('ad').show?.(); });
const row = await page.$('#ad button[data-k="tvals"][data-v="on"]'); ok(!!row, 'Settings has the values row');
if (row) { await row.evaluate(e => e.click()); ok(await page.evaluate(() => document.documentElement.dataset.tvals === 'on' && JSON.parse(localStorage.getItem('scrabble.layout')).tvals === 'on'), 'switching it on applies and saves');
  await (await page.$('#ad button[data-k="tvals"][data-v="auto"]')).evaluate(e => e.click()); ok(await page.evaluate(() => !document.documentElement.dataset.tvals), 'back to auto'); }
// marker: ONE inset ring (it cannot cover the glyph), no corner dot at any size, thinner and softer as the board shrinks
const ring = w => page.evaluate(w => { const bd = document.getElementById('board'); bd.style.width = w + 'px'; document.querySelector('#board .sq.has').classList.add('lm'); const s = document.querySelector('#board .sq.lm'), t = s.querySelector('.tile'), cs = getComputedStyle(t);
  return { sh: cs.boxShadow, lmw: parseFloat(cs.getPropertyValue('--lm-w')) || parseFloat(getComputedStyle(t).getPropertyValue('--lm-w')), after: getComputedStyle(s, '::after').content, anim: cs.animationName, cell: s.getBoundingClientRect().width }; }, w);
const r700 = await ring(700), r450 = await ring(450), r300 = await ring(300);
ok(/inset/.test(r700.sh) && r700.anim === 'none', 'marker: a static inset ring on a large board (no animation)');
ok([r700, r450, r300].every(r => r.after === 'none' || r.after === 'normal' || r.after === '""' && false), 'marker: no corner dot (::after) at any board size');
const inset = r => { const m = /inset 0px 0px 0px ([0-9.]+)px/.exec(r.sh) || /0px 0px 0px ([0-9.]+)px/.exec(r.sh); return m ? +m[1] : NaN; };
ok(inset(r700) >= inset(r450) && inset(r450) >= inset(r300) && inset(r300) <= 1.01, `marker: the ring thins as the board shrinks (${inset(r700)} -> ${inset(r450)} -> ${inset(r300)} px), a hairline on a tiny board`);
// long-press peek (board small, value hidden): the placed tile is pending (.mv) so peek must NOT fire on it
await page.evaluate(() => { document.getElementById('board').style.width = '360px'; });
const c = await page.$eval('#board .sq.has .tile', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await page.mouse.move(c[0], c[1]); await page.mouse.down(); await new Promise(r => setTimeout(r, 600)); await page.mouse.up();
ok(!await page.$('.tvPeek'), 'peek ignores a pending tile (it is being moved)');
// fake a scored tile: strip .mv, then hold
await page.evaluate(() => document.querySelector('#board .sq.has').classList.remove('mv'));
await page.mouse.move(c[0], c[1]); await page.mouse.down(); await new Promise(r => setTimeout(r, 600));
ok(!!await page.$('.tvPeek'), 'long-press on a scored tile with a hidden value shows the bubble');
const txt = await page.$eval('.tvPeek', e => e.textContent); ok(/\d/.test(txt), `bubble shows the value (${txt})`);
await page.mouse.up();
ok(errors.length === 0, 'no page errors: ' + errors.slice(0, 2).join(' | '));
await b.close(); console.log(`adaptive: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
