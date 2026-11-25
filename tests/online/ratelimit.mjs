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
done();
