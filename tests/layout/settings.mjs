// v5.11 Settings: one system (Game > Settings > main screen > PLAY / ONLINE), Floating Mode first, no rules inside Settings (the guide site has them), one-action update bar.
// Structure + order, switch semantics, persistence, Floating Mode toggled again and again, back to the main screen (with and without a match in progress), the update flow
// (stubbed service worker: one reload, no loop), keyboard + names + touch targets + contrast + overflow in portrait, landscape (phone), tablet and desktop.
import { launch, BASE, VIEWPORTS, openGame, seedHistory } from './lib.mjs';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };
const b = await launch();
const VP = {
  'portrait 390x844': { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'small portrait 360x640': { width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'landscape 844x390': { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'small landscape 667x375': { width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'tablet 820x1180': { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'desktop 1366x768': { width: 1366, height: 768, deviceScaleFactor: 1 },
};
const open = async p => { await p.evaluate(() => document.querySelector('#bSettings').click()); await p.waitForSelector('#ad[open]'); await new Promise(r => setTimeout(r, 150)); };
const lum = c => { const [r, g, bl] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * bl; };
const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const rgb = s => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const floatOn = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('scrabble.floatWorkspace.v2')).enabled === true; } catch { return false; } });
const sw = p => p.evaluate(() => document.querySelector('#ad [data-k="float"]').getAttribute('aria-checked'));

for (const [name, vp] of Object.entries(VP)) for (const lang of ['id', 'ar']) {
  const tag = `${name} ${lang}`;
  const { page: p, errors } = await openGame(b, vp, { lang }); await open(p);
  // ---- structure and hierarchy
  const s = await p.evaluate(() => {
    const ad = document.querySelector('#ad'), r = ad.getBoundingClientRect(), vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
    const heads = [...ad.querySelectorAll('h3.setG')].map(h => h.id), ctrls = [...ad.querySelectorAll('.setPanel button, .setPanel a, .setPanel summary')].filter(vis);
    const f = ad.querySelector('[data-k="float"]'), top = x => x.getBoundingClientRect().top;
    return { heads, firstCtl: ctrls[0]?.dataset.k || ctrls[0]?.id, floatIsFirst: ctrls.every(c => c === f || top(f) <= top(c) + 1), sw: f.getAttribute('role'), checked: f.getAttribute('aria-checked'),
      nameOk: !!document.getElementById(f.getAttribute('aria-labelledby'))?.textContent.trim() && !!document.getElementById(f.getAttribute('aria-describedby').split(' ')[0])?.textContent.trim(),
      home: !!ad.querySelector('#goHome'), homeName: ad.querySelector('#goHome').getAttribute('aria-label'), guide: ad.querySelector('#guideLink')?.outerHTML.slice(0, 200),
      rules: !!ad.querySelector('[data-rules], .rulesTabs, #rdTabs'), later: /لاحق/.test(ad.textContent),
      fits: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, noHScroll: ad.scrollWidth <= ad.clientWidth + 1, h: Math.round(r.height), vh: innerHeight,
      docH: document.documentElement.scrollHeight <= innerHeight + 1 };
  });
  ok(JSON.stringify(s.heads) === '["setEssT","setGameT","setLookT","setHelpT"]', `${tag}: sections in order of importance: essentials, match, look, help (${s.heads})`);
  ok(s.firstCtl === 'goHome' || s.firstCtl === 'aClose' || s.firstCtl === 'float', `${tag}: first control is the title bar or Floating Mode (${s.firstCtl})`);
  ok(s.floatIsFirst, `${tag}: Floating Mode is the top-most setting`);
  ok(s.sw === 'switch' && (s.checked === 'true' || s.checked === 'false') && s.nameOk, `${tag}: Floating Mode is a switch with a name, a description and a state`);
  ok(s.home && /\S/.test(s.homeName) , `${tag}: back-to-main-screen button with an accessible name`);
  ok(/href="https:\/\/arscguide\.vercel\.app\/"/.test(s.guide) && /target="_blank"/.test(s.guide) && /noopener/.test(s.guide), `${tag}: guide link goes to arscguide.vercel.app in a new tab, noopener`);
  ok(!s.rules, `${tag}: no rules / how-to-play content inside Settings`);
  ok(!s.later, `${tag}: no "later" wording in Settings`);
  ok(s.fits && s.noHScroll, `${tag}: the sheet fits the screen and has no sideways scroll`);
  // ---- accessibility: names, targets, contrast
  const a = await p.evaluate(() => {
    const ad = document.querySelector('#ad'), vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; }, bad = [], small = [];
    for (const e of ad.querySelectorAll('button, a[href], summary, input')) {
      if (!vis(e)) continue;
      const name = (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby').split(' ')[0])?.textContent || e.textContent || e.placeholder || e.title || '').trim();
      if (!name) bad.push(e.id || e.className);
      const q = e.getBoundingClientRect(); if (e.matches('input') ? q.height < 36 : q.height < (e.closest('.seg') ? 36 : 40)) small.push((e.id || e.dataset.k || e.className) + ':' + Math.round(q.height));
    }
    const cs = (sel, bgSel = '#ad') => { const e = ad.querySelector(sel); if (!e) return null; return [getComputedStyle(e).color, getComputedStyle(document.querySelector(bgSel)).backgroundColor]; };
    return { bad, small, t: cs('.swFloat .setT'), d: cs('.swFloat .setD'), g: cs('.setG'), seg: cs('.seg .btn[aria-pressed="false"]'), segOn: [getComputedStyle(ad.querySelector('.seg .btn[aria-pressed="true"]')).color, getComputedStyle(ad.querySelector('.seg .btn[aria-pressed="true"]')).backgroundImage] };
  });
  ok(a.bad.length === 0, `${tag}: every control has an accessible name (${a.bad})`);
  ok(a.small.length === 0, `${tag}: touch targets (${a.small})`);
  for (const [k, v] of [['title', a.t], ['description', a.d], ['group heading', a.g], ['option', a.seg]]) if (v) ok(ratio(rgb(v[0]), rgb(v[1])) >= 4.5, `${tag}: ${k} contrast ${ratio(rgb(v[0]), rgb(v[1])).toFixed(2)} on the sheet`);
  // ---- keyboard: Tab reaches the switch, Space toggles it, focus stays on it, Escape closes
  await p.evaluate(() => document.querySelector('#aT').focus());
  let reached = false; for (let i = 0; i < 6 && !reached; i++) { await p.keyboard.press('Tab'); reached = await p.evaluate(() => document.activeElement?.dataset?.k === 'float'); }
  ok(reached, `${tag}: Tab reaches Floating Mode within a few stops`);
  const before = await sw(p); await p.keyboard.press('Space'); await new Promise(r => setTimeout(r, 250));
  ok((await sw(p)) !== before && await p.evaluate(() => document.activeElement?.dataset?.k === 'float'), `${tag}: Space toggles Floating Mode and focus stays on the switch`);
  ok((await floatOn(p)) === ((await sw(p)) === 'true'), `${tag}: the switch and the saved state agree`);
  await p.keyboard.press('Space'); await new Promise(r => setTimeout(r, 250));
  // ---- again and again: no glitch, the sheet stays open and on screen
  for (let i = 0; i < 6; i++) { await p.click('#ad [data-k="float"]'); await new Promise(r => setTimeout(r, 120)); }
  const st = await p.evaluate(() => ({ open: document.querySelector('#ad').open, r: (() => { const q = document.querySelector('#ad').getBoundingClientRect(); return q.left >= -1 && q.right <= innerWidth + 1 && q.top >= -1 && q.bottom <= innerHeight + 1; })(), cells: document.querySelectorAll('#board > div').length, err: window.__err }));
  ok(st.open && st.r && st.cells === 225, `${tag}: after six toggles the sheet is open and on screen, the board has 225 cells`);
  ok((await sw(p)) === 'false' && !(await floatOn(p)), `${tag}: six toggles end where they started`);
  // ---- long content scrolls inside the sheet; the title bar stays
  const sc = await p.evaluate(async () => { const ad = document.querySelector('#ad'); ad.scrollTop = ad.scrollHeight; await new Promise(r => setTimeout(r, 80)); const h = ad.querySelector('.fHead').getBoundingClientRect(), r = ad.getBoundingClientRect(); return { headVisible: h.top >= r.top - 1 && h.bottom <= r.bottom, help: !!document.querySelector('#guideLink').getBoundingClientRect().height }; });
  ok(sc.headVisible && sc.help, `${tag}: scrolled to the end the title bar (with the main-screen button) is still there and the guide row is reachable`);
  await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 150));
  ok(await p.evaluate(() => !document.querySelector('#ad').open), `${tag}: Escape closes Settings`);
  ok(errors.length === 0, `${tag}: no page errors ${errors.join('|')}`);
  await p.close();
}

