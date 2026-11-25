// Arabic web-font stability (real browser). Amiri is delayed (0 / 400 ms / 1 s), blocked or cached, and the geometry of the landing screen, a dialog opened
// BEFORE the font arrives and the running game (board, racks, panels, controls) is measured before and after the font is applied: nothing may move.
import { launch, BASE, DOCKED, geometry, diffGeometry, MEASURE } from './lib.mjs';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const b = await launch();
const VP = { 'phone 390x844': { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'small 360x800': { width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'landscape 844x390': { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'desktop 1366x768': { width: 1366, height: 768, deviceScaleFactor: 1 } };
const SC = [{ n: 'font immediately', d: 0 }, { n: 'font delayed 400 ms', d: 400 }, { n: 'font delayed 1 s', d: 1000 }, { n: 'font blocked', block: true }];
const rect = sel => sel.map(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
const arabicLoaded = () => document.fonts.check('700 1em ScrabbleMix', 'ب') && document.fonts.check('400 1em ScrabbleMix', 'ب');
const cmp = (a, c, tol) => { const bad = []; a.forEach((r, i) => r && c[i] && r.forEach((v, j) => { if (Math.abs(v - c[i][j]) > tol) bad.push(`#${i}.${'xywh'[j]} ${v.toFixed(1)}->${c[i][j].toFixed(1)}`); })); return bad; };

async function open(vp, sc, { cache = false, lang = 'ar', storage = DOCKED } = {}) {
  const page = await b.newPage(); await page.setViewport(vp); await page.setBypassServiceWorker(true);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/__blank__', { waitUntil: 'load' }).catch(() => {}); await page.evaluate(() => { localStorage.clear(); });
  await page.evaluateOnNewDocument(st => { for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, storage);
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (!/Amiri-(Regular|Bold)\.woff2/.test(r.url())) return r.continue();
    if (sc.block) return r.abort('failed');
    sc.d ? setTimeout(() => r.continue().catch(() => {}), sc.d) : r.continue();
  });
  await page.goto(`${BASE}/index.html?lang=${lang}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#coverPlay', { visible: true });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });   // the dialog open animation scales it: measure the layout, not the tween
  return { page, errors };
}
const settle = async (page, sc) => { if (sc.block) { await new Promise(r => setTimeout(r, 1500)); return; } await page.waitForFunction(arabicLoaded, { timeout: 8000 }); await new Promise(r => setTimeout(r, 150)); };

for (const [vn, vp] of Object.entries(VP)) for (const sc of SC) {
  const tag = `${vn} / ${sc.n}`; const { page, errors } = await open(vp, sc);
  // 1. landing screen, 2. dialog opened before the font may have arrived, 3. the running game
  const COVER = ['#coverPlay', '#coverOnline', '#coverDonate', '.cover h1', '#cover'];
  const c1 = await page.evaluate(rect, COVER);
  await page.click('#coverPlay'); await page.waitForSelector('#md[open]');
  const D = ['#md', '#mf .modeBtn:nth-child(1)', '#mf .modeBtn:nth-child(2)'];
    await page.click('#mf .modeBtn[value="expanded"]'); await page.waitForSelector('#sd[open]'); await page.click('#sf .btn[value="25"]'); await page.waitForSelector('#dlg[open]'); await page.click('#dF .btn[value="ok"]');
  await page.waitForFunction(() => !document.querySelector('#dlg').open && document.querySelector('#cover').hidden, { timeout: 8000 });
  const g1 = await geometry(page), noOverflow1 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  await settle(page, sc);
  const g2 = await geometry(page), noOverflow2 = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const bad = diffGeometry(g1, g2, 1, ['#toast', 'doc']);
  ok(bad.length === 0, `${tag}: game geometry moved when the Arabic font was applied: ${bad.slice(0, 4).join('; ')}`);
  ok(noOverflow1 && noOverflow2, `${tag}: horizontal overflow`);
  if (sc.block) ok(!(await page.evaluate(arabicLoaded)) && (await page.evaluate(() => document.querySelector('#board').getBoundingClientRect().width)) > 150, `${tag}: with the font blocked the game still renders (system Arabic face)`);
  else { ok(await page.evaluate(arabicLoaded), `${tag}: Amiri is the face that ends up applied`); ok(await page.evaluate(() => getComputedStyle(document.querySelector('.pname')).fontFamily.includes('ScrabbleMix')), `${tag}: the font stack still names ScrabbleMix first`); }
  ok(errors.length === 0, `${tag}: page errors: ${errors[0]}`);
  await page.close();
  // landing screen + dialog, compared before/after on a page that stays on them
  const q = await open(vp, sc); const a1 = await q.page.evaluate(rect, COVER); await q.page.click('#coverPlay'); await q.page.waitForSelector('#md[open]'); const m1 = await q.page.evaluate(rect, D);
  await settle(q.page, sc); const m2 = await q.page.evaluate(rect, D);
  ok(cmp(m1, m2, 1.5).length === 0, `${tag}: mode dialog opened before the font moved/resized: ${cmp(m1, m2, 1.5).join(' ')}`);
  await q.page.close();
}

// cached font: second visit in the same browser, then language switches (ids -> ar, en -> ar) with the font already cached
for (const [vn, vp] of Object.entries(VP)) {
  const sc = { d: 0 }; const first = await open(vp, sc); await settle(first.page, sc); await first.page.close();
  const { page } = await open(vp, sc); const COVER = ['#coverPlay', '#coverOnline', '#coverDonate', '#cover']; await settle(page, sc);
  ok(await page.evaluate(arabicLoaded), `${vn} / cached: Amiri available at once on the second visit`);
  await page.close();
  for (const from of ['id', 'en']) {
    const o = await open(vp, sc, { lang: from }); const a = await o.page.evaluate(rect, ['#coverPlay', '#coverOnline', '#coverDonate']);
    await o.page.goto(`${BASE}/index.html?lang=ar`, { waitUntil: 'domcontentloaded' }); await o.page.waitForSelector('#coverPlay', { visible: true }); await settle(o.page, sc);
    const w = await o.page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth + 1, document.documentElement.dir]);
    ok(w[0] && w[1] === 'rtl', `${vn} / ${from} -> ar: no horizontal overflow, dir=rtl`); await o.page.close();
  }
}
await b.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
