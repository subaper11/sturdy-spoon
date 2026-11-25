// v5.12: values that come from a player or the server (nickname, chat, words, verdict strings) never become markup.
import { boot } from './harness.mjs';
import { html, raw, esc } from '../../js/safehtml.js';
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL: ' + m); } };
const w = boot(); globalThis.window.__xss = 0;
const EVIL = ['<img src=x onerror="window.__xss=1">', '"><script>window.__xss=1</script>', "'><svg onload=window.__xss=1>", '</bdi><b onmouseover=window.__xss=1>x</b>', '&lt;img&gt;'];

console.log('\n# the helper');
ok(String(html`<p>${'<b>'}</p>`) === '<p>&lt;b&gt;</p>', 'interpolations are escaped');
ok(String(html`<p>${raw('<b>')}</p>`) === '<p><b></p>', 'raw() is the explicit way to trust markup');
ok(String(html`<ul>${['<i>', html`<li>${'<u>'}</li>`]}</ul>`) === '<ul>&lt;i&gt;<li>&lt;u&gt;</li></ul>', 'arrays: plain items escaped, nested html`` kept (no double escaping)');
ok(String(html`${null}${undefined}${false}${0}`) === '0', 'null, undefined and false vanish; 0 stays');
ok(String(html`<a title="${'" onclick="x'}">`) === '<a title="&quot; onclick=&quot;x">', 'attribute values cannot break out of their quotes');
ok(esc("&<>\"'") === '&amp;&lt;&gt;&quot;&#39;', 'esc covers the five characters');
ok(String(raw(raw('<b>'))) === '<b>', 'raw(raw(x)) is not escaped twice');

console.log('\n# real render paths with hostile values');
const { chips } = await import('../../js/ui.js');
const { setName, nameHtml } = await import('../../js/names.js');
for (const e of EVIL) {
  const box = document.createElement('div'); document.body.append(box);
  box.innerHTML = chips({ words: [{ w: e, pts: 5 }], bingo: false });
  ok([...box.querySelectorAll('*')].every(n => ['DIV', 'SPAN', 'B'].includes(n.tagName) && ![...n.attributes].some(a => /^on/i.test(a.name))) && box.textContent.includes(e.slice(0, 6)), 'word chip shows the text, creates no element: ' + e.slice(0, 22));
  box.innerHTML = html`<p>${nameHtml(0)}</p>`; setName(0, e); box.innerHTML = html`<p>${nameHtml(0)}</p>`;
  ok(!box.querySelector('img,script,svg,b') && !!box.querySelector('bdi'), 'player name stays inside <bdi> as text: ' + e.slice(0, 22));
  box.remove();
}
const { lobbyHtmlForTest } = await import('../../js/online/lobby.js').catch(() => ({}));
ok(window.__xss === 0, 'nothing executed (window.__xss is still 0)');

console.log('\n# static: no innerHTML template that interpolates data without html``');
import fs from 'fs'; import path from 'path'; import { ROOT } from './harness.mjs';
const guarded = { 'js/ui.js': ['chips', 'histItem'], 'js/judge.js': ['#jB'], 'js/online/session.js': ['#jB'], 'js/replay.js': ['c.innerHTML = html'], 'js/online/lobby.js': ['lbSeat'] };
for (const [f, keys] of Object.entries(guarded)) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  ok(/from '\.\.?\/safehtml\.js'/.test(src), f + ' imports the helper');
  const lines = src.split('\n').filter(l => keys.some(k => l.includes(k)) && /`/.test(l) && /\$\{/.test(l) && /(innerHTML|=>|return)/.test(l));
  ok(lines.length > 0 && lines.every(l => /html`/.test(l) || !/\$\{[^}]*(nick|name|\.w\b|msg|text)/.test(l)), f + ': data-carrying templates use html`` (' + lines.length + ' checked)');
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