{ // persistence: the other settings still work and survive a reload
  const { page: p } = await openGame(b, VP['portrait 390x844'], { lang: 'id' }); await open(p);
  for (const sel of ['[data-k="gfx"][data-v="high"]', '[data-k="binfo"][data-v="on"]', '[data-k="hist"][data-v="drawer"]', '[data-k="lang"][data-v="en"]']) await p.evaluate(s => { const e = document.querySelector('#ad ' + s); e.click(); }, sel);
  await p.evaluate(() => document.querySelector('#hpB button, #rkB button[data-v="always"]')?.click());
  await p.click('#thB .thOpt:nth-child(1)'); await new Promise(r => setTimeout(r, 200));
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('scrabble.layout') || '{}'));
  ok(saved.gfx === 'high' && saved.binfo === 'on' && saved.hist === 'drawer' && saved.lang === 'en', `settings persisted: ${JSON.stringify(saved)}`);
  // a second tab of the same browser starts from what the first one saved (the harness re-injects its own storage on a reload of the first)
  const q = await b.newPage(); await q.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await q.goto(BASE + '/index.html', { waitUntil: 'networkidle0' }); await q.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'));
  const pr = await q.evaluate(() => ({ gfx: document.documentElement.dataset.gfx, lang: document.documentElement.dataset.lang, binfo: document.documentElement.dataset.binfo, hist: document.documentElement.dataset.hist, theme: document.documentElement.dataset.theme }));
  ok(pr.gfx === 'high' && pr.lang === 'en' && pr.binfo === 'on' && pr.hist === 'drawer', `a fresh start applies what Settings saved ${JSON.stringify(pr)}`);
  await q.close();
  await p.close();
}

