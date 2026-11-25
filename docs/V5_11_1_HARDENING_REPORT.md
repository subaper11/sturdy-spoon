# EAS Online v5.11.1 RC: hardening report

Status: **release candidate, NOT READY FOR PRODUCTION** (section 10). Everything below states what was executed in this environment (Linux sandbox, Node 22.23, Python 3.12, Chromium 1243 via Playwright 1.63) and what was not.

## 1. Executive summary

- The heartbeat could report success when its database write failed. It now throws on a database error and on a write that did not persist, never rewinds a newer timestamp, and surfaces a safe `SERVER_ERROR`.
- The test suite is reproducible from a clean checkout (`npm ci`, `npm run setup:browser`, `pip install -r requirements-dev.txt`) and the runner reports honestly (any failed or unstartable suite fails the run). Every known failing suite was investigated: none was an application defect.
- Production security: CORS fails closed, room-code guessing is limited in shared Postgres state instead of per process, and request bodies are capped.
- Mobile Lighthouse went from 77 to 96 in the same local setup (section 6), desktop 98 to 99.
- Arabic font swapping no longer moves dialogs, panels or controls (104 browser checks).
- A new real-Postgres suite runs all nine migrations and the real `SupabaseStore`/service code (83 checks).

## 2. P0

| Item | Root cause | Solution | Files |
|---|---|---|---|
| Heartbeat | `SupabaseStore.touch()` ignored the `{error}` Supabase returns and the row count | Check error; `update ... lte(last_seen_at, now) .select()`; zero rows: re-read, `NOT_MEMBER` if no seat row, benign no-op if a newer heartbeat already landed, error otherwise | `supabase/functions/eas-game/store.ts`, `tests/online/memory-store.mjs` (same contract), `tests/online/heartbeat.mjs` (18 checks; 4 fail on the old code) |
| Test environment | No manifest or lockfile; runner could hide failures | `tests/package.json` + lockfile (exact pins), `requirements-dev.txt`, rewritten `tests/run-all.mjs` (groups, per-suite verdict, spawn errors, signals, Chromium discovery, Windows `python`), CI workflow | `tests/package.json`, `package-lock.json`, `requirements-dev.txt`, `run-all.mjs`, `.github/workflows/tests.yml` |
| Known failing suites | See below | Corrected at the right layer | `tests/e2e/local.py`, `run.py`, `tests/pwa/e2e.mjs`, `tests/layout/*` |
| Docs and migrations | README said 7 migrations, deploy guide an old sequence, 3-minute abandonment, timed Tahkim | `docs/MIGRATIONS.md` (inventory), `docs/DEPLOYMENT.md` (one order), architecture and setup docs corrected | `docs/*`, `README.md` |

Known failing suites, classified (none an application defect):

| Suite | Classification | Fix |
|---|---|---|
| `e2e/local.py`, `e2e/run.py` | Outdated expectation: default language is Indonesian, tests assert Arabic | `?lang=ar` |
| `pwa/e2e.mjs` | Outdated expectation (Arabic default; update goes straight to the saved-match question; flicker moved to `::after` and default graphics level is `low`) and a test defect (a `//` comment swallowed a click) | Corrected |
| `layout/history-toggle.mjs` | Stale `baseline.json` (also failing on v5.10.3) plus a capture artefact (`captureBeyondViewport` seam) | Baseline regenerated with the documented script, transient toast ignored, residue captured on screen |
| `layout/log-icon.mjs` | Test compared radius with the wrong button group | Compares with its row neighbour |
| `layout/float_modules.py` | Game Tools module retired on purpose; result card deliberately minimal | Assertions follow current design; README corrected |
| `layout/feel.mjs` | Turn dot removed in v5.10.2; control-bar panel is a gradient; one-time Tahkim hint replaced the move toast; a background tab does not run rAF, which `waitForSelector` polls with | Corrected (`bringToFront`, hint pre-set, aria-current) |

## 3. P1

| Item | Result |
|---|---|
| Mobile performance | `tools/build-dist.mjs` bundles the 15 stylesheets into `css/app.css` (cascade order preserved, dist only, precached); install suggestion shown 3 s after it is due (`js/pwa.js`). Guarded by `tests/pwa/dist.mjs` (10 checks). `modulepreload` was tried and rejected (slower first frame) |
| Arabic font stability | Cause: `line-height: normal` follows each font's metrics, Amiri's line box is 1.758 em, the interim system face about 1.17 em. In Arabic, normal is pinned to 1.758 (`css/style.css`, `:where()`, explicit line-heights win). Final Arabic sizes unchanged. `tests/layout/arabic-font.mjs`: 104 checks (4 viewports x delayed 0 / 400 ms / 1 s / blocked font, dialog opened before the font, cached, id->ar and en->ar). A metric-matched fallback `@font-face` using `local()` could not be verified here (no local font resolved) and was dropped |
| Real Supabase integration | Real Postgres suite below; the Supabase **platform** is not available here (section 9) |
| Real Service Worker | `pwa/e2e.mjs` registers a real Service Worker in Chromium: install, offline reopening, failed deploy never live, good deploy waits for the player, local match recovered after update, no reload loop (92 checks). Update during an **online** match: not tested |
| CORS | `_shared/core/cors.js`: `ALLOWED_ORIGIN` required (function refuses to start), exact normalised origins, `*` only with `EAS_DEV_CORS=1`, unapproved origin refused before auth/DB. 21 checks |
| Room-code rate limit | Migration `20261123000009`, table `join_misses` (RLS, no client grants), `eas_join_blocked` / `eas_join_miss` (`security definer`, empty `search_path`, `service_role` only), atomic upsert, 1 h retention. 8 misses per player and 30 per network key per 60 s. Keys: `u:<uid>`, `n:<HMAC of the trusted header>`; no raw IP stored. 17 checks plus SQL checks in the Postgres suite |

