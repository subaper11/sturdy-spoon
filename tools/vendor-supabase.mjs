// Rebuilds assets/vendor/supabase-js.<version>.esm.js: the pinned supabase-js bundled into ONE ES module, so the page never imports from a CDN.
// Needs network (npm registry) once. Usage: node tools/vendor-supabase.mjs   (then node tools/stamp-sw.mjs)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const VERSION = '2.49.4', ROOT = path.resolve(import.meta.dirname, '..'), tmp = mkdtempSync(path.join(tmpdir(), 'eas-vendor-'));
const run = (a, o = {}) => execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', a, { cwd: tmp, stdio: 'inherit', shell: process.platform === 'win32', ...o });
writeFileSync(path.join(tmp, 'package.json'), '{"name":"v","private":true}');
run(['i', `@supabase/supabase-js@${VERSION}`, 'esbuild@0.25.0', '--no-audit', '--no-fund']);
writeFileSync(path.join(tmp, 'e.mjs'), "export * from '@supabase/supabase-js';\n");
const out = `supabase-js.${VERSION}.esm.js`;
execFileSync(process.execPath, [path.join(tmp, 'node_modules/esbuild/bin/esbuild'), 'e.mjs', '--bundle', '--format=esm', '--platform=browser', '--minify', '--target=es2020', `--outfile=${out}`], { cwd: tmp, stdio: 'inherit' });
mkdirSync(path.join(ROOT, 'assets/vendor'), { recursive: true });
copyFileSync(path.join(tmp, out), path.join(ROOT, 'assets/vendor', out));
console.log('wrote assets/vendor/' + out);
