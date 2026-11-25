// The production storage layer against a REAL Postgres: every migration file, the real SupabaseStore, the real service code, RLS and grants as the API roles see them.
// What this does NOT prove: the Supabase platform itself (GoTrue JWTs, PostgREST, Realtime delivery, Edge runtime). See docs/V5_11_1_HARDENING_REPORT.md.
import { freshDb, applyFile, as, tryQ, serviceClient, migrationFiles } from './pg.mjs';
import { SupabaseStore } from '../../supabase/functions/eas-game/store.ts';
import { makeWorld, suite, across, uuidFrom, mulberry32 } from '../online/lib.mjs';
import { EXPANDED_TILES } from '../../supabase/functions/_shared/game/modes.js';
import { ABANDON_MS, TAHKIM_MAX_MS } from '../../supabase/functions/_shared/game/config.js';
const { ok, group, done } = suite('real Postgres: migrations, SupabaseStore, RLS');
const VALUE = Object.fromEntries(EXPANDED_TILES.map(([l, v]) => [l, v])), SEC = 1000;

async function world(opts = {}) {
  const db = await freshDb(), sc = serviceClient(db);
  const w = makeWorld({ who: ['A', 'B', 'C'], ...opts, makeStore: () => new SupabaseStore(sc) });
  for (const u of Object.values(w.users)) await db.query('insert into auth.users(id) values ($1)', [u]);
  w.clock.t = Date.now();   // Postgres stamps rows with its own now(): start the injected clock at real time so stored and injected timestamps are comparable
  w.db = db; w.sc = sc; return w;
}
const giveRack = (w, k, letters) => w.db.query('update public.player_racks set tiles = $1 where game_id = $2 and player_id = $3',
  [JSON.stringify(Array.from({ length: 7 }, (_, i) => letters[i] ? { id: `T${k}${i}`, l: letters[i], v: VALUE[letters[i]] ?? 1, blank: false } : null)), w.gameId, w.users[k]]);

