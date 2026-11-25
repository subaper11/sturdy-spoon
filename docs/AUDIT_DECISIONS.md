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
