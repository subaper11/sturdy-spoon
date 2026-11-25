# Changelog

All per-version notes of EAS Online, newest first. The README describes the game as it is now; this file records how it got there. Per-version details: `docs/V5_*_CHANGES.md`, `docs/V5_*_BUILD_REPORT.md`.

## 5.12.0 (audit release, in progress)

Protocol change: `APP_VERSION` is bumped so the two devices of a match can tell a stale page from a current one.

- **Tahkim can no longer be held hostage (Fase 2).** New action `close_tahkim`: after `TAHKIM_MAX_MS` (10 minutes, `js/config.js`, server copy by `tools/sync-edge-shared.mjs`) without a mutual verdict, either player may close the dispute. The challenge lapses, the move stands (no void, no penalty), the status returns to `active`, both clocks resume from what each player had left, `ext.tahkim_declined` blocks a second challenge of the same move, and `tahkim_log` records it with `verdict: 'timeout'`. The server decides from `tahkim.requested_at` (its own timestamp); idempotent by `client_action_id`; not revision-pinned (like `tahkim_vote`). UI: countdown and a "close" button in the Tahkim card (`js/online/tahkim-ui.js`), texts in Arabic / Indonesian / English. Tests: `tests/online/tahkim-timeout.mjs`, `tests/db/postgres.mjs`.
- **create_room rate limit (Fase 4.3).** Migration 10 adds `eas_rate_hit`; `create_room` is limited per player (5/min, 30/h) and per network address (15/min, 120/h), error `RATE_LIMITED`. Fails closed if the store errors. Tests: `tests/online/ratelimit.mjs`, `tests/db/postgres.mjs`.
- **Supabase-js is vendored (Fase 4.2).** `assets/vendor/supabase-js.2.49.4.esm.js` (MIT, `docs/THIRD_PARTY.md`), precached; `cdn.jsdelivr.net` is gone from the code and the CSP. `tools/vendor-supabase.mjs` rebuilds it.
- **Optional Turnstile captcha (Fase 4.4)** for anonymous sign-in: `TURNSTILE_SITE_KEY` build variable, `js/online/captcha.js`; without it nothing changes. Activation: `docs/DEPLOYMENT.md`.
- **pg_cron is required in production (Fase 4.5).** Migration 11 + action `ops_health`; `pwa-check.html` shows a red row when the clean-up job is not scheduled.
- **CSP (Fase 4.1, partial).** `script-src` no longer has `'unsafe-inline'`: the five inline scripts are allowed by SHA-256 hash (`tools/csp-hashes.mjs`, checked by `tests/pwa/static.mjs`). Still `Report-Only`; see `docs/AUDIT_DECISIONS.md`.
- The Tahkim rules reference (`js/tahkim-rules.js`, `js/rules-en.js`) no longer says the clocks stop "without a time limit"; it states the 10-minute close rule.
- Release hygiene (Fase 1): `APP_VERSION` was 5.11.0 while the docs said 5.11.1; a static test now fails if `APP_VERSION`, the README header and the newest CHANGELOG entry disagree. README split into README + CHANGELOG. `tests/run-all.mjs` registered five suites that never ran in `npm test` (`cors`, `body`, `ratelimit` were hidden inside a `//` comment; `chat`, `adaptive` were never listed).

## 5.11.1 (release candidate)

**v5.11.1 RC (release candidate).** Hardening of v5.11.0: heartbeat error handling, reproducible tests, shared room-code rate limiting, fail-closed CORS, request-size limit, faster first load, stable Arabic layout. It stays an RC until the release gates in `docs/V5_11_1_HARDENING_REPORT.md` (section 10) have passed. Deploy in the order given in `docs/DEPLOYMENT.md`.

## 5.11.0 to 5.9.9 (notes that used to sit in the README feature list)