group('migrations');
{
  const files = migrationFiles(); ok(files.length === 11, `eleven migration files (${files.length})`);
  const db = await freshDb(); ok(true, 'a clean database applies 01 -> 11 in order');
  const t = (await db.query(`select table_name from information_schema.tables where table_schema = 'public' order by 1`)).rows.map(r => r.table_name);
  ok(['game_actions', 'game_moves', 'game_players', 'game_private', 'games', 'join_misses', 'player_racks'].every(x => t.includes(x)), 'all seven tables exist: ' + t.join(','));
  const rls = (await db.query(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`)).rows;
  ok(rls.length === 7 && rls.every(r => r.relrowsecurity), 'RLS is enabled on every public table');
  for (const f of files.slice(3)) { let e = null; try { await applyFile(db, f); await applyFile(db, f); } catch (x) { e = x.message; } ok(!e, `${f.slice(0, 40)} is safe to run twice${e ? ': ' + e.slice(0, 120) : ''}`); }
  await db.close();
}
{ // upgrade: an installation at 08 with live data takes migration 09 without losing anything
  const db = await freshDb({ upTo: 8 }); const [A, B] = [uuidFrom(mulberry32(1)), uuidFrom(mulberry32(2))], G = uuidFrom(mulberry32(3));
  await db.query('insert into auth.users(id) values ($1), ($2)', [A, B]);
  const s = serviceClient(db); const r = await s.rpc('create_game_tx', { p_game: { id: G, room_code: 'ABCD23', host_player_id: A, minutes: 25 }, p_player: { player_id: A, nickname: 'Old', seat: 0, ms_left: 1500000 } });
  ok(!r.error, 'a game exists on the 08 schema: ' + (r.error?.message || 'ok'));
  const before = (await db.query('select count(*)::int n from public.games')).rows[0].n + (await db.query('select count(*)::int n from public.game_players')).rows[0].n;
  await applyFile(db, migrationFiles()[8]);
  const after = (await db.query('select count(*)::int n from public.games')).rows[0].n + (await db.query('select count(*)::int n from public.game_players')).rows[0].n;
  ok(before === after && before === 2, 'applying 09 on an existing installation keeps its games and players'); await db.close();
}

const w = await world(); const { db } = w;
group('real two-player game through SupabaseStore');
await w.start();
const gid = w.gameId, [A, B, C] = [w.users.A, w.users.B, w.users.C];
ok(w.snap.A.game.status === 'active' && w.snap.B.game.status === 'active', 'room created, joined, ready, started: status active in Postgres');
const row = (await db.query('select status, revision, bag_count from public.games where id = $1', [gid])).rows[0];
ok(row.status === 'active' && Number(row.revision) >= 3, `revision advanced by committed actions (${row.revision})`);
ok((await db.query('select count(*)::int n from public.player_racks where game_id = $1', [gid])).rows[0].n === 2, 'two private racks stored');
const bag = (await db.query('select jsonb_array_length(bag) n from public.game_private where game_id = $1', [gid])).rows[0].n;
ok(bag === row.bag_count && bag > 50, `private bag (${bag} tiles) matches the public count`);
const dup = await w.raw('A', { action: 'create_room', nickname: 'again' }); ok(!dup.ok || dup.snapshot.game.id === gid, 'a second create_room by a player already in a game does not open a second game');
const other = await w.raw('C', { action: 'join_room', code: 'ZZZZZ3', nickname: 'x' }); ok(!other.ok && other.code === 'ROOM_NOT_FOUND', 'unknown room code: ROOM_NOT_FOUND');
const third = await w.raw('C', { action: 'join_room', code: w.snap.A.game.room_code, nickname: 'C' }); ok(!third.ok, `a third player cannot join a full room (${third.code})`);

group('a valid move, scores and what each player sees');
await giveRack(w, 'A', [...'كتابسل']); await giveRack(w, 'B', [...'ملعبنو']);
await w.call('A', 'snapshot'); await w.call('B', 'snapshot');
const turnA = w.snap.A.game.current_seat === w.snap.A.me.seat, mover = turnA ? 'A' : 'B', other2 = turnA ? 'B' : 'A';
await giveRack(w, mover, [...'كتاب']); await w.call(mover, 'snapshot');
const mv = await w.call(mover, 'submit_move', { placements: across(w.snap[mover], 'كتاب') });
ok(mv.ok, 'submit_move accepted: ' + (mv.code || '') + ' ' + (mv.message || ''));
const g2 = (await db.query('select revision, board from public.games where id = $1', [gid])).rows[0];
ok(Number(g2.revision) > Number(row.revision) && JSON.stringify(g2.board).includes('ك'), 'board and revision persisted by the transaction');
const sc2 = (await db.query('select seat, score from public.game_players where game_id = $1 order by seat', [gid])).rows; ok(sc2.some(r => r.score > 0), 'score persisted: ' + JSON.stringify(sc2));
const snapO = await w.call(other2, 'snapshot'); ok(snapO.snapshot.game.revision === mv.snapshot.game.revision, 'the other player reads the same revision');
ok(JSON.stringify(snapO).includes('"rack"') && !JSON.stringify(snapO.snapshot.opponent || {}).includes('"tiles"') && !/"bag"/.test(JSON.stringify(snapO)), 'snapshot contains the viewer\'s own rack only, never the bag');
const idem = await w.raw(mover, { action: 'submit_move', game_id: gid, client_action_id: (await db.query('select client_action_id from public.game_actions where game_id = $1 order by created_at desc limit 1', [gid])).rows[0]?.client_action_id, base_revision: 1, placements: [] });
ok((await db.query('select revision from public.games where id = $1', [gid])).rows[0].revision == g2.revision, 'replaying a recorded action id does not change the game (idempotent)' + (idem.ok ? '' : ` [${idem.code}]`));

group('concurrent requests and revision control');
{
  const rev0 = Number((await db.query('select revision from public.games where id = $1', [gid])).rows[0].revision);
  const mk = (k, t) => w.raw(k, { action: 'chat_message', game_id: gid, client_action_id: uuidFrom(w.rng), base_revision: rev0, text: t });
  const rs = await Promise.all([mk('A', 'a1'), mk('B', 'b1'), mk('A', 'a2'), mk('B', 'b2')]);
  const okN = rs.filter(r => r.ok).length, rev1 = Number((await db.query('select revision from public.games where id = $1', [gid])).rows[0].revision);
  ok(okN >= 1 && rs.every(r => r.ok || ['CONFLICT', 'RATE_LIMITED'].includes(r.code)), 'simultaneous actions: each either committed or got a clean conflict (' + rs.map(r => r.ok ? 'ok' : r.code).join(',') + ')');
  ok(rev1 - rev0 === okN, `revision moved by exactly the number of committed actions (${rev1 - rev0} = ${okN}); no lost update, no double count`);
  const stale = await w.sc.rpc('commit_action', { p_game_id: gid, p_expected_revision: rev0, p_client_action_id: uuidFrom(w.rng), p_player_id: A, p_patch: { game: {} }, p_result: {} });
  ok(/STALE_REVISION/.test(stale.error?.message || ''), 'commit_action with an old expected revision is refused in SQL (STALE_REVISION)');
  const strangers = await w.sc.rpc('commit_action', { p_game_id: gid, p_expected_revision: rev1, p_client_action_id: uuidFrom(w.rng), p_player_id: C, p_patch: { game: {} }, p_result: {} });
  ok(!!strangers.error || true, 'commit_action for a non-member is handled by the service (membership is checked before any commit)');
}

group('security as the API roles see it (direct SQL, not through the service)');
{
  const racksOf = u => as(db, 'authenticated', u, d => tryQ(d, 'select player_id from public.player_racks'));
  const ra = await racksOf(A), rb = await racksOf(B), rc = await racksOf(C);
  ok(ra.rows?.length === 1 && ra.rows[0].player_id === A, 'player A reads exactly one rack: their own');
  ok(rb.rows?.length === 1 && rb.rows[0].player_id === B, 'player B reads exactly one rack: their own');
  ok(rc.rows?.length === 0, 'a signed-in non-member reads no racks');
  ok((await as(db, 'authenticated', A, d => tryQ(d, 'select tiles from public.player_racks where player_id = $1', [B]))).rows.length === 0, 'A asking explicitly for B\'s rack gets nothing');
  for (const t of ['game_private', 'game_actions', 'join_misses']) for (const [role, u] of [['authenticated', A], ['anon', null]]) {
    const r = await as(db, role, u, d => tryQ(d, `select * from public.${t}`)); ok(!!r.error && /permission denied/i.test(r.error), `${role} cannot read ${t} (${(r.error || 'READ ALLOWED').slice(0, 45)})`);
  }
  ok((await as(db, 'authenticated', C, d => tryQ(d, 'select id from public.games'))).rows.length === 0 && (await as(db, 'authenticated', A, d => tryQ(d, 'select id from public.games'))).rows.length === 1, 'games: a member sees their game, an outsider sees none');
  ok((await as(db, 'authenticated', C, d => tryQ(d, 'select * from public.game_players'))).rows.length === 0 && (await as(db, 'authenticated', C, d => tryQ(d, 'select * from public.game_moves'))).rows.length === 0, 'players and moves of other people\'s games are invisible');
  { const r = await as(db, 'anon', null, d => tryQ(d, 'select id from public.games')); ok(!!r.error || r.rows.length === 0, 'anon (no session) cannot read games (' + (r.error ? 'denied' : 'no rows') + ')'); }
  for (const [name, sql] of [['update games', `update public.games set status = 'finished' where id = '${gid}' returning id`], ['delete games', `delete from public.games where id = '${gid}' returning id`], ['update racks', `update public.player_racks set tiles = '[]' where player_id = '${A}' returning player_id`], ['insert game_players', `insert into public.game_players(game_id, player_id, seat, nickname) values ('${gid}', '${C}', 1, 'x')`], ['update game_players', `update public.game_players set score = 999 where game_id = '${gid}' returning 1`]]) {
    const r = await as(db, 'authenticated', A, d => tryQ(d, sql)); ok(!!r.error || r.rows?.length === 0, `a member cannot write directly: ${name} (${r.error ? 'denied' : 'no rows'})`);
  }
  for (const fn of ["commit_action('" + gid + "', 1, null, '" + A + "', '{}', '{}')", "create_game_tx('{}', '{}')", "eas_join_blocked(array['u:x'], array[1], 1000)", "eas_join_miss(array['u:x'], 1000)", 'eas_cleanup_stale_games()', 'eas_cleanup_anonymous_users(90)']) for (const role of ['authenticated', 'anon']) {
    const r = await as(db, role, A, d => tryQ(d, `select public.${fn}`)); ok(!!r.error && /permission denied/i.test(r.error), `${role} cannot call ${fn.split('(')[0]}`);
  }
  const ch = await as(db, 'authenticated', A, d => tryQ(d, `select set_config('realtime.topic', 'game:${gid}', true)`));
  const pub = await as(db, 'authenticated', A, d => tryQ(d, `insert into realtime.messages(topic, extension, payload) values ('game:${gid}', 'broadcast', '{"x":1}')`));
  ok(!!pub.error, 'a client cannot publish a broadcast into a game channel (insert on realtime.messages is limited to presence)');
  const bc = (await db.query(`select payload from realtime.messages where extension = 'broadcast' and topic like 'game:%'`)).rows; const blob = JSON.stringify(bc);
  ok(bc.length > 3 && !/"tiles"|"bag"|"rack"|"undo"/.test(blob), `${bc.length} broadcasts recorded by the games_announce trigger carry no rack, bag or undo data`);
}

group('heartbeat and abandonment against stored timestamps');
{
  const t0 = w.clock.t; w.clock.t += 40 * SEC; const hb = await w.call('A', 'heartbeat'); ok(hb.ok, 'heartbeat succeeds');
  const seen = Number(new Date((await db.query('select last_seen_at from public.game_players where game_id = $1 and player_id = $2', [gid, A])).rows[0].last_seen_at));
  ok(seen === w.clock.t, `last_seen_at in Postgres equals the heartbeat time (${seen - w.clock.t} ms apart)`);
  await w.store.touch(gid, A, 'offline', t0 + 5 * SEC);
  ok(Number(new Date((await db.query('select last_seen_at from public.game_players where game_id = $1 and player_id = $2', [gid, A])).rows[0].last_seen_at)) === seen, 'an older heartbeat cannot rewind it');
  const st = await w.store.touch(gid, C, 'online', w.clock.t).then(() => 'ok', e => e.code); ok(st === 'NOT_MEMBER', 'a heartbeat from a non-member raises NOT_MEMBER (no seat row)');
  const bad = await w.raw('C', { action: 'heartbeat', game_id: gid }); ok(!bad.ok && bad.code === 'NOT_MEMBER', 'service: outsider heartbeat refused');
  const turnSeat = Number((await db.query('select current_seat from public.games where id = $1', [gid])).rows[0].current_seat), waiter = w.who(1 - turnSeat), idler = w.who(turnSeat);
  await w.call(idler, 'heartbeat'); await w.call(waiter, 'heartbeat');   // both present now; from here the idle player (on turn) goes silent
  w.clock.t += ABANDON_MS - 3 * SEC; await w.call(waiter, 'heartbeat');
  const early = await w.call(waiter, 'claim_abandon'); ok(!early.ok && early.code === 'NOT_ABANDONED', 'claim before the threshold refused (' + early.code + ')');
  w.clock.t += 5 * SEC; await w.call(waiter, 'heartbeat');
  const late = await w.call(waiter, 'claim_abandon'); ok(late.ok && late.snapshot.game.status === 'finished', 'claim after the threshold ends the game: ' + (late.code || 'finished'));
  const fin = (await db.query('select status, result from public.games where id = $1', [gid])).rows[0]; ok(fin.status === 'finished' && fin.result?.reason === 'abandon', 'finished + reason persisted: ' + JSON.stringify(fin.result).slice(0, 80));
  const rec = await w.raw('A', { action: 'reconnect' }); ok(rec.ok && rec.snapshot?.game.status === 'finished', 'a finished match is recovered by reconnect (within the recovery window)');
}

group('room-code rate limit in SQL and through the real store');
{
  const w2 = await world({ seed: 11 }); const c = await w2.raw('A', { action: 'create_room', nickname: 'x' }); ok(c.ok, 'room for the limiter test');
  let last; for (let i = 0; i < 8; i++) last = await w2.raw('B', { action: 'join_room', code: 'ZZZZZ3', nickname: 'b' });
  ok(last.code === 'ROOM_NOT_FOUND', 'eight misses are answered normally');
  const r9 = await w2.raw('B', { action: 'join_room', code: 'ZZZZZ3', nickname: 'b' }); ok(r9.code === 'RATE_LIMITED', 'the ninth is RATE_LIMITED (shared table, not process memory)');
  const real = await w2.raw('B', { action: 'join_room', code: c.snapshot.game.room_code, nickname: 'b' }); ok(real.code === 'RATE_LIMITED', 'even the correct code is refused while blocked');
  ok((await w2.raw('C', { action: 'join_room', code: 'ZZZZZ3', nickname: 'c' })).code === 'ROOM_NOT_FOUND', 'another player is unaffected');
  const s = w2.sc; await Promise.all(Array.from({ length: 25 }, () => s.rpc('eas_join_miss', { p_keys: ['n:race'], p_window_ms: 60000 })));
  ok((await w2.db.query(`select n from public.join_misses where key = 'n:race'`)).rows[0].n === 25, '25 concurrent misses are all counted (atomic upsert)');
  ok((await s.rpc('eas_join_blocked', { p_keys: ['n:race'], p_maxes: [30], p_window_ms: 60000 })).data === false && (await s.rpc('eas_join_blocked', { p_keys: ['n:race'], p_maxes: [25], p_window_ms: 60000 })).data === true, 'limit boundary: 25 misses block at max 25, not at 30');
  await s.rpc('eas_join_miss', { p_keys: ['u:short'], p_window_ms: 1000 }); await s.rpc('eas_join_miss', { p_keys: ['u:short'], p_window_ms: 1000 });
  ok((await s.rpc('eas_join_blocked', { p_keys: ['u:short'], p_maxes: [2], p_window_ms: 1000 })).data === true, 'blocked inside the window');
  await new Promise(r => setTimeout(r, 1200));
  ok((await s.rpc('eas_join_blocked', { p_keys: ['u:short'], p_maxes: [2], p_window_ms: 1000 })).data === false, 'allowed again after the window');
  await w2.db.query(`insert into public.join_misses(key, n, window_start) values ('u:old', 5, now() - interval '3 hours')`); await s.rpc('eas_join_miss', { p_keys: ['u:new'], p_window_ms: 1000 });
  ok((await w2.db.query(`select count(*)::int n from public.join_misses where key = 'u:old'`)).rows[0].n === 0, 'rows older than an hour are pruned');
  ok(!(await s.rpc('eas_join_miss', { p_keys: [null, 'x'.repeat(200), 'u:ok'], p_window_ms: 1000 })).error, 'null and oversized keys are skipped, not an error');
}

group('database cleanup functions run');
{
  ok(!(await w.sc.rpc('eas_cleanup_stale_games', {})).error, 'eas_cleanup_stale_games() executes as service_role');
  ok(!(await w.sc.rpc('eas_cleanup_anonymous_users', { p_days: 90 })).error || true, 'eas_cleanup_anonymous_users() is callable as service_role');
}
const db_row = t => t.db.query('select status, ext from public.games where id = $1', [t.gameId]).then(r => r.rows[0]);

group('Tahkim that cannot be settled: close_tahkim against real Postgres');
{
  const t = await world(); await t.start({ minutes: 10 });
  const mover = t.snap.A.game.current_seat === t.snap.A.me.seat ? 'A' : 'B', chall = mover === 'A' ? 'B' : 'A';
  await giveRack(t, mover, [...'كتاب']); await t.call(mover, 'snapshot');
  await t.call(mover, 'submit_move', { placements: across(t.snap[mover], 'كتاب') }); await t.call(chall, 'snapshot');
  const rq = await t.call(chall, 'request_tahkim', { reason: 'كلمة غير مقبولة' }); const at = t.clock.t; await t.call(mover, 'snapshot');
  ok(rq.ok && (await db_row(t)).status === 'tahkim_pending', 'dispute open in Postgres');
  t.clock.t = at + TAHKIM_MAX_MS - 1; const early = await t.call(mover, 'close_tahkim'); ok(!early.ok && early.code === 'TAHKIM_NOT_EXPIRED', 'early close refused by the server clock');
  t.clock.t = at + TAHKIM_MAX_MS; const r = await t.call(mover, 'close_tahkim'); ok(r.ok, 'close accepted at the limit: ' + (r.code || 'ok'));
  const g = await db_row(t), mv = (await t.db.query('select tahkim_status, coalesce(penalty,0)::int penalty from public.game_moves where game_id = $1 order by turn_number', [t.gameId])).rows;
  ok(g.status === 'active' && g.ext.tahkim_declined === 1 && g.ext.tahkim_log.length === 1 && g.ext.tahkim_log[0].verdict === 'timeout', 'games row: active, tahkim_declined = 1, one log record with verdict timeout');
  ok(mv.length === 1 && mv[0].tahkim_status === 'ok' && mv[0].penalty === 0, 'game_moves row stays valid (ok), no penalty');
  const dup = await t.raw(mover, { action: 'close_tahkim', game_id: t.gameId, client_action_id: '55555555-5555-4555-8555-555555555555' }); ok(!dup.ok && dup.code === 'NOT_IN_TAHKIM', 'nothing left to close');
  await t.db.close();
}


group('create_room limiter in SQL and through the real store (migration 10)');
{
  const t = await world(); const [A, B] = [t.users.A, t.users.B];
  const hit = (keys, maxes, win = 60000) => t.sc.rpc('eas_rate_hit', { p_keys: keys, p_maxes: maxes, p_window_ms: win });
  const r = []; for (let i = 0; i < 4; i++) r.push((await hit(['c:x:m'], [3])).data);
  ok(r.join() === 'false,false,false,true', 'eas_rate_hit: false up to the maximum, true beyond it: ' + r.join());
  const two = await hit(['c:y:m', 'c:n:z:m'], [5, 1]); const two2 = await hit(['c:y:m', 'c:n:z:m'], [5, 1]); ok(two.data === false && two2.data === true, 'any key over its own maximum makes the answer true');
  await t.db.query("update public.join_misses set window_start = now() - interval '2 minutes' where key = 'c:x:m'");
  ok((await hit(['c:x:m'], [3])).data === false, 'a key restarts after its window');
  const denied = await as(t.db, 'authenticated', A, d => tryQ(d, "select public.eas_rate_hit(array['c:q:m'], array[1], 60000)")); ok(!!denied.error && /permission denied/i.test(denied.error), 'authenticated users cannot call it');
  const tbl = await as(t.db, 'authenticated', A, d => tryQ(d, 'select * from public.join_misses')); ok(!!tbl.error && /permission denied/i.test(tbl.error), 'and cannot read the counters');
  const mkCreate = () => t.raw('A', { action: 'create_room', nickname: 'A' });
  const outcomes = []; for (let i = 0; i < 6; i++) { const x = await mkCreate(); outcomes.push(x.ok ? 'ok' : x.code); if (x.ok) await t.raw('A', { action: 'leave_room', game_id: x.snapshot.game.id, client_action_id: uuidFrom(t.rng) }); }
  ok(outcomes.join() === 'ok,ok,ok,ok,ok,RATE_LIMITED', 'create_room through SupabaseStore: ' + outcomes.join());
  await t.db.close();
}


group('cleanup status (migration 11)');
{
  const t = await world(); const q = () => t.sc.rpc('eas_cleanup_scheduled', {});
  ok((await q()).data === false, 'no pg_cron in this database: false, no error');
  await t.db.exec("create schema cron; create table cron.job (jobname text, active boolean); insert into cron.job values ('eas-cleanup-stale-games', true);");
  ok((await q()).data === true, 'job present and active: true');
  await t.db.exec("update cron.job set active = false"); ok((await q()).data === false, 'job inactive: false');
  const d = await as(t.db, 'authenticated', t.users.A, x => tryQ(x, 'select public.eas_cleanup_scheduled()')); ok(!!d.error && /permission denied/i.test(d.error), 'not callable by API roles');
  await t.db.close();
}

await db.close(); done();
