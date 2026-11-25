import { makeWorld, suite, across, uuidFrom } from './lib.mjs';
import { TAHKIM_MAX_MS, HEARTBEAT_MS } from '../../supabase/functions/_shared/game/config.js';
const { ok, group, done } = suite('online tahkim v5.12: a dispute cannot hold the match for ever (close_tahkim)');
const MIN = 60000, SEC = 1000;
async function dispute(seed = 7) {   // A plays a word, B (on turn) challenges it
  const w = makeWorld({ seed }); await w.start({ minutes: 10 });
  w.giveRack('A', [...'كتاب']); await w.call('A', 'snapshot');
  await w.call('A', 'submit_move', { placements: across(w.snap.A, 'كتاب') }); await w.call('B', 'snapshot');
  w.clock.t += 5 * SEC;
  const r = await w.call('B', 'request_tahkim', { reason: 'كلمة غير مقبولة' }); await w.call('A', 'snapshot');
  w.t0 = w.clock.t; return w;   // t0 = request time
}
const snapOf = async (w, k = 'A') => (await w.call(k, 'snapshot')).snapshot;
// both players stay "online": a heartbeat every HEARTBEAT_MS until `until` ms after the request
const keepAlive = async (w, until) => { while (w.clock.t < w.t0 + until) { w.clock.t += HEARTBEAT_MS; await w.call('A', 'heartbeat'); await w.call('B', 'heartbeat'); } };

ok(TAHKIM_MAX_MS === 10 * MIN, 'TAHKIM_MAX_MS is 10 minutes, shared by the browser and the server copy');

group('a stubborn player: heartbeats keep them "online", only close_tahkim frees the match');
{
  const w = await dispute(); await w.call('A', 'tahkim_vote', { verdict: 'valid' });   // B never chooses
  await keepAlive(w, 9 * MIN);
  const early = await w.call('A', 'close_tahkim'); ok(!early.ok && early.code === 'TAHKIM_NOT_EXPIRED' && early.retry_in_ms > 0, 'closing before the limit is refused: ' + early.code);
  ok((await snapOf(w)).game.status === 'tahkim_pending', 'still pending after the refused close');
  const ab = await w.call('A', 'claim_abandon'); ok(!ab.ok && ab.code === 'NOT_ABANDONED', 'claim_abandon cannot help: the stubborn player is still heartbeating');
  w.clock.t = w.t0 + TAHKIM_MAX_MS - 1; const edge = await w.call('A', 'close_tahkim'); ok(!edge.ok && edge.code === 'TAHKIM_NOT_EXPIRED', '1 ms before the limit is still refused');
  w.clock.t = w.t0 + TAHKIM_MAX_MS; const r = await w.call('A', 'close_tahkim'); ok(r.ok && r.snapshot.game.status === 'active', 'at the limit the player who is NOT the challenger can close it');
}
{
  const w = await dispute(); w.clock.t = w.t0 + TAHKIM_MAX_MS + 1;
  const r = await w.call('B', 'close_tahkim'); ok(r.ok && r.snapshot.game.status === 'active', 'the challenger can close it too');
}

group('what closing does: move stands, no penalty, clocks resume, same move cannot be challenged again');
{
  const w = await dispute(); const before = await snapOf(w); const ms = before.players.map(p => p.ms_left);
  ok(ms[1] === 10 * MIN - 5 * SEC && !before.game.clock_running, 'clocks stopped at the request, B had spent 5 s');
  await keepAlive(w, 10 * MIN);
  const at = w.clock.t, r = await w.call('A', 'close_tahkim'), s = r.snapshot;
  ok(s.game.tahkim.state === 'closed_timeout' && s.game.status === 'active', 'state closed_timeout, status active');
  ok(s.players.map(p => p.ms_left).join() === ms.join(), 'both clocks resume from what each had left (10 minutes of dispute not charged)');
  ok(s.game.clock_running && s.game.current_seat === 1 && s.game.turn_started_at === at && s.game.turn_deadline_at === at + ms[1], 'the clock runs for the player on turn from now');
  ok(s.moves[0].st === 'ok' && s.board[7].some(c => c) && s.players[0].score === before.players[0].score && s.players[1].score === before.players[1].score, 'the move is NOT void: board and scores untouched, no penalty');
  ok(s.game.tahkim_declined === 1 && s.game.tahkim_available === false, 'tahkim_declined = the move number');
  ok(s.game.tahkim_log.length === 1 && s.game.tahkim_log[0].verdict === 'timeout' && s.game.tahkim_log[0].move_number === 1, 'recorded in tahkim_log with verdict timeout');
  await w.call('B', 'snapshot');
  const again = await w.call('B', 'request_tahkim', { reason: 'مرة أخرى' }); ok(!again.ok && ['NO_TAHKIM', 'TAHKIM_DECLINED'].includes(again.code), 'the same move cannot be challenged again: ' + again.code);
  const mv = await w.call('B', 'pass_turn'); ok(mv.ok, 'play continues normally (B passes)');
}

