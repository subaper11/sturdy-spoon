// Keeps the CSP script-src hashes in vercel.json equal to the inline <script> blocks of index.html and pwa-check.html (no 'unsafe-inline' for scripts).
// node tools/csp-hashes.mjs          rewrite vercel.json
// node tools/csp-hashes.mjs --check  exit 1 when a hash is missing or stale
import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..'), VJ = path.join(ROOT, 'vercel.json');
export const inlineHashes = () => ['index.html', 'pwa-check.html'].flatMap(f => [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`)).sort();
const want = inlineHashes(), src = fs.readFileSync(VJ, 'utf8');
const rx = /(Content-Security-Policy-Report-Only)", "value": "([^"]*)"/, m = rx.exec(src);
const directive = (p) => p.replace(/script-src [^;]*;/, `script-src 'self' ${want.join(' ')} https://challenges.cloudflare.com;`);
const next = directive(m[2]);
if (process.argv.includes('--check')) { if (next !== m[2]) { console.error('CSP script hashes are stale: run node tools/csp-hashes.mjs'); process.exit(1); } console.log('CSP script hashes match the inline scripts'); }
else { fs.writeFileSync(VJ, src.replace(m[2], next)); console.log(`vercel.json: ${want.length} inline script hashes`); }
