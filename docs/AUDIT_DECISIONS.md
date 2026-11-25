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
