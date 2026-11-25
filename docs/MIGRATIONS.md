# Database migrations: canonical inventory (v5.11.1)

Nine forward-only files in `supabase/migrations/`, applied in filename order by `supabase db push`. **Never edit, rename or renumber one that has been deployed**: Supabase records applied versions by filename. A correction is a new file.

| # | File | Version | What it does | Re-runnable? |
|---|---|---|---|---|
| 01 | `20261024000001_eas_online_schema.sql` | 5.0 | Tables `games`, `game_players`, `game_moves`, `player_racks`, `game_private`, `game_actions`; checks (room-code format `^[A-HJ-NP-Z2-9]{6}$`, inline `tile_mode` check), indexes | **No** (plain `create table`) |
| 02 | `…02_eas_online_security.sql` | 5.0 | RLS on all six tables; grants `select` to `authenticated` on the four readable tables; `eas_is_member()`; policies `members read their game / game players / game moves`, `owner reads own rack`; `realtime.messages` policies `members receive game channel`, `members track presence`. `game_private` and `game_actions`: RLS on, no policy, no grant | **No** (`create policy`) |
| 03 | `…03_eas_online_functions.sql` | 5.0 | `create_game_tx`, `commit_action` (atomic, revision compare-and-set, idempotency), `games_announce` trigger (realtime), `eas_cleanup_stale_games`; hourly `pg_cron` job if the extension exists. Functions granted to `service_role` only | Functions yes; the trigger statement is not |
| 04 | `…04_eas_v5_no_validator_abandon.sql` | 5.0 | `validator_mode` default `off` and forced to `off` on old rows; `create_game_tx` replaced | Yes |
| 05 | `…05_eas_v5_1_pause_undo_live.sql` | 5.1 | `games.ext jsonb` (pause, undo, live preview, later chat); `create_game_tx` and `commit_action` replaced | Yes |
| 06 | `…06_eas_v5_2_drop_draft_policy.sql` | 5.2 | Drops `"members send drafts"` on `realtime.messages` (clients never publish) | Yes (`drop policy if exists`) |
| 07 | `…07_eas_v5_4_hardening.sql` | 5.4 | `eas_one_open_game` trigger (one open game per player, per-player lock); `eas_cleanup_anonymous_users(90)`; re-schedules both cron jobs when `pg_cron` is on | Yes |
| 08 | `…08_eas_v5_6_adaptive_mode.sql` | 5.6 | `games_tile_mode_check` now allows `expanded`, `basic`, `adaptive` | Yes |
| 09 | `20261123000009_eas_v5_11_1_join_rate_limit.sql` | 5.11.1 | Table `join_misses` (RLS on, no policy, no client grant); `eas_join_blocked()` and `eas_join_miss()` (`security definer`, `search_path = ''`, `service_role` only). Touches no existing table or row | Yes (`if not exists`, `create or replace`) |
| 10 | `20261125000010_eas_v5_12_create_rate_limit.sql` | 5.12.0 | `eas_rate_hit(keys, maxes, window_ms)` (`security definer`, `service_role` only): atomic per-key counter on the same `join_misses` table (keys prefixed `c:`), counts every attempt, true when any key is over its maximum. Used by `create_room`: per player 5/min and 30/h, per network address 15/min and 120/h (`RATE_LIMITED`). |
| 11 | `20261125000011_eas_v5_12_cleanup_status.sql` | 5.12.0 | `eas_cleanup_scheduled()` (`security definer`, `service_role` only): true only when pg_cron exists and the job `eas-cleanup-stale-games` is active. Read by the Edge Function action `ops_health`; `pwa-check.html` shows a red row when it is false. |

Dependencies: 02 needs 01; 03 needs 01–02; 04–05 replace functions from 03; 07's trigger needs the functions in 03/05; 09 stands alone but **the v5.11.1 Edge Function requires it** (a missing RPC makes `join_room` answer `SERVER_ERROR`).

Every historical deployment already depends on 01–08. Old installs upgrade by applying only the files they lack; a **clean** database applies 01→09 in order. Rollback of 09: `drop function public.eas_join_blocked(text[],integer[],integer); drop function public.eas_join_miss(text[],integer); drop table public.join_misses;` is safe (it holds only short-lived counters), but the v5.11.1 function must be rolled back first.

Review notes (no change made, deployed history is not rewritten): the security-definer functions from 03/07 use `search_path = public` (migration 09 uses an empty path); this is acceptable because `anon`/`authenticated` hold no `CREATE` on `public` in Supabase, and a stricter path can be set in a future forward migration. `pg_cron` is optional: without it, run `select public.eas_cleanup_stale_games();` and `select public.eas_cleanup_anonymous_users(90);` periodically.

**Not verified:** applying 01→09 to an empty Postgres and the upgrade path from each older state were not executed in this environment (no Postgres / Supabase CLI available). See `docs/V5_11_1_HARDENING_REPORT.md`.
