# v5.11.0: Settings, navigation and the update bar

Built on v5.10.4c (first paint, CLS and LCP work is unchanged and re-verified).

## 1. Update bar: one action
- `index.html`, `css/pwa.css`, `js/pwa.js`: "Nanti/Later" is gone. The bar says **Versi baru tersedia** / "Versi terbaru game sudah tersedia. Muat ulang aplikasi untuk menerapkan pembaruan." with one button, **Muat Ulang** (ar: إعادة التحميل, en: Reload). No "Relog" anywhere (a static test checks).
- It is a slim bar at the top edge (the controls at the bottom stay reachable).
- Flow: the running match is saved (`saveNow`), a one-shot flag `eas.updated` is set, the waiting worker is told to take over, the page reloads **once** (`controllerchange`). If the worker never answers, a fallback reload happens after 4 s, rate-limited to once a minute (`eas.updTry`): no reload loop, never a dead button. After the reload, `main.js` consumes the flag: a saved local match goes straight to the "continue / new" question instead of the title screen; an online match resumes by itself (unchanged).

## 2. Settings: rebuilt (`index.html`, `css/style.css`, `js/layout.js`, small changes in `js/prefs.js`, `js/nameedit.js`, `js/fullscreen.js`, `js/ui.js`)
Structure (by importance, not by when a setting was added):
1. **Pengaturan utama** (softly tinted block): **Mode mengambang** first (a real `role="switch"`, with a one-line description and a visible "Nyala/Mati"), Layar penuh (switch), Bahasa, "Setel ulang elemen mengambang".
2. **Pertandingan**: who starts, rack display, live preview, haptics (touch only), pause now.
3. **Tampilan & tata letak**: theme chips, layout, word log, info bar, graphics, tile values, player names. Duel-only options (player 1 side, dock) are not shown at all outside Duel.
4. **Bantuan**: **Panduan & Aturan** (one row, opens https://arscguide.vercel.app/ in a new tab, `noopener`) and the optional "Opsi tambahan" fold (app install / check).
5. Title bar: Pengaturan, a quiet pill **Layar Utama**, close.
Rules / how-to-play are no longer in Settings. Offline (the app is a PWA) the guide site cannot open, so only then the built-in rules view is loaded as a fallback (`js/home.js`).
Visual: no card per group, hairline rows, choices are compact segmented controls on the same line as their name (switches only where a setting is a real on/off and essential), long notes shortened. Two columns where there is width (landscape phones, tablets, desktop). Portrait content height 2474 -> 1785 px; landscape phone: a 440x281 window with 2479 px of content -> 827x374 with 865 px.
All previous settings keep their keys, values and persistence. A rebuilt row keeps keyboard focus; the sheet refreshes when it opens (`eas:settings`), so Floating Workspace restored at start-up is shown correctly.

## 3. Back to the main screen (`js/home.js`, `js/main.js`)
Settings > Layar Utama > PLAY / ONLINE.
- Nothing played yet: goes home at once.
- Local match in progress: asks ("saved on this device, continue it later from PLAY"), cancel keeps playing, confirm saves and goes home; PLAY then offers the match back.
- Online match active: asks, says it keeps running on the server and ONLINE brings the player back; only this page leaves (no resignation). Lobby / finished / abandoned use the existing leave flow.
- It is a plain navigation to the same page with a one-shot flag (`eas.home`), so an online resume does not pull the player straight back; the flag is consumed on the next start (no loop).

## 4. Audit: found and fixed
- Settings sheet overflowed sideways in Indonesian (grid track sized by the widest nowrap option label): fixed (`minmax(0,1fr)`, labels may wrap).
- Close button was 36 px: now 44 px; main-screen pill 40 px; every control >= 36 px (segments) / 40 px.
- Pre-existing: Pink theme "current blank tile letter" contrast 4.49 < 4.5 (`tests/contrast.py` failed silently under run-all): `--tile-blank-text` #a03a20 -> #983620.
- The test harness re-injects its own storage on reload, so persistence is tested through a second tab.

## 5. Tests
New `tests/layout/settings.mjs` (292 checks): order of groups, Floating Mode first and a switch with name/description/state, no rules and no "later" in Settings, guide link, accessible names, touch targets, contrast, keyboard (Tab/Space/Escape, focus stays on the switch), six toggles in a row, scrolling keeps the title bar, persistence, going home with and without a match (question, cancel, confirm, saved, offered back, flag consumed), the update bar (one button, slim, on top, stubbed service worker: one reload, no loop, saved match offered after) in six viewports x id/ar. Static guards in `tests/pwa/static.mjs` (612). Selectors in older layout suites moved from `#lyB` to `#ad`.

## 6. Measured (sandbox Lighthouse, 10 alternating runs, v5.10.4c vs v5.11.0)
Mobile perf 72 -> 74.5, FCP 2653 -> 2685 ms, TBT 271 -> 202 ms, CLS 0 -> 0. Desktop perf 98 -> 98, FCP 597 -> 601 ms, TBT 0 -> 0, CLS 0 -> 0.

## 7. Known remaining
- Failing the same way on v5.10.3 (not regressions): e2e/run.py (2), e2e/local.py (1), layout/history-toggle (9), layout/log-icon (16), layout/float_modules.py, pwa/e2e.mjs, layout/feel.
- Arabic font swap: closed for Settings (`#ad`), see Follow-up. Still open for the board and the other dialogs (see V5_10_4_CHANGES.md).
- The update bar cannot be exercised against a real service worker in this sandbox (pwa/e2e.mjs fails here already on v5.10.3); the flow is tested with a stub, so check one real update on a deployed preview.
- The online "go home" path (active match) is code-reviewed against `net.leave` but not exercised end to end here (no Supabase backend).

## 8. Follow-up (same version, 5.11.0)
**Arabic font swap in Settings.** Reproduced (Chromium, 390x844 @2x, `/Amiri-*.woff2` held, service worker blocked): in Arabic 28 of 28 rows of `#ad` moved when Amiri arrived (up to 66.7 px, row heights 8-25 px); id/en 0. Two causes: `line-height: normal` (Amiri 1.75 x font-size vs a smaller stand-in) and different glyph widths, so `.setD` re-wrapped (not fixable by line-height). Three layers:
- `openSettings()` (`js/ui.js`): in Arabic, if Amiri 400/700 is not in, the sheet waits for it (max 1 s, `.catch` shows it anyway). The game is paused and inert at once, as before. A second tap while waiting is ignored. Face already in, or id/en: synchronous, unchanged.
- Freeze: if the sheet is shown without Amiri (timeout, failed load) or the language is switched to Arabic while it is open (`eas:lang`), `#ad.fontHold` keeps the stand-in face (`font-family:serif`) for that whole opening, so nothing moves when Amiri lands; the next opening uses Amiri. This is what removes the re-wrap shift, which no metric can do across devices.
- `css/style.css`: `html[data-lang="ar"] #ad{line-height:1.75}` plus a zero-specificity `inherit` for everything inside, so buttons/summaries/headings no longer have a font-dependent `normal`. Latin untouched. Amiri's natural height is 1.75 at 16 px but 1.72-1.79 at the smaller sizes (rounded ascent/descent): the final Arabic sheet differs from 5.11.0 by <= 0.5 px per element, 1.9 px over the whole sheet; id/en identical.
- Not done: `size-adjust`/`ascent-override` on a local fallback (each device has another Arabic fallback, no metric matches everywhere) and `font-display: optional` (Amiri would often never show on a first visit).
- Measured (rows of `#ad`, 28): font released 0.4 s after the tap 0 moved (sheet at ~0.5 s); font never released: sheet at ~1.02 s, 0 moved after it arrives (was: opens at once, 28 moved, 66.7 px); language switched id -> ar with Amiri held: 0 moved; request aborted: opens in 13 ms; normal: synchronous; id/en: 0 moved, geometry identical to 5.11.0; double tap: one dialog.

**Direction of the Settings sheet.** `css/i18n.css`: `html:not([data-lang="ar"]) #ad{direction:ltr}`. id/en: text on the left, switch/option on the right; Arabic keeps right-to-left. It follows `data-lang`, so it changes live with Settings > Language. Only `#ad`: the board and every other dialog stay as they were.

**Segmented controls in Settings (id/en).** Long labels (Rack display, Tile values on the board) made the options uneven: the selected one wide, the other squeezed into two lines. `css/i18n.css`, `html:not([data-lang="ar"]) #ad`: the control fills its row (the whole row when it wraps under the title) and is a grid with `auto` columns, so each option keeps its one-line width and the longer label takes the rest; labels are centered and `text-wrap:balance`. Arabic and every other dialog unchanged. Checked by screenshots (id/en, 390 px and 1366 px).

**Waiting room.** `roomView()` in `js/online/lobby.js` shows the same row as Settings > Help (`.actRow`, existing Arabic strings, so id/en come from the dictionary) linking to `https://arscguide.vercel.app/#rules` instead of the `rulesDetails()` accordion. No offline fallback: playing online needs a connection. `rulesDetails()` stays for the Tahkim dialogs (`js/judge.js`, `js/online/session.js`); comments in `js/wordrules.js` updated. On short landscape phones the description is hidden by the existing `.setD` rule, as in Settings.

**Tests.** `layout/settings` 292/292, `layout/i18n` 35/35, `layout/stability` 233, `layout/floating` 236, `layout/layering` 131, all passed (puppeteer-core + Chromium 1243 from Playwright, `CHROME_PATH`). Not run: the rest of `run-all`. The lobby was checked with screenshots (id/ar/en, portrait + landscape: link not clipped, no `.wrBox`), not by a test file.