## 4. Security audit

Verified (executed):
- RLS enabled on all seven tables; as `authenticated`/`anon` (default Supabase privileges simulated): A reads only A's rack, B only B's, an outsider none; `game_private`, `game_actions`, `join_misses` unreadable; direct writes to games/racks/players denied; `commit_action`, `create_game_tx`, rate-limit and cleanup functions not executable by `anon` or `authenticated`; clients cannot insert broadcasts; the 14+ broadcasts recorded by the `games_announce` trigger contain no rack, bag or undo data.
- Heartbeat membership, stale-heartbeat and abandonment threshold against stored timestamps.
- Request bodies: 16 KB cap, JSON object only, read after authentication (9 checks).

Read, not changed: security-definer functions in migrations 03/07 use `search_path = public` (acceptable because `anon`/`authenticated` hold no `CREATE` on `public`; migration 09 uses an empty path).

Not verified: service-role key never reaching the browser beyond the existing build guard (the build refuses a service key; I did not re-audit); anonymous sign-in behaviour; realtime delivery and presence policies on the real Realtime service; chat spam beyond the existing gap limit; the network-key header (`TRUSTED_IP_HEADER`, default `cf-connecting-ip`) being platform-set and unforgeable on Supabase. If absent, the per-player key alone applies and a client that can mint anonymous accounts can sidestep it.

## 5. Test results (this environment)

| Group | Suites | Result |
|---|---|---|
| unit | 6 | pass |
| server (in-memory store) | 16 | pass (includes heartbeat 18, CORS 21, rate limit 17, body 9) |
| db (real Postgres, PGlite) | 1 | pass, 83 checks |
| a11y (contrast) | 1 | pass |
| pwa | 3 | pass (static 611, dist 10, real-SW e2e 92) |
| e2e | 5 | pass (`local.py` 49, `run.py` 112) |
| layout | 17 | all pass when run individually after the fixes (e.g. history-toggle 248, log-icon 189, float_modules 50, feel 72, arabic-font 104) |

Caveat: I did not get one uninterrupted `npm test` over all groups in the final state: the sandbox VM restarted during the session and killed long background runs, so the groups were run one after another and the layout suites that failed earlier were re-run individually. A clean checkout (`npm ci`, no `node_modules`) passed unit, server, db, a11y and pwa, and `sync-edge-shared --check` and the production build succeeded there.

Commands: `cd tests && npm ci && npm run setup:browser && pip install -r requirements-dev.txt && npm test` (groups: `npm run test:unit|server|db|e2e|layout|pwa|a11y`).

## 6. Performance (local Lighthouse 12, Chromium 1243, brotli static server; not PageSpeed Insights)

Median of 3 runs (baseline) and 5 runs (improved) mobile, 3 runs desktop, same setup.

| Metric | v5.11.0 | Improved | Change |
|---|---:|---:|---:|
| Mobile Performance | 77 | 96 | +19 |
| Desktop Performance | 98 | 99 | +1 |
| FCP (mobile) | 2796 ms | 1891 ms | -905 ms |
| LCP (mobile) | 4534 ms | 2416 ms | -2118 ms |
| TBT (mobile) | 180 ms | 49 ms | -131 ms |
| CLS | 0 | 0 | none |
| Requests | 74 | 60 | -14 |
| Transfer | 472 KB | 461 KB | -11 KB |
| JavaScript transfer | 140 KB | 140 KB | none |
| CSS transfer | 48 KB | 38 KB | -10 KB |

The LCP element was the install suggestion; part of the LCP gain is its 3 s delay. One improved run scored 94 (FCP 2124 ms, LCP 2724 ms). Not measured: 360x800 / 412x915 / tablet / landscape Lighthouse runs, INP, real devices, a CPU slower than Lighthouse's 4x throttle. PageSpeed Insights (external URL) was not possible.

## 7. Migration guide

A new migration is required: `supabase/migrations/20261123000009_eas_v5_11_1_join_rate_limit.sql` (forward-only, re-runnable, touches no existing table or row). Apply with `supabase db push` before deploying the function. Rollback: drop the two functions and `join_misses` (counters only), after rolling the function back. Full inventory and order: `docs/MIGRATIONS.md`.

## 8. Deployment guide

`docs/DEPLOYMENT.md`: database, then Edge Function (`ALLOWED_ORIGIN` mandatory; optional `RATE_LIMIT_SALT`, `TRUSTED_IP_HEADER`), then static site (`write-env`, `stamp-sw`, `build-dist`), then PWA update and verification. Nothing was deployed.

## 9. Remaining limitations (NOT VERIFIED)

- The Supabase platform: GoTrue JWTs, PostgREST, Realtime delivery, the Edge runtime. The Postgres suite uses PGlite with stand-ins for auth, roles and realtime (`tests/db/pg.mjs`); a local Supabase (Docker) or authorised staging project is needed.
- Two-player browser E2E against real Supabase (the existing 112-check E2E uses the real service on the in-memory store).
- Service Worker update during an active online match; network interruption, sleep/wake and old-client simulations.
- Applying 01 -> 09 on a real Supabase project; behaviour of `pg_cron` jobs.
- Network key header trust; anonymous-sign-in abuse.
- Arabic fonts on real devices with their own system fonts.

## 10. Release readiness

**NOT READY FOR PRODUCTION.** READY FOR PREVIEW: yes, as a Vercel preview against a staging Supabase project, to run the items in section 9. Gates for production: items in section 9 executed on staging, one uninterrupted full `npm test` on CI, and a decision on the 3 s install-suggestion delay.