{ // back to the main screen: fresh game (no question), then a match in progress (question, cancel keeps playing, confirm saves + goes home), then PLAY offers the match back
  const { page: p } = await openGame(b, VP['portrait 390x844'], { lang: 'id' });
  await open(p); await p.click('#goHome'); await p.waitForFunction(() => document.querySelector('#cover') && !document.querySelector('#cover').hidden && document.documentElement.hasAttribute('data-app-ready'), { timeout: 8000 });
  ok(await p.evaluate(() => !document.querySelector('#dlg').open && !!document.querySelector('#coverPlay') && !!document.querySelector('#coverOnline')), 'main screen: a game with nothing played goes home without a question; PLAY and ONLINE are there');
  ok(await p.evaluate(() => sessionStorage.getItem('eas.home') === null), 'main screen: the one-shot flag is consumed (no loop)');
  await p.close();
  const { page: q } = await openGame(b, VP['portrait 390x844'], { lang: 'id' }); await seedHistory(q); await new Promise(r => setTimeout(r, 400));
  await open(q); await q.click('#goHome'); await q.waitForSelector('#dlg[open]');
  const txt = await q.evaluate(() => ({ t: document.querySelector('#dT').textContent, m: document.querySelector('#dM').textContent, btn: [...document.querySelectorAll('#dF button')].map(x => x.textContent) }));
  ok(/Layar Utama/.test(txt.t) && /disimpan/.test(txt.m) && txt.btn.length === 2, `match in progress: asks first, says it is saved (${JSON.stringify(txt)})`);
  ok(await q.evaluate(() => !document.querySelector('#ad').open), 'match in progress: the sheet closed, only the question is on screen');
  const hist0 = await q.evaluate(async () => (await import('/js/state.js')).S.hist.length);
  await q.click('#dF button[value=""]'); await new Promise(r => setTimeout(r, 300));
  ok(await q.evaluate(async hist0 => (await import('/js/state.js')).S.hist.length === hist0 && document.querySelector('#cover').hidden, hist0), 'cancel: the match is untouched and still on screen');
  await open(q); await q.click('#goHome'); await q.waitForSelector('#dlg[open]');
  await Promise.all([q.waitForNavigation({ waitUntil: 'networkidle0' }), q.click('#dF button[value="ok"]')]);
  await q.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'));
  ok(await q.evaluate(() => !document.querySelector('#cover').hidden && !!localStorage.getItem('scrabble.match')), 'confirm: on the main screen and the match is saved on this device');
  await q.click('#coverPlay'); await q.waitForSelector('#dlg[open]');
  const res = await q.evaluate(() => ({ t: document.querySelector('#dT').textContent, btn: [...document.querySelectorAll('#dF button')].map(x => x.textContent) }));
  ok(res.btn.length === 2, `PLAY offers the saved match back (${JSON.stringify(res)})`);
  await q.close();
}