- v5.10.3 start-up audit (`docs/V5_10_3_CHANGES.md`): no CSS transitions while booting (1,131 start-up transitions on the board squares removed: Lighthouse TBT 2.1 s -> 0.7 s, non-composited animations 226 -> 0). Measured-and-rejected experiments and the remaining CLS/LCP findings are documented there.
- v5.10.4 first-paint layout stability (`docs/V5_10_4_CHANGES.md`): the player panels and racks ship in `index.html` and a synchronous first-paint fit sets `--fill`/`--ui` before the first frame, so nothing moves when the modules arrive (mobile CLS 0.368 -> 0, desktop 0.055 -> 0 in a 10-run Lighthouse A/B). v5.10.4b: the landing screen (PLAY / ONLINE) is part of the first paint and the game area is built behind it, never shown unfinished (`data-app-ready`). Known remaining: Arabic web-font swap on non-fit layouts.
- v5.11.0 Settings and navigation (`docs/V5_11_0_CHANGES.md`): Settings rebuilt as one system (Floating Mode is the first, essential setting, a real switch; match / look & layout / help below it; two columns in landscape and on desktop), rules moved out to the guide site (https://arscguide.vercel.app/, built-in rules only when offline), a quiet "main screen" button (Settings > main screen > PLAY / ONLINE, asks first during a match, nothing is lost), and a one-action update bar (Reload, no "later").
- v5.10.2 (`docs/V5_10_2_CHANGES.md`): Normal landscape on phones: the players column and the dock no longer cover the board's edge columns, the bottom row and corners are reachable by touch drag (continuous, adaptive lift: `js/dropgeom.js`); the turn dot and the last-move corner dot are gone (last move = one adaptive ring).
- v5.10.1 motion budget (`docs/V5_10_1_CHANGES.md`): the dock no longer animates width/margin/max-width after the check mark (instant state change + a compositor-only entrance); picked-tile flicker, panel turn glow and pause pulse animate opacity instead of `box-shadow`; no forced reflow to restart score animations.
- v5.10.0 adaptive fit (`js/fit.js`, `css/fit.css`): on tall phones / portrait tablets everything under the board (panels, racks, dock, gaps) grows by the largest factor that still fits (at most 1.5) and what is left is split above and below; on screens >= 1000 px the board may grow past 880 px (up to 1500 px, height permitting) and the players + dock column grows with the screen height and is centred beside it. Floating Workspace, the Duel layout, short landscape layouts and screens too short to fit are not touched. Test: `tests/e2e/fit.py`.
- v5.9.9 fixes: the hold survives what Android does during a long press (a `contextmenu` event about 0.5 s in, a focus change, small finger drift; no tooltip on touch devices); the word-log / Tahkim / chat drawer has a solid surface and a dimmed backdrop, its title no longer stretches over the tabs in non-Arabic languages, the tabs stay hidden in local games, and the quick replies wrap instead of being cut off.

## 5.2 (on top of 5.1)

_Original heading: v5.2 (on top of v5.1): unlimited local undo, pause cards, rack display, a live preview that works_

- **Undo, local play**: every action (move, pass, swap) can be taken back, as many times in a row as you like, back to the start; board, racks, bag, scores, clocks and turn return, and the history shrinks with it. The history is saved with the match (up to 300 steps). *تحكيم* is only enabled on a fresh, unruled move.
- **Undo, online**: still a request. The opponent now gets a **full-screen card** (accept / decline) that does not depend on any other dialog, plus the status line; the requester sees "waiting for approval" and can withdraw.
- **Pause**: a **full-screen card** on both screens (who paused, a running or counting-down time, resume button; the board and racks are hidden and the game behind is inert). Online: 2 pauses each, 3 minutes, the other player's resume button counts down. **Local**: press either clock (or the **P** key, or Settings → الإيقاف المؤقت); no limits, the time spent paused is never charged.
- **Racks, local play** (Settings → الرفوف): *always visible* (as before) or *visible only on the owner's turn* (the other rack shows card backs; no letters are in the page).
- **Live preview** now travels in **presence** (the channel members are already authorised for), not in client broadcasts, so it needs no extra database permission (migration 06 removes the permission early copies of 05 granted). Each device also tells the other which **revision** it has seen, so a missed realtime event heals itself, and which **game version** it runs: a mismatch (typically one device on a stale cached copy) is announced and undo / pause are not sent to a device that cannot show them. Settings → المعاينة المباشرة is a personal on/off switch on top of the host's room rule.


## 5.1

_Original heading: v5.1: pause, undo with approval, live preview, word rules, diagnostics_

- **Undo with the opponent's approval** (online). The player who has just moved can press *Undo* to ask; the other player gets Accept / Decline. Accepting restores board, racks, bag and scores and gives the turn back (clocks are kept; the responder's thinking time is charged). A decline is final for that move; withdrawing, or the opponent playing / passing / swapping / challenging, cancels the request. The move stays in the history, marked void. Tahkim is unchanged and still the way to rule on a word.
- **Pause** (online). Either player can stop both clocks: 2 pauses each, 3 minutes at most (`PAUSES_EACH`, `PAUSE_MS` in `js/config.js`); the other player can resume once the time is up, and any action after it resumes automatically. Board and racks are hidden while paused, so a pause cannot be used to think for free.
- **Live preview.** The player on turn's tentative tiles appear to the opponent as dashed ghost tiles (a broadcast "draft": squares and letters only, bound to the revision, validated and bounded on receipt, never read by the server). The host can switch it off in the waiting room (rule *عرض القطع التي تجرّبها للخصم مباشرةً*).
- **Word rules** (`js/wordrules.js`): the rules of which words may be played, in Arabic with an Indonesian line per rule, in **Settings → قواعد الكلمات**, one tap away inside every **Tahkim** dialog, and in the **waiting room** (so both players agree before starting).
- **Setup errors say what to fix**: anonymous sign-ins off, wrong key, unreachable/paused project, function not deployed, missing migration, library failed to load. `pwa-check.html` (Settings → التطبيق) checks install conditions, the service worker and cache, and the Supabase project and function.
- **Parity tests** (`tests/online/parity.mjs`): the server's shared modules are byte-identical to `js/`; random positions through `submit_move` give the same validity, error text, words and score as `js/rules.js` and as an independent scorer; every tile is accounted for after every action of random whole games; the end-of-game settlement equals `settleEnd`.
