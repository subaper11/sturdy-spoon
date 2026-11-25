// Vercel build step: copies ONLY the files a browser needs into dist/, so the repository's other folders (supabase/ sources and migrations, tests/, docs/, tools/)
// are never served from the public site. Run after write-env.mjs and stamp-sw.mjs (the copies must carry the generated env.js and the stamped sw.js).
//   node tools/build-dist.mjs            -> dist/
// The list is explicit on purpose: a new top-level file or folder is not published until it is added here.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = process.env.EAS_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, process.env.EAS_DIST || 'dist');
const PUBLIC = ['index.html', 'manifest.webmanifest', 'sw.js', 'pwa-check.html', 'css', 'js', 'assets'];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
let files = 0;
const copy = (rel) => {
  const from = path.join(root, rel), to = path.join(out, rel), st = fs.statSync(from);
  if (st.isDirectory()) { fs.mkdirSync(to, { recursive: true }); for (const f of fs.readdirSync(from)) copy(path.join(rel, f)); }
  else { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); files++; }
};
for (const p of PUBLIC) { if (!fs.existsSync(path.join(root, p))) { console.error(`build-dist: missing ${p}`); process.exit(1); } copy(p); }

// v5.11.1 first-load work, done on the COPY only (the sources stay many small files, and tests keep running against them):
//  (modulepreload hints were tried and measured: they delayed the first frame, so they are not used)
//  1. the render-blocking stylesheets become one file, concatenated in the same order, so the cascade is identical (all url() are relative to css/, which app.css shares);
//  2. dist/sw.js precaches css/app.css (offline start must not depend on a runtime fetch). The stamped VERSION is unchanged: it already hashes every source file.
{
  const idx = path.join(out, 'index.html'); let html = fs.readFileSync(idx, 'utf8');
  const tag = /<link rel="stylesheet" href="(css\/[a-z0-9-]+\.css)">\n?/g, sheets = [...html.matchAll(tag)].map(m => m[1]);
  if (sheets.length < 2) { console.error('build-dist: stylesheet links not found in index.html'); process.exit(1); }
  const css = sheets.map(f => fs.readFileSync(path.join(out, f), 'utf8')); if (css.some(c => /@import/.test(c))) { console.error('build-dist: @import in a stylesheet; cannot concatenate'); process.exit(1); }
  fs.writeFileSync(path.join(out, 'css/app.css'), css.join('\n')); files++;
  let first = true; html = html.replace(tag, () => first ? (first = false, '<link rel="stylesheet" href="css/app.css">\n') : '');
  fs.writeFileSync(idx, html);
  const swp = path.join(out, 'sw.js'), sw = fs.readFileSync(swp, 'utf8'); if (!sw.includes('"index.html",')) { console.error('build-dist: PRECACHE anchor not found in sw.js'); process.exit(1); }
  let patched = sw.replace('"index.html",', '"index.html",\n  "css/app.css",');
  const stillUsed = new Set([...fs.readFileSync(path.join(out, 'pwa-check.html'), 'utf8').matchAll(/href="(css\/[a-z0-9-]+\.css)"/g)].map(m => m[1]));   // the diagnostic page keeps its own sheets
  for (const f of sheets.filter(f => !stillUsed.has(f))) patched = patched.replace(new RegExp(`\\n\\s*"${f.replace(/[.\/]/g, '\\$&')}",?`), '');   // the 15 sources are no longer referenced: do not download them again on install
  fs.writeFileSync(swp, patched);
  console.log(`dist/ optimised: ${sheets.length} stylesheets -> css/app.css`);
}
console.log(`dist/ ready: ${files} files (${PUBLIC.join(', ')})`);
