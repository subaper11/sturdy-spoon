# v5.10.3: start-up performance audit

## The one change that ships
**No transitions while booting.** Every board square (225) carried `transition: background-color, border-color`. As the page settled at start-up, all of them ran those colour transitions once: **1,131 transitions in the first second**, none visible, every one style + paint work on the critical path, and what Lighthouse reports as "226 non-composited animated elements".
`index.html` puts `class="boot"` on `<html>` (in the existing pre-paint script), `css/style.css` has `html.boot *{transition:none!important}`, and `js/main.js` (`endBoot`) removes it two frames after start-up (timer fallback for hidden tabs). Keyframe animations and every gameplay transition are untouched; they run as before once boot is over.

Files: `index.html`, `css/style.css`, `js/main.js`, `js/version.js` (5.10.3), `sw.js` (restamped), `tests/pwa/static.mjs` (one guard assertion).

## Measured (Lighthouse 12.8.2, mobile, simulated Slow 4G + 4x CPU; production `dist/` over HTTP/2 + brotli; single-core sandbox)
Absolute scores here are lower than PageSpeed Insights (baseline 60, not 97): only the deltas are meaningful.

| scenario A (as-is), 5 runs, median | before (v5.10.2) | after (v5.10.3) |
|---|---|---|
| Performance score | 60 (41-63) | **71** (58-78; an earlier batch of the same code: 77) |
| TBT | 2,126 ms | **687 ms** |
| Speed Index | 3.51 s | **3.21 s** |
| LCP | 3.45 s | 3.24 s |
| FCP | 1.83 s | 1.88 s (unchanged) |
| CLS | 0 | 0 |
| non-composited animations | 226 | **0** |
| scenario B (no install banner), 3 runs: score | n/a | 73 (56-76), CLS 0, SI 2.87 s |

## Tried and NOT shipped (no measured gain, or a trade-off that is yours to make)
- Defer `play.focus()` (the 29 ms forced reflow in `cover.js`): no improvement (74 vs 77). Reverted. The other forced reflows (`fit.js`, `scale.js`, `float.js`) total ~11 ms.
- Bundle + minify the 15 stylesheets: identical CSSOM (937 rules, 0 differing), -24% raw, Lighthouse within noise.
- `preload` of Amiri-Regular: -0.35 s on Slow 4G only. `modulepreload` of the 52 modules: first paint 0.5 s later.
- esbuild minification (JS 161 -> 116 KB, CSS 41 -> 27 KB brotli): equal score, FCP -150 ms, LCP -300 ms. Needs a build dependency and a deploy-workflow change: recommendation only.
- Cover pre-rendered in the HTML with the app hidden under it: CLS 0 in 8/8 runs and a better Speed Index (2.5 s), but simulated FCP +0.45 s and score 71 vs 77. Not shipped; see below.

## Known issues that remain
- **Layout shift on slow devices.** The player panels and racks are built by JS, so `.players` grows from 0 to ~297 px when JS runs and the dock below jumps ~308 px. At 4x CPU this gave CLS 0.368 in 8 of 8 loads; Lighthouse caught it in about 2 of 5 baseline runs and PSI did not. Only a cover-first start (above) removed it. Decide after checking PSI.
- **LCP is bounded by JS-ready time.** For non-Arabic locales `localize()` replaces every text node after load, and that text flip becomes the LCP. Real English/Indonesian visitors see the Arabic first paint flip to their language.
- Rendering dominates start-up at 4x slowdown: style recalculation + layout + paint about 820 ms against about 283 ms of JS evaluation.
- Targets (score >= 98, FCP/LCP <= 1.2 s) are NOT met in this environment; whether PSI improves can only be checked after deploying.

## Tests
Green: static PWA 572, logic engine 142, endgame 21, names 22, dropgeom 37, all online/server suites, layout collapse 56, layering 131, floating 236, fluid 220, normal-landscape 250, adaptive 21, gfx 12, tahkim-replay 12; edge-shared in sync; production build validated (90 files, no leaks, sw stamp matches, 88 precache entries present).
Red, identical to the delivered v5.10.2 baseline: e2e/local, e2e/run, layout/history-toggle, layout/log-icon, layout/float_modules, layout/feel (sandbox timeout), pwa/e2e.
