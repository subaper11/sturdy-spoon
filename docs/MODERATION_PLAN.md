# Moderation plan (minimum viable)

Status in 5.12: only input hygiene exists. Nicknames and chat are trimmed, length-limited and stripped of control characters on the server (`sanitize*` in `_shared/core/engine.js`), and they are rendered as text, never as markup (`js/safehtml.js`). Nothing below is implemented yet.

## Threats that matter for a private-room word game
1. Abuse in the room chat and in Tahkim discussion (insults, spam).
2. Offensive nicknames shown to the other player.
3. Strangers guessing room codes (already rate limited, v5.11.1).

## Plan, in order of cost
1. **Per-room mute (client only, cheap).** A "hide chat" toggle per player; hidden text is not rendered but still stored. No server change.
2. **Leave and block (small).** `leave_room` exists. Add a per-browser block list of room hosts so a blocked host's codes are refused on join. Client only; it is a convenience, not a security boundary.
3. **Report (medium).** Action `report` writes (game_id, reporter, reported seat, last N chat lines) to a server-only table `reports` (no client grant). Review by SQL in the dashboard; no UI for moderators. Rate limited with `eas_rate_hit`.
4. **Word filter (medium, contested).** A small server-side list applied to nicknames at `create_room`/`join_room` only (not to chat: a game that explains Arabic words will always trip naive filters). Needs a list owned by someone who reads Arabic and Indonesian.
5. **Retention.** Chat lives in `games.ext` and is removed with the game by the hourly cleanup (needs pg_cron, see DEPLOYMENT.md).

## Not planned
Automatic bans, accounts, or content classification: sign-in is anonymous, so a ban has nothing to attach to.
