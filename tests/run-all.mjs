// npm test runner. Every suite runs as its own process; the verdict is the process exit status, nothing else.
//   node run-all.mjs                      all suites
//   node run-all.mjs --group server       one group: unit | server | db | e2e | layout | pwa | a11y   (npm run test:unit ...)
//   node run-all.mjs "extra.mjs b"        only suites whose command line contains that text
// A suite that cannot start (missing interpreter, missing file) FAILS: nothing is skipped silently. Exit code is 1 if any suite failed.
import { spawn } from 'child_process'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
import { serve } from './layout/serve.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..');
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const TS = ['--experimental-transform-types', '--no-warnings'];   // suites that import the Deno store.ts
const N = (g, f, ...a) => ({ g, cmd: 'node', args: [...(f.startsWith('!') ? TS : []), f.replace('!', ''), ...a] }), P = (g, f) => ({ g, cmd: PY, args: [f] });
const SUITES = [
  N('unit', '../tools/sync-edge-shared.mjs', '--check'),
  ...['logic/engine.mjs', 'logic/endgame.mjs', 'logic/startup.mjs', 'logic/names.mjs', 'logic/dropgeom.mjs'].map(f => N('unit', f)),
  ...['rooms', 'game', 'security', 'network', 'endgame', 'abandon', 'pause-undo', 'parity', 'tahkim-reason', 'draft', 'explain', 'first-draw', 'env-build', 'hardening', 'tahkim-consensus', 'tahkim-timeout', 'cors', 'body', 'ratelimit', 'chat', 'adaptive'].map(f => N('server', `online/${f}.mjs`)),
  N('server', '!online/heartbeat.mjs'),
  N('db', '!db/postgres.mjs'),   // real Postgres (PGlite): all migrations, the real SupabaseStore, RLS as the API roles see it
  ...['local', 'tahkim-replay', 'fit', 'pause-button', 'run'].map(f => P('e2e', `e2e/${f}.py`)),
  P('a11y', 'contrast.py'),
  N('layout', 'layout/history-toggle.mjs'), N('layout', 'layout/history-toggle-extra.mjs', 'a'), N('layout', 'layout/history-toggle-extra.mjs', 'b'), N('layout', 'layout/log-icon.mjs'), N('layout', 'layout/floating.mjs'), P('layout', 'layout/float_modules.py'),
  ...['arabic-font', 'layering', 'fluid', 'stability', 'settings', 'collapse', 'normal-landscape', 'feel', 'adaptive', 'gfx', 'i18n'].map(f => N('layout', `layout/${f}.mjs`)),
  N('pwa', 'pwa/static.mjs'), N('pwa', 'pwa/dist.mjs'), N('pwa', 'pwa/e2e.mjs')
];
const argv = process.argv.slice(2), gi = argv.indexOf('--group'), group = gi >= 0 ? argv[gi + 1] : null, only = argv.find((a, i) => !a.startsWith('--') && i !== gi + 1);
if (group && !SUITES.some(s => s.g === group)) { console.error(`unknown group "${group}"`); process.exit(2); }

// Chromium: honour CHROME_PATH, else use the one `playwright-core install chromium` put on this machine (Windows, macOS, Linux).
if (!process.env.CHROME_PATH) { try { const p = createRequire(import.meta.url)('playwright-core').chromium.executablePath(); if (p && fs.existsSync(p)) process.env.CHROME_PATH = p; } catch {} }

const sel = SUITES.filter(s => (!group || s.g === group) && (!only || `${s.cmd} ${s.args.join(' ')}`.includes(only)));
const needsServer = sel.some(s => !['unit', 'server', 'db'].includes(s.g));
const { srv, base } = needsServer ? await serve(root) : { srv: null, base: '' };   // async spawn below: spawnSync would block the event loop this static server lives on
const results = [];
for (const s of sel) {
  const name = `${s.cmd === 'node' ? 'node' : 'py'} ${s.args.filter(a => !a.startsWith('--')).join(' ')}`; console.log(`\n=== [${s.g}] ${name}`);
  const t0 = Date.now();
  const r = await new Promise(res => {
    let c; try { c = spawn(s.cmd, s.args, { cwd: here, stdio: 'inherit', env: { ...process.env, BASE: base } }); } catch (e) { return res({ why: `cannot start: ${e.message}` }); }
    c.on('error', e => res({ why: `cannot start ${s.cmd}: ${e.code || e.message}` }));      // ENOENT etc.: a missing interpreter is a failure, not a skip
    c.on('close', (code, sig) => res(sig ? { why: `killed by ${sig}` } : code ? { why: `exit ${code}` } : {}));
  });
  results.push({ ...s, name, ms: Date.now() - t0, why: r.why }); if (r.why) console.log(`>>> FAILED (${r.why}): ${name}`);
}
srv?.close();
console.log('\n--- summary ---'); for (const r of results) console.log(`${r.why ? 'FAIL' : 'ok  '}  [${r.g}] ${r.name}  (${(r.ms / 1000).toFixed(1)}s)${r.why ? '  ' + r.why : ''}`);
const bad = results.filter(r => r.why).length;
console.log(bad ? `\n${bad} of ${results.length} suite(s) FAILED` : `\nALL ${results.length} SUITES PASSED`); process.exit(bad || !results.length ? 1 : 0);
