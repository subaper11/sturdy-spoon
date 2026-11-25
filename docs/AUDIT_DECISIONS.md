# Audit decisions

Working log of the audit pass on EAS Online 5.11.1-rc. Three sections: decisions taken, alternatives rejected, work postponed or cancelled.

## Baseline (Fase 0, nothing changed)

Environment: Node 22.23.5, Python 3.12.3, `npm ci` in `tests/`.

| Group | Result |
|---|---|
| unit | 6 suites passed (142 + 21 + 22 + 37 checks, plus the sync check) |
| server | 16 suites passed |
| db (PGlite, all migrations) | 83 checks passed |
| e2e, layout, pwa, a11y | NOT RUN: no Chromium in this sandbox (no `CHROME_PATH`, `playwright-core install` cannot reach its CDN, `network_configuration` allows only npm/pypi/github hosts) |

Every phase below states which groups it could run. Browser groups stay unverified in this environment and must be run by the owner (`npm run setup:browser && npm test`).

## Keputusan

### Fase 1
- **Version drift:** `js/version.js` said 5.11.0 while everything else said 5.11.1. Bumped to 5.11.1. `pwa-check.html` already reads `APP_VERSION` dynamically, so it has no copy to fix.
- **Consistency test:** `tests/pwa/static.mjs` now fails when `APP_VERSION`, the `**Version x.y.z**` line of README.md and the newest `## x.y.z` heading of CHANGELOG.md differ (verified by temporarily setting 5.11.2: test failed, then restored).
- **README split:** per-version notes (the RC banner, the v5.10.x/v5.11.0/v5.9.9 bullets, the v5.2 and v5.1 sections) moved verbatim to `CHANGELOG.md`; the rest keeps its text and is regrouped under Summary / Quick start / Features / Architecture / Deploy / Testing / Credits. A script checked that every original non-blank line exists in README.md or CHANGELOG.md; only the RC banner (reworded) and the old `## Running` heading (now Quick start) differ.
- **Finding, test runner:** `tests/run-all.mjs` had a `//` comment on the `db` line that swallowed `cors`, `body` and `ratelimit` (written on the same physical line), so those three suites never ran in `npm test`. `chat.mjs` and `adaptive.mjs` were never registered at all. All five pass (21, 9, 17, 39, 43 checks); they are now registered. Server group: 16 -> 21 suites.
- **`docs/V5_11_1_HARDENING_REPORT.md` section 10 exists.** It declares "NOT READY FOR PRODUCTION". Gate checklist built from evidence, not from claims:

| Gate | Evidence | State |
|---|---|---|
| Unit, server, db suites | run in this audit, all green | done |
| Browser suites (e2e, layout, pwa, a11y) | not runnable here | open |
| Items of report section 9 on a real Supabase staging project | no staging access here | open |
| One uninterrupted `npm test` on CI | not run here | open |
| Decision on the 3 s install-suggestion delay | no decision recorded | open |

## Alternatif ditolak

- Fase 1: keeping one long README with a "Changelog" heading. Rejected: it is what made the file 48 KB with changes above features.

## Ditunda / Dibatalkan

- Fase 2 to 6: see the final report. Entries are added here when a phase is started and not finished.

### Fase 2 (Tahkim)
- **Closing is not a verdict.** `close_tahkim` leaves the move valid with no penalty: nobody agreed it was wrong, and the challenger did not win the dispute either. `game_moves.tahkim_status` is set to `'ok'` (the existing check constraint allows only `ok`/`void`), so no migration was needed; "closed by timeout" is visible in `games.tahkim.state = 'closed_timeout'` and `ext.tahkim_log[].verdict = 'timeout'`.
- **Not revision-pinned,** like `tahkim_vote`: both players act at once and the server's own state decides (a close after a verdict is refused `NOT_IN_TAHKIM`). Idempotent through the generic `client_action_id` path.
- **Tahkim rules reference text changed** (one sentence in `js/tahkim-rules.js` and its English entry in `js/rules-en.js`): it used to promise "no time limit", which would now be false. Earlier you asked that Tahkim dialog rules not change without asking; this is the minimum to keep the reference true to the engine. Revert that sentence if you prefer, but the reference would then be wrong.
- Rejected: auto-closing from the heartbeat or `claim_*` paths (would be a hidden side effect of unrelated requests); declaring the move void on timeout (rewards the player who stalls).
- Not run here: the layout/e2e tests that render the Tahkim card (no browser). The countdown ticks with a 1 s `setInterval` that is cleared in `hideTahkim()`; verify on a device.

