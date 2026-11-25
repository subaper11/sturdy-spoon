// Heartbeat reliability: the service never reports success for a presence write that did not persist, and SupabaseStore.touch
// (run here against a scripted fake client, via node --experimental-transform-types) checks errors, zero-row updates and stale heartbeats.
import { makeWorld, suite } from './lib.mjs';
import { ABANDON_MS } from '../../supabase/functions/_shared/game/config.js';
import { SupabaseStore } from '../../supabase/functions/eas-game/store.ts';
const { ok, group, done } = suite('online heartbeat reliability');
const SEC = 1000;

// Fake supabase-js: `update` result and the follow-up `select` row are scripted; every call is recorded.
const fakeDb = ({ update, row }) => {
  const calls = [];
  const chain = (kind, res) => { const c = { then: (f, r) => Promise.resolve(res).then(f, r) }; for (const m of ['eq', 'lte', 'select', 'update', 'maybeSingle']) c[m] = (...a) => { calls.push([kind, m, ...a]); return c; }; return c; };
  return { calls, from: () => ({ update: v => { calls.push(['update', v]); return chain('update', update); }, select: () => chain('select', { data: row, error: null }) }) };
};

group('SupabaseStore.touch');
{
  let d = fakeDb({ update: { data: [{ player_id: 'p' }], error: null } });
  await new SupabaseStore(d).touch('g', 'p', 'online', 5000);
  ok(d.calls.some(c => c[1] === 'lte' && c[2] === 'last_seen_at'), 'update is guarded so it can never rewind a newer last_seen_at');
  d = fakeDb({ update: { data: null, error: { message: 'connection reset by peer (SQLSTATE 08006)' } } });
  let e = await new SupabaseStore(d).touch('g', 'p', 'online', 5000).catch(x => x);
  ok(e instanceof Error, 'a returned Supabase error is thrown, not swallowed');
  d = fakeDb({ update: { data: [], error: null }, row: null });
  e = await new SupabaseStore(d).touch('g', 'p', 'online', 5000).catch(x => x);
  ok(e?.code === 'NOT_MEMBER', 'zero rows and no seat row = NOT_MEMBER');
  d = fakeDb({ update: { data: [], error: null }, row: { last_seen_at: new Date(9000).toISOString() } });
  e = await new SupabaseStore(d).touch('g', 'p', 'online', 5000).catch(x => x);
  ok(e === undefined, 'zero rows because a NEWER heartbeat already landed is a benign no-op');
  d = fakeDb({ update: { data: [], error: null }, row: { last_seen_at: new Date(1000).toISOString() } });
  e = await new SupabaseStore(d).touch('g', 'p', 'online', 5000).catch(x => x);
  ok(e instanceof Error, 'zero rows while the stored time is still older = update not persisted: error');
}

group('service heartbeat');
{
  const w = makeWorld(); await w.start();
  w.clock.t += 30 * SEC;
  const r = await w.call('A', 'heartbeat');
  ok(r.ok && typeof r.revision === 'number' && r.opp_idle_ms >= 30 * SEC - 1, 'successful heartbeat reports revision and opponent idle time');
  ok(w.store.players.get(w.gameId).find(p => p.player_id === w.users.A).last_seen_at === w.clock.t, 'and really persisted last_seen_at');
}
{
  const w = makeWorld(); await w.start(); w.clock.t += 30 * SEC;
  w.store.failTouch = 'duplicate key value violates unique constraint "game_players_pkey"';
  const r = await w.call('A', 'heartbeat');
  ok(!r.ok && r.code === 'SERVER_ERROR', 'database failure -> ok:false SERVER_ERROR, not a fake success');
  ok(!/constraint|pkey|duplicate/i.test(JSON.stringify(r)), 'the response leaks no database internals');
}
{
  const w = makeWorld(); await w.start();
  const bad = await w.raw('C', { action: 'heartbeat', game_id: w.gameId });
  ok(!bad.ok && bad.code === 'NOT_MEMBER', 'outsider heartbeat refused');
  ok((await w.raw('A', { action: 'heartbeat', game_id: 'nope' })).code === 'BAD_REQUEST', 'invalid game id refused');
}

group('stale heartbeat and returning player');
{
  const w = makeWorld(); await w.start();
  const row = () => w.store.players.get(w.gameId).find(p => p.player_id === w.users.A);
  const t0 = w.clock.t; w.clock.t += 60 * SEC; await w.call('A', 'heartbeat');
  const newest = row().last_seen_at;
  await w.store.touch(w.gameId, w.users.A, 'offline', t0 + 10 * SEC);
  ok(row().last_seen_at === newest && row().connection_state === 'online', 'an out-of-order older heartbeat cannot rewind presence or state');
  w.clock.t += 120 * SEC; await w.call('A', 'heartbeat');
  ok(row().connection_state === 'online' && row().last_seen_at === w.clock.t, 'a player returning after silence is online again with a fresh timestamp');
}

group('abandonment around the threshold, with heartbeat failures');
{
  // B waits for A (seat 0 on turn). A's heartbeats fail to persist, so A must NOT look present: B may claim once the threshold passes.
  const w = makeWorld(); await w.start();
  w.clock.t += ABANDON_MS - 2 * SEC; w.store.failTouch = 'db down';
  ok((await w.call('A', 'heartbeat')).code === 'SERVER_ERROR', 'A heartbeat fails just before the threshold');
  ok((await w.call('B', 'claim_abandon')).code === 'NOT_ABANDONED', 'claim one second early is refused');
  w.clock.t += 3 * SEC;
  ok((await w.call('A', 'heartbeat')).code === 'SERVER_ERROR', 'A heartbeat fails again after the threshold');
  const c = await w.call('B', 'claim_abandon');
  ok(c.ok && c.snapshot.game.status === 'finished' && c.snapshot.game.result.reason === 'abandon', 'claim just after the threshold succeeds: failed heartbeats never extended A\'s presence');
}
{
  const w = makeWorld(); await w.start();
  w.clock.t += ABANDON_MS - 2 * SEC; await w.call('A', 'heartbeat');   // persisted: presence is genuinely refreshed
  w.clock.t += 3 * SEC;
  ok((await w.call('B', 'claim_abandon')).code === 'NOT_ABANDONED', 'a PERSISTED heartbeat does reset the abandonment clock');
}
done();
