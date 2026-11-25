# Third-party code shipped in the browser

| File | What | Version | License |
|---|---|---|---|
| `assets/vendor/supabase-js.2.49.4.esm.js` | supabase-js bundled into one ES module with esbuild | 2.49.4 | MIT, (c) Supabase. https://github.com/supabase/supabase-js |

Rebuild: `node tools/vendor-supabase.mjs` (needs the npm registry), then `node tools/stamp-sw.mjs`. To upgrade, change `VERSION` in the tool, the file name in `js/online/supabase-backend.js` and `sw.js` PRECACHE, and the pattern in `tests/pwa/static.mjs`.
