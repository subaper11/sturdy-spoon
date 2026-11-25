// Normal (non-Floating) interface on landscape phones: the players column and the dock never cover the board, nothing steals a touch from the board's edges and corners,
// and a finger dragging a tile can really reach the bottom row and every corner (real touch events). Portrait, tablet and desktop must keep behaving exactly as before.
import { launch, openGame, closeGame } from './lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const b = await launch();
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const vp = (w, h, mobile = true) => ({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: true });

// ---- 1. geometry, every landscape phone size, both layouts ----
const PHONES = [[844, 390], [740, 360], [915, 412], [932, 430], [800, 360], [667, 375], [640, 360], [568, 320]];
for (const layout of ['classic', 'duel']) for (const [W, H] of PHONES) {
  const name = `${layout} ${W}x${H}`; console.log('\n# ' + name);
  const { page: p, errors } = await openGame(b, vp(W, H), { storage: { 'scrabble.layout': JSON.stringify({ layout }) } }); await settle(p);
  const g = await p.evaluate(() => {
    const R = s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, bd = R('#board');
    const over = a => Math.min(a.r, bd.r) - Math.max(a.l, bd.l) > 1 && Math.min(a.b, bd.b) - Math.max(a.t, bd.t) > 1;
    const side = document.querySelector('.side').getBoundingClientRect(), c = R('#ctrls');
    const sq = [...document.querySelectorAll('#board > .sq')];
    const at = i => { const r = sq[i].getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e?.closest('#board'); };
    const cells = [0, 14, 112, 126, 210, 224, 217, 7].map(at);   // 4 corners, left/right middle, bottom/top middle
    return { overlap: ['#pn0', '#pn1', '#ctrls'].filter(s => over(R(s))), inside: bd.l >= -0.5 && bd.r <= innerWidth + 0.5 && bd.t >= -0.5 && bd.b <= innerHeight + 0.5,
      ctrlsOut: side.width > 0 ? Math.max(0, c.r - side.right, side.left - c.l) : 0, cells, hs: document.documentElement.scrollWidth > innerWidth };
  });
  ok(g.overlap.length === 0, `${name}: the players and the dock do not cover the board (${g.overlap.join(',') || 'clear'})`);
  ok(g.ctrlsOut < 1, `${name}: the dock stays inside the side column (${g.ctrlsOut.toFixed(0)}px out)`);
  ok(g.inside, `${name}: the whole board is inside the screen`);
  ok(g.cells.every(Boolean), `${name}: every corner and edge square of the board is what a touch hits (${g.cells.map(Number).join('')})`);
  ok(!g.hs, `${name}: no horizontal scroll`);
  ok(errors.length === 0, `${name}: no page errors ${errors.slice(0, 2)}`);
  await closeGame(p);
}

// ---- 2. real touch drags ----
const DRAGS = [[844, 390, true], [740, 360, true], [915, 412, true], [932, 430, true], [667, 375, true], [390, 844, true], [1024, 768, true]];
for (const [W, H] of DRAGS) {
  const name = `touch drag ${W}x${H}`; console.log('\n# ' + name);
  const { page: p, errors } = await openGame(b, vp(W, H), { storage: { 'scrabble.layout': '{}' } }); await settle(p);
  const cdp = await p.createCDPSession();
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((q, i) => ({ x: q[0], y: q[1], id: i + 1 })) });
  // the finger a player would use: the rack tile, then wherever puts the tile's drop point on the target, never below the lowest reachable position
  const plan = await p.evaluate(async () => {
    const { dropY, EDGE } = await import('/js/dropgeom.js');
    const sqs = [...document.querySelectorAll('#board > .sq')], sq0 = sqs[0].getBoundingClientRect().width, size = Math.max(44, sq0 * 1.5), lift = size * 0.85;
    const last = sqs[224].getBoundingClientRect(), rowC = last.top + last.height / 2, vh = innerHeight, targets = {};
    const names = { 'bottom-left': 210, 'bottom-right': 224, 'bottom-mid': 217, 'top-left': 0, 'top-right': 14, 'left-mid': 105, 'right-mid': 119 };
    for (const [k, i] of Object.entries(names)) {
      const r = sqs[i].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let best = null, err = 1e9;
      for (let y = 0; y <= vh - EDGE; y += 0.25) { const e = Math.abs(dropY(y, lift, rowC, vh) - cy); if (e < err) { err = e; best = y; } }
      targets[k] = { i, x: cx, y: best, err, reachable: err < sq0 / 3 };
    }
    return { targets, sq0 };
  });
  for (const [k, t] of Object.entries(plan.targets)) {
    ok(t.reachable, `${name}: the ${k} square can be targeted with a fingertip on screen (finger y ${t.y.toFixed(0)} of ${H}, error ${t.err.toFixed(1)}px of a ${plan.sq0.toFixed(0)}px square)`);
    if (!t.reachable) continue;
    const from = await p.evaluate(() => { const e = document.querySelector('.panel.on .slot .tile'), r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await send('touchStart', [from]);
    for (let s = 1; s <= 8; s++) await send('touchMove', [[from[0] + (t.x - from[0]) * s / 8, from[1] + (t.y - from[1]) * s / 8]]);
    await settle(p); await settle(p);   // touch pointer-moves are delivered on animation frames
    const hl = await p.evaluate(i => ({ which: [...document.querySelectorAll('#board > .sq')].map((q, n) => q.classList.contains('drop') ? n : -1).filter(n => n >= 0).join(','), gt: document.querySelector('.dragGhost')?.style.transform, drop: document.querySelectorAll('#board > .sq.drop').length, onTarget: document.querySelectorAll('#board > .sq')[i].classList.contains('drop'), ghost: !!document.querySelector('.dragGhost') }), t.i);
    if (!(hl.ghost && hl.onTarget && hl.drop === 1)) console.log('   DBG', k, 'aimed', t.i, 'finger', t.x.toFixed(0), t.y.toFixed(0), JSON.stringify(hl));
    ok(hl.ghost && hl.onTarget && hl.drop === 1, `${name}: ${k}: the ghost follows the finger and exactly the intended square is highlighted`);
    await send('touchEnd', []); await settle(p);
    const landed = await p.evaluate(i => { const q = document.querySelectorAll('#board > .sq')[i]; return !!q.querySelector('.tile') && !document.querySelector('.dragGhost'); }, t.i);
    ok(landed, `${name}: ${k}: the tile lands on that very square (no other square, no snapping)`);
    await p.evaluate(() => document.getElementById('bCancel')?.click()); await settle(p);   // take the tile back so the next drag starts clean
  }
  ok(errors.length === 0, `${name}: no page errors ${errors.slice(0, 2)}`);
  await cdp.detach(); await closeGame(p);
}
await b.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
