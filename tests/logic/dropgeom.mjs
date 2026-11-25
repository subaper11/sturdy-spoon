// js/dropgeom.js: where a touch-dragged tile lands. Continuity, monotonicity, no change where the plain lift works, and reachability of the bottom row on short screens.
import { dropY, reachY, EDGE } from '../../js/dropgeom.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

// screens: [viewport height, board bottom, square]; the bottom row's centre is bottom - square/2; the plain lift is 0.85 x max(44, 1.5 x square)
const SCREENS = { 'phone 844x390': [390, 385, 24], 'phone 740x360': [360, 345, 22], 'phone 915x412': [412, 393, 25], 'phone 932x430': [430, 410, 26], 'small 568x320': [320, 216, 13],
  'portrait 390x844': [844, 400, 24], 'tablet 1024x768': [768, 676, 43], 'desktop 1366x768': [768, 700, 40] };
for (const [name, [vh, bottom, sq]] of Object.entries(SCREENS)) {
  const lift = 0.85 * Math.max(44, 1.5 * sq), rowC = bottom - sq / 2, needs = rowC + lift, tight = needs > vh - EDGE;
  if (!tight) {   // the plain lift reaches the bottom row: the function must be the plain lift everywhere
    let same = true; for (let y = 0; y <= vh; y += 1) if (dropY(y, lift, rowC, vh) !== y - lift) same = false;
    ok(same, `${name}: bottom row reachable with the plain lift, so the drop point is exactly the plain lift at every fingertip position`);
    continue;
  }
  ok(needs > vh - EDGE, `${name}: the plain lift would need the finger at y=${needs.toFixed(0)} (screen ${vh}, lowest reachable ${vh - EDGE})`);
  let prev = dropY(0, lift, rowC, vh), mono = true, maxSlope = 0, minSlope = 9;
  for (let y = 0.5; y <= vh + 20; y += 0.5) { const c = dropY(y, lift, rowC, vh), d = (c - prev) / 0.5; if (d < 0) mono = false; maxSlope = Math.max(maxSlope, d); minSlope = Math.min(minSlope, d); prev = c; }
  ok(mono && minSlope > 0, `${name}: the drop point only ever moves with the finger (monotonic, min slope ${minSlope.toFixed(2)}): no jumps, no reversals`);
  ok(maxSlope < 1.5, `${name}: the fade is gentle (the drop point never moves more than ${maxSlope.toFixed(2)}x the finger)`);
  const atMax = dropY(vh - EDGE, lift, rowC, vh);
  ok(Math.abs(atMax - rowC) < 0.01, `${name}: at the lowest reachable fingertip the drop point is the centre of the bottom row (${atMax.toFixed(1)} vs ${rowC.toFixed(1)})`);
  ok(Math.abs(dropY(100, lift, rowC, vh) - (100 - lift)) < 1e-9, `${name}: far from the bottom edge the lift is the plain lift`);
  ok(reachY(lift, rowC, vh) <= vh - EDGE, `${name}: reachY says the bottom row is reachable (${reachY(lift, rowC, vh)})`);
  // every bottom-row square can be targeted by a fingertip that is on screen: its centre is hit by some y <= vh - EDGE
  let allRows = true; for (let r = 0; r < 3; r++) { const c = rowC - r * sq; let hit = false; for (let y = 0; y <= vh - EDGE; y += 0.25) if (Math.abs(dropY(y, lift, rowC, vh) - c) < 0.5) { hit = true; break; } if (!hit) allRows = false; }
  ok(allRows, `${name}: the last three rows can each be targeted with the finger on screen`);
  ok(dropY(vh + 10, lift, rowC, vh) >= atMax, `${name}: below the reachable limit the drop point keeps following (never goes back up)`);
}
// degenerate input never throws or returns NaN
ok(dropY(100, 37, Infinity, 400) === 63 && dropY(100, 37, NaN, 400) === 63 && Number.isFinite(dropY(0, 0, 0, 0)), 'no board / bad numbers: plain lift, finite result');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