group('idempotency, stale state and wrong callers');
{
  const w = await dispute(); w.clock.t = w.t0 + TAHKIM_MAX_MS;
  const body = { action: 'close_tahkim', game_id: w.gameId, client_action_id: '44444444-4444-4444-8444-444444444444' };
  const x = await w.raw('A', body), y = await w.raw('A', body);
  ok(x.ok && y.ok && y.duplicate, 'a retried close (same action id) answers with the state, it does not act twice');
  ok((await snapOf(w)).game.tahkim_log.length === 1, 'one log record only');
  const z = await w.call('B', 'close_tahkim'); ok(!z.ok && z.code === 'NOT_IN_TAHKIM', 'a second close with a new id: no session any more');
  const stale = await w.call('A', 'close_tahkim', { base_revision: 1 }); ok(!stale.ok && stale.code === 'NOT_IN_TAHKIM', 'an old base_revision changes nothing: not a pinned action, the server decides from its own state');
}
{
  const w = await dispute(); w.clock.t = w.t0 + TAHKIM_MAX_MS;
  const out = await w.raw('C', { action: 'close_tahkim', game_id: w.gameId, client_action_id: uuidFrom(w.rng) }); ok(!out.ok && out.code === 'NOT_MEMBER', 'a non-member cannot close it');
  ok((await snapOf(w)).game.status === 'tahkim_pending', 'and nothing changed');
  const w2 = makeWorld({ seed: 9 }); await w2.start({ minutes: 10 });
  const live = await w2.call('A', 'close_tahkim'); ok(!live.ok && live.code === 'NOT_IN_TAHKIM', 'no discussion open: refused');
}
{
  const w = await dispute(); w.clock.t = w.t0 + TAHKIM_MAX_MS;   // the limit comes from the server's timestamp, never from the request body
  const r = await w.call('A', 'close_tahkim', { requested_at: 0, now: w.clock.t + 99999999, max: 0 }); ok(r.ok, 'extra client-supplied fields are ignored');
  const w2 = await dispute(); w2.clock.t = w2.t0 + TAHKIM_MAX_MS - SEC;
  const r2 = await w2.call('A', 'close_tahkim', { requested_at: 0, now: w2.clock.t + 99999999 }); ok(!r2.ok && r2.code === 'TAHKIM_NOT_EXPIRED', 'a client cannot move the deadline');
}

group('parity: the mutual routes still work, before and after the limit');
{
  const w = await dispute(); await w.call('A', 'tahkim_vote', { verdict: 'invalid' }); const r = await w.call('B', 'tahkim_vote', { verdict: 'invalid' });
  ok(r.snapshot.game.tahkim.state === 'resolved_invalid' && r.snapshot.moves[0].st === 'void', 'mutual invalid voids the move as before');
}
{
  const w = await dispute(); w.clock.t = w.t0 + 3 * TAHKIM_MAX_MS; await w.call('A', 'tahkim_vote', { verdict: 'valid' });
  const r = await w.call('B', 'tahkim_vote', { verdict: 'valid' }); ok(r.snapshot.game.tahkim.state === 'resolved_valid', 'a mutual verdict is still accepted long after the limit (until someone closes)');
  const c = await w.call('A', 'close_tahkim'); ok(!c.ok && c.code === 'NOT_IN_TAHKIM', 'and then close_tahkim has nothing to close');
}
{
  const w = await dispute(); w.clock.t = w.t0 + TAHKIM_MAX_MS; await w.call('A', 'close_tahkim');
  const v = await w.call('B', 'tahkim_vote', { verdict: 'valid' }); ok(!v.ok && v.code === 'NOT_IN_TAHKIM', 'a vote arriving after the close is refused');
}
done();
