import { launch, openGame } from './lib.mjs';
const b = await launch(); const { page: p } = await openGame(b, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { lang: 'id' });
await p.evaluate(() => document.querySelector('#bSettings').click()); await p.waitForSelector('#ad[open]');
console.log(JSON.stringify(await p.evaluate(() => { const ad = document.querySelector('#ad'), out = []; for (const e of ad.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && r.right > ad.getBoundingClientRect().right + 0.5 || r.left < ad.getBoundingClientRect().left - 0.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '-' + Math.round(r.right)); } return { sw: ad.scrollWidth, cw: ad.clientWidth, adr: Math.round(ad.getBoundingClientRect().right), out: out.slice(0, 8) }; })));
await b.close();