{ // the update bar: one action, no "later"; the flow reloads once and does not loop; the saved match is offered after it
  const html = await (await fetch(BASE + '/index.html')).text();
  ok(!/pwaUpdateLater/.test(html) && (html.match(/id="pwaUpdate"[\s\S]*?<\/div>\s*<button[^>]*id="pwaUpdateGo"/) || []).length === 1, 'update bar markup: a single button (Reload)');
  const { page: p } = await openGame(b, VP['portrait 390x844'], { lang: 'id' }); await seedHistory(p); await new Promise(r => setTimeout(r, 400));
  let navs = 0; p.on('framenavigated', f => { if (f === p.mainFrame()) navs++; });
  await p.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('__stub')) return;   // only the first document sees the "new version"; after the reload the app is current
    window.__posted = []; let cc;
    const w = { state: 'installed', postMessage: m => { window.__posted.push(m); sessionStorage.setItem('__stub', '1'); setTimeout(() => { sessionStorage.setItem('__stub', '1'); location.reload(); }, 300); } };   // stands in for skipWaiting + controllerchange
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {}, ready: new Promise(() => {}), addEventListener() {}, register: async () => ({ waiting: w, addEventListener() {}, update() {} }) } });
  });
  await p.reload({ waitUntil: 'networkidle0' }); await p.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready'));
  navs = 0;
  ok(await p.waitForFunction(() => !document.querySelector('#pwaUpdate').hidden, { timeout: 5000 }).then(() => true, () => false), 'update bar appears when a new version is waiting');
  const u = await p.evaluate(() => { const bar = document.querySelector('#pwaUpdate'), r = bar.getBoundingClientRect(), g = document.querySelector('#pwaUpdateGo').getBoundingClientRect(); return { top: Math.round(r.top), btns: bar.querySelectorAll('button').length, txt: bar.textContent.replace(/\s+/g, ' ').trim(), gh: Math.round(g.height), onTop: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).closest('#pwaUpdate') !== null, later: /nanti|later|لاحق/i.test(bar.textContent) }; });
  ok(u.btns === 1 && !u.later && /Muat Ulang/.test(u.txt) && /Versi baru tersedia/.test(u.txt), `update bar: title, one sentence, one button "Muat Ulang" (${u.txt})`);
  ok(u.top < 40 && u.onTop && u.gh >= 44, `update bar: slim bar at the top, above the game, button ${u.gh}px high`);
  await p.click('#pwaUpdateGo'); await new Promise(r => setTimeout(r, 100));
  ok(await p.evaluate(() => document.querySelector('#pwaUpdateGo').disabled && sessionStorage.getItem('eas.updated') === '1' && window.__posted.length === 1 && window.__posted[0].type === 'SKIP_WAITING'), 'Reload: the waiting worker is told to take over, the button is busy, a double tap does nothing more');
  await p.evaluate(() => document.querySelector('#pwaUpdateGo').click());
  await p.waitForFunction(() => document.documentElement.hasAttribute('data-app-ready') && sessionStorage.getItem('__stub') === '1', { timeout: 10000 });
  await p.waitForSelector('#dlg[open]', { timeout: 8000 }).catch(() => {});
  const after = await p.evaluate(() => ({ dlg: document.querySelector('#dlg').open, btn: [...document.querySelectorAll('#dF button')].length, bar: document.querySelector('#pwaUpdate').hidden, saved: !!localStorage.getItem('scrabble.match'), flag: sessionStorage.getItem('eas.updated') }));
  ok(after.saved && after.dlg && after.btn === 2 && after.bar && after.flag === null, `after the update the player lands on the question about the saved match, no bar, flag consumed (${JSON.stringify(after)})`);
  const n0 = navs; await new Promise(r => setTimeout(r, 3500));
  ok(navs === n0 && navs <= 2, `no reload loop: ${navs} navigation(s), none in the 3.5 s after the update`);
  await p.close();
}

await b.close();
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