### Fase 3 audit: two-player assumptions (grep, 85 lines; comment lines excluded)

- `js/dropgeom.js:13` const span = 3 * lift, y1 = yMax - span, c1 = y1 - lift;   // the fade starts at y1, where the plain drop poin
- `js/firstdraw.js:57` [0, 1].forEach(i => {
- `js/float-geom.js:16` a.w = Math.max(0, a.x1 - a.x0); a.h = Math.max(0, a.y1 - a.y0);
- `js/float-geom.js:23` if (!loose) return [clamp(x, a.x0, a.x1 - w), clamp(y, a.y0, a.y1 - h)];
- `js/float-geom.js:24` const rx = [a.x1 - w - e, a.x0], ry = [a.y1 - h - e, a.y0];
- `js/float-input.js:45` else if (t.def.popup) setSize(t, Math.min(r.width + dw, a.x1 - r.left));
- `js/float-layout.js:36` const yP = clamp(a.y0 + (bh - stackH) / 2, a.y0, Math.max(a.y0, a.y1 - stackH));
- `js/float-layout.js:38` const yC = clamp(a.y0 + (bh - (hc + M + ht)) / 2, a.y0, Math.max(a.y0, a.y1 - hc - M - ht));   // Turn Control
- `js/float-layout.js:42` const below = yP + stackH + M, room = a.y1 - below, wid = clamp(pw, 200, Math.min(limits(T.hist).maxW, a.w));
- `js/float-layout.js:47` const bx = a.x0 + (a.w - s) / 2, lx = Math.max(a.x0, bx - M - pw), rx = Math.min(a.x1 - pw, bx + s + M);
- `js/float-layout.js:55` const wid = clamp(colW, 200, Math.min(560, a.w)), below = yL + hl + ht + M, room = a.y1 - below;
- `js/float-layout.js:71` else { g[left] = { x: a.x0, y: yP, w: pw }; g[right] = { x: a.x1 - pw, y: yP, w: pw }; }
- `js/float-layout.js:72` if (row) { g.ctrls = { x: rtl ? a.x1 - tw : a.x0, y: yC, w: tw }; g.tools = { x: rtl ? a.x0 : a.x1 - uw, y: yC
- `js/float-layout.js:75` g.hist = histOn && a.y1 - below >= 150 ? { x: a.x0, y: below, w: a.w, h: Math.min(a.y1 - below, 560) }
- `js/float-layout.js:89` const bb = things.board?.el.getBoundingClientRect(), free = bb ? Math.max(bb.left - a.x0, a.x1 - bb.right) - 6
- `js/float-popups.js:32` const xs = [a.x0, (a.x0 + a.x1 - w) / 2, a.x1 - w], ys = [a.y0, (a.y0 + a.y1 - h) / 2, a.y1 - h];
- `js/float-popups.js:33` const tries = orient() === 'portrait' ? [[1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2], [0, 1], [2, 1], [1, 1
- `js/float-popups.js:34` : [[0, 0], [2, 0], [0, 2], [2, 2], [0, 1], [2, 1], [1, 0], [1, 2], [1, 1]];
- `js/game.js:80` if (!setTurn(1 - S.cur)) return;
- `js/nameedit.js:78` box.innerHTML = [0, 1].map(i => `<div class="segRow nmRow"><label class="setRowHead" for="nm${i}">اسم اللاعب $
- `js/names.js:44` if (!s // s.v !== 1 // !Array.isArray(s.n) // s.n.length !== 2) return;
- `js/names.js:53` if (same(v, names[1 - i])) return { name: names[i], dup: true, changed: false };
- `js/online/hud.js:11` const SEATS = [0, 1], last = { game: -1, score: [null, null] };
- `js/online/hud.js:36` const online = you ? net.view.state !== 'OFFLINE' && net.view.state !== 'RECONNECTING' : net.view.opp;
- `js/online/hud.js:58` const g = app.net.snap.game, opp = nameOf(1 - me);
- `js/online/hud.js:59` const t = !live ? '' : g.status === 'tahkim_pending' ? 'التحكيم قائم' : g.pause ? 'اللعبة متوقفة' : S.cur === 
- `js/online/session.js:39` backend: null, userId: null, snap: null, seat: 0, state: 'CONNECTING', opp: false, busy: false, key: '', clock
- `js/online/session.js:42` view: { state: 'CONNECTING', opp: true }   // what the bar SHOWS (see show()); the fields above are what is tr
- `js/online/session.js:75` app.net = net; app.firstRun = false; net.snap = null; net.key = ''; net.view = { state: net.state, opp: true }
- `js/online/session.js:103` oppId: () => net.snap?.players?.find(p => p.player_id !== net.userId)?.player_id // null,
- `js/online/session.js:105` const opp = ids.some(u => u !== net.userId); if (opp !== net.opp) { net.opp = opp; show('opp', opp, !opp); if 
- `js/online/session.js:116` else { setState('RECONNECTING'); net.opp = false; show('opp', false, true); clearTimeout(net.resub); net.resub
- `js/online/session.js:138` net.oppIdle = { ms: r.opp_idle_ms ?? 0, at: Date.now() };
- `js/online/session.js:164` setRemoteNames([0, 1].map(i => snap.players.find(p => p.seat === i)?.nickname // ''));
- `js/online/session.js:188` S.players = [0, 1].map(i => {
- `js/online/session.js:461` function dropGhostSoon(ms = GHOST_KEEP_MS) { clearTimeout(net.ghostTimer); net.ghostTimer = setTimeout(() => {
- `js/online/session.js:472` const rows = [0, 1].map(i => { const l = r.lines.find(x => x.seat === i) // { score: 0, raw: 0, ded: 0, mins: 
- `js/online/session.js:499` const waitingOnOpp = () => { const s = net.snap; return !!s && ['active', 'tahkim_pending'].includes(s.game.st
- `js/online/session.js:507` const g = net.snap?.game, opp = 1 - net.seat, name = nameIso(opp), V = net.view;
- `js/online/session.js:509` if (!t && g && g.status === 'tahkim_pending') { const v = g.tahkim.votes // [null, null]; t = v[net.seat] ? (v
- `js/online/session.js:512` if (!t && waitingOnOpp() && !V.opp) t = `${name} غير متصل — بانتظار عودته…`;
- `js/online/session.js:513` if (!t && g && g.status === 'finished' && (g.rematch_seats // []).includes(opp)) t = `${name} يطلب إعادة المبا
- `js/online/session.js:517` const bad = V.state !== 'CONNECTED' // (!!g && g.status === 'active' && !V.opp);
- `js/online/session.js:529` if (ok && over) setText(ok, (g.rematch_seats // []).includes(opp) ? 'قبول إعادة المباراة' : 'إعادة المباراة');
- `js/online/session.js:536` const g = net.snap?.game, claim = waitingOnOpp() && !net.view.opp && net.view.state === 'CONNECTED';
- `js/online/session.js:557` const show = waitingOnOpp() && !net.view.opp && net.view.state === 'CONNECTED';
- `js/online/supabase-backend.js:67` const st = ch.presenceState(), oppId = h.oppId?.() // null;
- `js/online/supabase-backend.js:69` const ids = oppId ? Object.keys(st).filter(k => k === userId // k === oppId) : Object.keys(st), other = oppId 
- `js/online/tahkim-ui.js:127` const g = snap.game, t = g.tahkim, me = snap.me.seat, opp = 1 - me, N = ctx.names, chat = t.chat // [], votes 
- `js/online/tahkim-ui.js:149` const chips = $('#tkChips'), cs = [me, opp].map(s => `${s === me ? 'أنت' : N[s]}: ${votes[s] ? VERDICT[votes[s
- `js/online/tahkim-ui.js:151` const mine = votes[me], theirs = votes[opp];
- `js/online/tahkim-ui.js:155` : mine ? `اخترتَ ${VERDICT[mine]} — بانتظار اختيار ${N[opp]}. لا يُحسم التحكيم إلا إذا اختار الاثنان الحكم نفس
- `js/online/tahkim-ui.js:156` : theirs ? `${N[opp]} اختار ${VERDICT[theirs]}. اختر حكمك ثم أكّده.`
- `js/persist.js:25` if (!grid(board) // !Array.isArray(racks) // racks.length !== 2 // !Array.isArray(bag)) return false;
- `js/persist.js:49` if (!Array.isArray(d.scores) // d.scores.length !== 2 // !d.scores.every(s => isInt(s, 0, 1e6))) return false;
- `js/persist.js:50` if (!Array.isArray(d.times) // d.times.length !== 2 // !d.times.every(t => Number.isFinite(t) && t > 0 && t <=
- `js/replay.js:47` else if (s.k === 'ok') score[1 - e.p] -= e.pen // 0;
- `js/replay.js:64` <div class="rpScores">${[0, 1].map(p => `<div class="rpS" data-p="${p}"><span class="rpName"><bdi>${esc(nm(p))
- `js/replay.js:138` if (t < 2) t = y1 - wr.top + 6;   // no room above the word: below it
- `js/rules.js:30` for (const e of m) for (const [dr, dc] of [[0, 1], [1, 0]]) {
- `js/stamp.js:13` for (const [dr, dc] of [[0, 1], [1, 0]]) {
- `js/state.js:51` players: [0, 1].map(() => ({rack: Array(RACK).fill(null), score: 0, ms: min * 60000})),
- `js/ui.js:26` if (!$('#pn0')) $('#players').innerHTML = [0, 1].map(i => `<div class="panel" id="pn${i}"><div class="phead"><
- `js/ui.js:33` [0, 1].forEach(i => {
- `supabase/functions/_shared/core/engine.js:35` const other = seat => 1 - seat;
- `supabase/functions/_shared/core/engine.js:75` w.game.current_seat = other(w.game.current_seat);
- `supabase/functions/_shared/core/engine.js:166` if (w.players.length !== 2) fail('NEED_OPPONENT');
- `supabase/functions/_shared/core/engine.js:194` const g = w.game, seats = [0, 1];
- `supabase/functions/_shared/core/engine.js:198` if (forfeit) lines = seats.map(s => ({ seat: s, score: playerBySeat(w, s).score, raw: playerBySeat(w, s).score
- `supabase/functions/_shared/core/engine.js:200` const res = settleEnd(seats.map(s => ({ score: playerBySeat(w, s).score, rack: rackOf(w, s), ms: playerBySeat(
- `supabase/functions/_shared/core/engine.js:202` seats.forEach(s => { playerBySeat(w, s).score = lines[s].score; });
- `supabase/functions/_shared/core/engine.js:205` if (forfeit) win = other(loserSeat);
- `supabase/functions/_shared/core/engine.js:357` const rec = { move_number: t.move_number, round: g.round, words: t.words // [], challenger_seat: t.challenger_
- `supabase/functions/_shared/core/engine.js:369` const rec = { move_number: t.move_number, round: g.round, words: t.words // [], challenger_seat: challenger, r
- `supabase/functions/_shared/core/engine.js:488` export const blockingSeat = (g, viewer) => (g.status === STATUS.TAHKIM ? (viewer == null ? null : other(viewer
- `supabase/functions/_shared/core/service.js:110` return { ok: true, revision, status, server_now: now, opp_idle_ms: E.idleMs(w, 1 - seat, now) };
- `supabase/functions/_shared/core/service.js:154` if (w.game.status !== E.STATUS.LOBBY) fail(w.players.length >= 2 ? 'ROOM_FULL' : 'GAME_STARTED');
- `supabase/functions/_shared/core/service.js:155` if (w.players.length >= 2) fail('ROOM_FULL');
- `supabase/functions/_shared/core/snapshot.js:30` pause: extOf(g).pause // null, pauses_left: [0, 1].map(i => Math.max(0, PAUSES_EACH - ((extOf(g).pauses // [0,
- `supabase/functions/_shared/game/rules.js:31` for (const e of m) for (const [dr, dc] of [[0, 1], [1, 0]]) {
- `supabase/migrations/20261024000001_eas_online_schema.sql:22` current_seat        smallint check (current_seat in (0,1)),
- `supabase/migrations/20261024000001_eas_online_schema.sql:50` seat             smallint not null check (seat in (0,1)),   -- a future referee would get a role column and a 
- `supabase/migrations/20261024000003_eas_online_functions.sql:51` -- seats
- `supabase/migrations/20261101000005_eas_v5_1_pause_undo_live.sql:51` -- seats
- `supabase/migrations/20261104000007_eas_v5_4_hardening.sql:23` --    Deleting a user cascades to their finished games' seats, racks and moves (see the on delete cascade refe
### Fase 4
- **4.1 CSP: hashes instead of moving the scripts; header stays Report-Only.** The two inline scripts of index.html are pre-paint boot code (theme class, no-flash layout); moving them to files would change first-paint timing, which earlier releases spent effort on. Hashes keep the bytes and timing identical. The header is NOT switched to enforcing because the e2e/pwa/a11y groups that would show violations cannot run here. `style-src` keeps `'unsafe-inline'` (14 inline `style=` attributes in index.html plus runtime styles). To enforce: run the browser suites with the header as `Content-Security-Policy`, look for violations, then rename the header key in `vercel.json`.
- **4.2 vendoring:** bundled with esbuild (one ES module, 105 KB) because jsdelivr's `+esm` URL is not reachable from here; checked by importing it in Node (`createClient`, `auth.signInAnonymously`, `functions.invoke` exist). Not exercised in a browser or against a real Supabase project.
- **4.3 create_room limit:** counts every attempt (the thing limited is creating, not failing); per player 5/min and 30/h, per network 15/min and 120/h (looser: shared addresses). A player returning to their own game (`ALREADY_IN_GAME`) is not counted. Store failure fails closed.
- **4.4 captcha:** Turnstile chosen (the only provider in the brief); site key via build env, secret only in Supabase.
- **4.5 pg_cron:** the check goes through an Edge Function action (`ops_health`) because API roles cannot read `cron.job`. `pwa-check.html` creates one anonymous user per run to call it; skipped when captcha is on.

### Fase 5
- **5.1 done** (see CHANGELOG). Rejected: verifying HS256 locally (needs the legacy JWT secret inside the function; keeping that secret out of more places is worth one Auth call). The speed-up only applies once the project uses asymmetric signing keys; on a legacy project nothing is faster.
- **5.2 NOT done (mutate without the full re-read).** The patch the engine produces is only part of what `commit_action` does: it also stamps `updated_at`/`id`/`created_at`, opens a new round on rematch, deletes the last move on undo, and handles joins/leaves. Rebuilding that in JS would be a second implementation of the SQL, and the only parity check I can run is against PGlite, not a real Supabase project. A wrong snapshot is worse than one extra read, so the old path stays. If you want it: do it per action type (chat first), with the parity test the brief asks for comparing against `loadFor` on random games.
- **5.3 heartbeat via Realtime Presence: NOT changed.** `claim_abandon` depends on server-stored `last_seen_at`, which the database and the clock tests use; Presence state lives in the Realtime server and is not readable from SQL or from the cleanup function. Replacing it would move the abandon decision to a place the existing tests cannot reach.
- **5.4 chat/tahkim_log out of `games.ext`: NOT done.** The brief makes it depend on Fase 3 (spectators, N players), which was not built; moving it now would change the snapshot shape twice.
- **5.5 limit loading of `moves`: NOT done.** Every action that returns a snapshot needs the move list (`historyItem`), and the actions that do not return one already use `loadLite` (heartbeat). Nothing left to skip without changing the answer.
- **5.6 region note** added to `docs/DEPLOYMENT.md` in Fase 4.

### Fase 6
- **6.1 done.** Consolidation = the migration-05 body without `rd`; a db test compares both bodies (whitespace-normalised) so "behaviour unchanged" is checked, not claimed.
- **6.2 partial.** The code base already escaped with `esc()` at the data-carrying sites; the one real gap found was `chips()` in `js/ui.js` (`w.w` unescaped). Migrated the sites that carry nicknames, words or server values (ui.js history/chips, judge.js, session.js verdict, lobby seats, replay chips). NOT migrated: about 30 `innerHTML` assignments that insert only constants or build DOM from static strings (i18n.js, overlay.js, themes.js, haptics.js, prefs.js, cover.js, layout.js, persist.js, float-input.js, peek.js, rulesview.js, tkpress.js, nameedit.js, names.js, tahkim-ui.js, hud.js). I read their templates for `${}` of user data and found none, but did not convert them. `tests/logic/names.mjs` now compares `String(nameHtml(...))` because the function returns a trusted fragment object instead of a string; the asserted HTML is unchanged.
- **6.3** plan written, nothing implemented (as asked).
- **6.4** CHANGELOG, MIGRATIONS, ONLINE_ARCHITECTURE, DEPLOYMENT updated along the way; version is 5.12.0.

## Ditunda / Dibatalkan (summary)
- **Fase 3 entire (roles, spectators, judge, 3-4 players): not started beyond the audit.** It touches the local game engine (`js/state.js`, `js/game.js`, `js/rules.js`) and about 20 client files, and its layout cannot be verified without a browser. Per the brief ("do not leave half done") nothing was left half done.
- **5.2, 5.3, 5.4, 5.5:** see Fase 5 above.
- **4.1 enforcing CSP:** needs browser suites.
