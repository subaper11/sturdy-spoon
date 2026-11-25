# v5.10.4: first-paint layout stability

## Root cause of the mobile CLS (0.368)
Four things moved the layout after the first paint:
1. `#players` was empty in `index.html`; `buildDom()` filled it later (`main.app` 478 -> 801 px, `#ctrls` y 402 -> 710).
2. `js/fit.js` sets `data-fit` / `--fill` after JS runs (panel padding, rack slots and dock rescale).
3. `js/scale.js` sets `--ui` after JS runs (3 px per panel on small phones).
4. Chrome sometimes paints the half-parsed page before the fix in (2)/(3) could run (intermittent 0.09-0.13).

## Changes
- `index.html`: both panels and 7-slot racks are in the HTML (same ids/classes as `buildDom()` built); a synchronous script after `</main>` sets `--ui` and `--fill` with the same rules as `scale.js` / `fit.js` (skips Floating Workspace and Duel; storage errors are swallowed) and marks `data-pp`.
- `js/ui.js`: `buildDom()` reuses the shipped panels, builds them only when missing.
- `css/style.css`: `html.boot:not([data-pp]) .app{visibility:hidden}` holds the game area only until that script ran; `.boot` is always removed by `js/main.js`.
- `js/version.js` 5.10.4, `sw.js` re-stamped.
- Tests: `tests/layout/stability.mjs` (new, in `run-all.mjs`), six assertions in `tests/pwa/static.mjs`.

## Measured (sandbox, single core: compare builds, not absolute scores; 10 alternating runs)
| | Perf | FCP | LCP | TBT | CLS | SI |
|---|---:|---:|---:|---:|---:|---:|
| mobile 5.10.3 | 45.5 | 2497 | 4531 | 631 | 0.368 | 3573 |
| mobile 5.10.4 | 65.5 | 2304 | 4526 | 626 | 0 | 2862 |
| desktop 5.10.3 | 95 | 804 | 1075 | 35 | 0.055 | 1521 |
| desktop 5.10.4 | 95 | 553 | 1079 | 66 | 0 | 1429 |

Desktop TBT is higher in the median (noise on one core is likely, unconfirmed): check with PageSpeed Insights.

## Known remaining
- Arabic locale on layouts that are not in fit mode (360x640 phones, ~800 px windows): the Amiri web font replaces the fallback and a row grows a few px (CLS 0.24 / 0.078; system font: 0.008 / 0.004). Font preload did not help.
- The first-paint script duplicates the `fit.js` / `scale.js` formulas; `layout/stability.mjs` fails if they drift.
- Failing the same way on v5.10.3 (not regressions): e2e/run.py (2), e2e/local.py (1), layout/history-toggle (9), layout/log-icon (16), layout/float_modules.py, pwa/e2e.mjs, layout/feel.

---
# v5.10.4b: the landing screen is the first paint

## Root cause
`#cover` shipped `hidden`; only `showCover()` (end of `start()` in js/main.js) un-hid it. Until then the browser painted the game shell: an empty brown board (the 225 cells are built by `buildDom()`), empty racks and the controls. The v5.10.4 hold on `.app` ended at `data-pp`, which is set before main.js runs, so it did not prevent this. (`data-app-ready` did not exist; it is new.)

## Changes
- `index.html`: cover not hidden, its 14 title tiles shipped, `body.coverOn`, `<main class="app" inert>`, two Latin font preloads (Tinos, 18 KB each); the first-paint fit script now sits after the cover.
- `js/cover.js`: does not rebuild the title when the tiles are already there.
- `js/main.js`: sets `data-app-ready` after the cover is wired (board has 225 cells, panels drawn, labels translated).
- `css/style.css`: the first-paint hold covers `.app` and `.cover` (a half-parsed cover painted and shifted: 0.1075).
- `css/cover.css`: `body.coverOn .app{visibility:hidden}` (the game is built behind the landing screen and shown, complete, by PLAY / ONLINE); the translatable cover labels take no space until `data-app-ready` (no Arabic flash, no shift); the tile drop-in animation is removed (it added ~150 ms desktop TBT and delayed Speed Index: tiles anim off TBT 21 / perf 98, on TBT ~150-180 / perf ~90). The fades are unchanged.
- Tests: `tests/layout/stability.mjs` rewritten (frame-by-frame log: no frame may show the board/racks/controls, the first painted thing must be the landing screen; JS blocked; normal start then PLAY with 225 cells and 7+7 slots; JS failure; cold cache + slow 4G + 4x CPU; portrait/landscape/tablet/desktop), `tests/pwa/static.mjs` guards.

