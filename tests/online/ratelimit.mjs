// Room-code guessing limiter: shared state (not per instance), per-user and per-network keys, hashed addresses, protected SQL.
import { makeWorld, suite } from './lib.mjs';
import fs from 'fs'; import { netKey } from '../../supabase/functions/_shared/core/netkey.js';
import { handleRequest } from '../../supabase/functions/_shared/core/service.js';
const { ok, group, done } = suite('room-code rate limiting');
const SEC = 1000, guess = (w, who, extra = {}, n = 'ZZZZZ3') => handleRequest(w.store, w.users[who], { action: 'join_room', code: n }, { ...w.deps, ...extra });

group('limits live in the store, so a fresh handler context (another function instance) cannot reset them');
{
  const w = makeWorld({ seed: 5, who: ['A', 'D'] }); await w.raw('A', { action: 'create_room', nickname: 'A' });
  for (let i = 0; i < 8; i++) await guess(w, 'D', { netKey: null });
  const fresh = { now: w.deps.now, rng: w.deps.rng, uuid: w.deps.uuid };   // an instance that never saw the earlier misses
  const r = await handleRequest(w.store, w.users.D, { action: 'join_room', code: 'ZZZZZ3' }, fresh);
  ok(!r.ok && r.code === 'RATE_LIMITED', 'the ninth attempt is refused through a brand-new deps/handler context');
}
group('one network address cannot rotate through new anonymous accounts');
{
  const w = makeWorld({ seed: 6, who: ['A', 'D', 'E', 'F', 'G', 'H'] }); await w.raw('A', { action: 'create_room', nickname: 'A' });
  const net = { netKey: 'abc123' }; let last;
  for (let i = 0; i < 30; i++) last = await guess(w, ['D', 'E', 'F', 'G', 'H'][i % 5], net);   // 6 misses per account: no per-user limit (8) is hit
  ok(last.code === 'ROOM_NOT_FOUND', '30 misses spread over five accounts are answered normally');
  const r = await guess(w, 'D', net); ok(r.code === 'RATE_LIMITED', 'the 31st from the same network is refused for every account');
  const other = await guess(w, 'E', { netKey: 'different' }); ok(other.code === 'ROOM_NOT_FOUND', 'a different network is unaffected');
}
group('window resets');
{
  const w = makeWorld({ seed: 7, who: ['A', 'D'] }); await w.raw('A', { action: 'create_room', nickname: 'A' });
  for (let i = 0; i < 8; i++) await guess(w, 'D', {});
  ok((await guess(w, 'D', {})).code === 'RATE_LIMITED', 'blocked inside the window');
  w.clock.t += 61 * SEC; ok((await guess(w, 'D', {})).code === 'ROOM_NOT_FOUND', 'allowed again after the window');
}
group('store failure fails closed');
{
  const w = makeWorld({ seed: 8, who: ['A', 'D'] }); w.store.joinBlocked = () => { throw new Error('rpc failed: relation "public.join_misses" ...'); };
  const r = await guess(w, 'D', {}); ok(!r.ok && r.code === 'SERVER_ERROR' && !/join_misses|relation/.test(JSON.stringify(r)), 'SERVER_ERROR, no internals leaked');
}
group('network key');
{
  const H = o => new Headers(o), k = (o, n = 'cf-connecting-ip', s = 'salt') => netKey(H(o), n, s);
  const a = await k({ 'cf-connecting-ip': '203.0.113.9' });
  ok(/^[0-9a-f]{32}$/.test(a) && !a.includes('203'), 'a 32-hex keyed hash, not the address');
  ok(a === await k({ 'cf-connecting-ip': '203.0.113.9' }) && a !== await k({ 'cf-connecting-ip': '203.0.113.10' }) && a !== await k({ 'cf-connecting-ip': '203.0.113.9' }, 'cf-connecting-ip', 'other'), 'stable per address and per salt');
  ok(await k({ 'cf-connecting-ip': '1.1.1.1, 203.0.113.9' }) === a, 'only the last (proxy-appended) value counts; a client-prefixed fake is ignored');
  ok(await k({ 'x-forwarded-for': '203.0.113.9' }) === null && await k({}) === null, 'an untrusted or missing header gives no key');
  ok(await k({ 'cf-connecting-ip': 'not an ip!' }) === null && await k({ 'cf-connecting-ip': '1.1.1.1' }, 'cf-connecting-ip', '') === null, 'garbage or no salt gives no key');
}
group('migration 20261123000009 is server-only');
{
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261123000009_eas_v5_11_1_join_rate_limit.sql', import.meta.url), 'utf8');
  ok(/alter table public\.join_misses enable row level security/.test(sql) && !/create policy/i.test(sql), 'RLS on, no policy');
  ok(/revoke all on public\.join_misses from public, anon, authenticated/.test(sql), 'no client grants on the table');
  ok((sql.match(/security definer set search_path = ''/g) || []).length === 2, 'both functions are security definer with an empty search_path');
  ok(/grant execute on function public\.eas_join_blocked\(text\[\], integer\[\], integer\) to service_role/.test(sql) && /grant execute on function public\.eas_join_miss\(text\[\], integer\) to service_role/.test(sql) && !/to (anon|authenticated|public)\s*;/.test(sql.replace(/revoke[^;]*;/g, '')), 'only service_role may execute');
  ok(/on conflict \(key\) do update/.test(sql) && /delete from public\.join_misses where window_start/.test(sql) && !/drop |truncate|delete from public\.(games|game_)/i.test(sql), 'atomic upsert, retention cleanup, nothing destructive for existing data');
}
group('create_room limiter (v5.12): per player and per network, per minute and per hour, shared state');
{
  const mk = (seed, who) => makeWorld({ seed, who }), create = (w, k, extra = {}) => handleRequest(w.store, w.users[k], { action: 'create_room', nickname: 'X' }, { ...w.deps, ...extra });
  const w = mk(21, ['A']);
  // a player who keeps leaving and re-creating: 5 per minute, the 6th is refused
  let res = [];
  for (let i = 0; i < 6; i++) { const r = await create(w, 'A'); res.push(r); if (r.ok) await w.raw('A', { action: 'leave_room', game_id: r.snapshot.game.id, client_action_id: w.deps.uuid() }); }
  ok(res.slice(0, 5).every(r => r.ok) && res[5].code === 'RATE_LIMITED', 'five creations per minute, the sixth is RATE_LIMITED: ' + res.map(r => r.ok ? 'ok' : r.code).join(','));
  const fresh = { now: w.deps.now, rng: w.deps.rng, uuid: w.deps.uuid };   // another function instance: the counter is in the store
  ok((await handleRequest(w.store, w.users.A, { action: 'create_room', nickname: 'X' }, fresh)).code === 'RATE_LIMITED', 'still limited from a brand-new handler context');
  w.clock.t += 61 * SEC; const again = await create(w, 'A'); ok(again.ok, 'allowed again after the minute');
  // the hourly ceiling: 30 per hour, spread so the minute limit never trips
  const h = mk(22, ['B']); let made = 0, blocked = null;
  for (let i = 0; i < 40 && !blocked; i++) { const r = await create(h, 'B'); if (r.ok) { made++; await h.raw('B', { action: 'leave_room', game_id: r.snapshot.game.id, client_action_id: h.deps.uuid() }); } else blocked = r.code; h.clock.t += 20 * SEC; }
  ok(made === 30 && blocked === 'RATE_LIMITED', `hourly ceiling: ${made} created, then ${blocked}`);
  // network key: three accounts on one address share a looser bucket (15/min); a different address is unaffected
  const n = mk(23, ['A', 'B', 'C', 'D']); let okN = 0, lim = null;
  for (let i = 0; i < 20 && !lim; i++) { const who = 'ABC'[i % 3]; const r = await create(n, who, { netKey: 'shared-net' }); if (r.ok) { okN++; await n.raw(who, { action: 'leave_room', game_id: r.snapshot.game.id, client_action_id: n.deps.uuid() }); } else lim = r.code; }
  ok(okN === 15 && lim === 'RATE_LIMITED', `network bucket: ${okN} created, then ${lim}`);
  ok((await create(n, 'D', { netKey: 'other-net' })).ok, 'a different network is unaffected');
  // a player already in a game gets ALREADY_IN_GAME, not a counted attempt
  const g = mk(24, ['A']); const first = await create(g, 'A'); for (let i = 0; i < 10; i++) { const r = await create(g, 'A'); if (r.code !== 'ALREADY_IN_GAME') { ok(false, 'unexpected ' + r.code); break; } }
  ok(first.ok, 'returning to your own open game is never rate limited');
  // failure fails closed
  const f = mk(25, ['A']); f.store.rateHit = () => { throw new Error('relation "public.join_misses" does not exist'); };
  const r = await create(f, 'A'); ok(!r.ok && r.code !== 'RATE_LIMITED' && !/join_misses|relation/.test(JSON.stringify(r)), 'store failure: refused without leaking internals (' + r.code + ')');
}
group('migration 20261125000010 is server-only');
{
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261125000010_eas_v5_12_create_rate_limit.sql', import.meta.url), 'utf8');
  ok(/security definer set search_path = ''/.test(sql) && /revoke all on function public\.eas_rate_hit\(text\[\], integer\[\], integer\) from public, anon, authenticated/.test(sql) && /grant execute on function public\.eas_rate_hit\(text\[\], integer\[\], integer\) to service_role/.test(sql), 'security definer, empty search_path, service_role only');
  ok(/on conflict \(key\) do update/.test(sql) && !/drop |truncate|delete from public\.(games|game_)/i.test(sql), 'atomic upsert, touches no game data');
}
group('ops_health: is the clean-up job scheduled? (production needs pg_cron)');
{
  const w = makeWorld({ seed: 31, who: ['A'] });
  const on = await handleRequest(w.store, w.users.A, { action: 'ops_health' }, w.deps); ok(on.ok && on.cleanup_scheduled === true, 'reports a scheduled job');
  w.store.cronOn = false; const off = await handleRequest(w.store, w.users.A, { action: 'ops_health' }, w.deps); ok(off.ok && off.cleanup_scheduled === false && Object.keys(off).sort().join() === 'cleanup_scheduled,ok', 'reports an unscheduled job, and nothing else');
  const bad = await handleRequest(w.store, 'not-a-uuid', { action: 'ops_health' }, w.deps); ok(!bad.ok, 'needs a signed-in user');
}
done();