## Measured (sandbox, 10 alternating runs, final build)
| | Perf | FCP | LCP | TBT | CLS | SI |
|---|---:|---:|---:|---:|---:|---:|
| mobile 5.10.3 | 65 | 2489 | 4526 | 425 | 0.368 (4/10 runs) | 3041 |
| mobile 5.10.4b | 76 | 2714 | 4519 | 236 | 0 (10/10) | 2714 |
| desktop 5.10.3 | 96 | 794 | 1073 | 25 | 0.0547 | 1316 |
| desktop 5.10.4b | 98 | 629 | 1088 | 0 | 0 | 817 |

Mobile FCP is ~0.2 s later than 5.10.3 (holding the cover until the first-paint fit ran costs ~140 ms; kept so a half-parsed cover is never drawn). Preload is not the cause (it saves ~200 ms).

## Known remaining
- Arabic font swap (separate, open): CLS in Arabic per layout 0.0005-0.0069 in the stability suite; pre-JS vs post-JS geometry still differs in Arabic.
- PLAY / ONLINE do nothing until JS has loaded.
- Pre-existing red suites unchanged vs 5.10.3: e2e/run.py (2), e2e/local.py (1), layout/history-toggle, layout/log-icon, layout/float_modules.py, pwa/e2e.mjs, layout/feel.

---
# v5.10.4c: LCP element of the landing screen (PageSpeed Insights, mobile)

## Finding
PSI on v5.10.4b reported the LCP element as the donate line ("Dukung pengembangan game") with a 4,010 ms element render delay. v5.10.4b kept the translatable cover labels collapsed (font-size 0) until `data-app-ready`, so the largest text of the page appeared only when start-up finished (reproduced: 5.5 s at 4x CPU / slow 4G; FCP 2.1 s).

## Changes
- `index.html`: the first-paint script puts the landing screen's labels (PLAY / ONLINE sub-lines, donate line, its sr-only text and tooltip) into the chosen language (`html[data-lang]`, id/en; Arabic is the markup) before the first frame. `tests/pwa/static.mjs` compares these strings with `js/i18n-ui.js`.
- `css/cover.css`: the label collapse is removed (the labels are final-size from the first frame); "MULTIPLAYER ONLINE" and the donate line (the two largest texts) no longer fade in, because a fading element cannot be an LCP candidate before its own delay. The buttons and the "by" line keep their original fade-ins and delays.
- `tests/layout/stability.mjs`: cold cache + slow 4G + 4x CPU now asserts that the last LCP candidate is painted before start-up finishes and within 400 ms of FCP.

## Measured
- Real-browser LCP, 412x823, 4x CPU, slow 4G, cold cache: 5.5 s (b) -> 3.0 s (with delayed fade) -> LCP = FCP (final).
- Lighthouse sandbox A/B, 10 alternating runs: mobile perf 61.5 -> 77, CLS 0.18 median (0.368 in 5/10 runs) -> 0, TBT 372 -> 179, SI 3334 -> 2647, FCP 2497 -> 2644; desktop perf 97 -> 98, FCP 775 -> 618, TBT 14 -> 0, CLS 0.0547 -> 0, SI 1177 -> 656. Sandbox Lighthouse LCP is ~4.5 s for both builds (simulated network chain), so it does not show this change: use PSI.

## Not addressed (PSI diagnostics, unchanged from 5.10.3)
Render-blocking CSS (15 sheets, est. 860 ms), the 60-module JS dependency chain, Amiri fonts (206 KB) in the critical chain, forced reflows in cover.js (23 ms) and the inline scripts (29 ms). Merging the CSS / bundling the JS needs a build step, which was ruled out without measured proof.
