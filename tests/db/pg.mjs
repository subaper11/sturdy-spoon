// Real Postgres for tests (PGlite = Postgres compiled to WASM, runs the same on Windows / macOS / Linux, no install, no Docker).
// It is NOT the Supabase platform: auth.uid(), the three API roles and realtime.messages are minimal stand-ins (below) for what Supabase provides.
// Everything else (every migration, RLS, grants, SECURITY DEFINER functions, triggers, constraints, transactions) is the real thing executing the real SQL files.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { PGlite } from '@electric-sql/pglite'; import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
export const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations');
export const migrationFiles = () => fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

// What a Supabase project already has before any migration runs: API roles, auth.users / auth.uid(), realtime.messages, and the DEFAULT PRIVILEGES that make every new
// public table/function reachable by anon + authenticated (so the migrations' own revokes and RLS are what protect the data, exactly as on Supabase).
const STUBS = `
 create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
 grant usage on schema public to anon, authenticated, service_role;
 alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
 alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
 alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
 create schema auth; grant usage on schema auth to anon, authenticated, service_role;
 create table auth.users (id uuid primary key, is_anonymous boolean not null default true, created_at timestamptz not null default now(), last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 grant execute on function auth.uid() to anon, authenticated, service_role;
 create schema realtime; grant usage on schema realtime to anon, authenticated;
 create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb); alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
 grant select, insert on realtime.messages to authenticated; grant execute on function realtime.topic() to authenticated;
 create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages(topic, extension, payload) values (topic, 'broadcast', payload) $$;   -- records what the games_announce trigger broadcasts
 create schema extensions;`;

export async function freshDb({ upTo = Infinity } = {}) {
  const db = new PGlite({ extensions: { pgcrypto } }); await db.exec(STUBS);
  for (const f of migrationFiles().slice(0, upTo)) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  return db;
}
export const applyFile = (db, name) => db.exec(fs.readFileSync(path.join(MIGRATIONS, name), 'utf8'));

// Run fn as an API role, the way PostgREST does: SET ROLE + the JWT subject claim. PGlite has one session, so calls are serialised and the role is always reset.
export async function as(db, role, uid, fn) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try { return await fn(db); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
export const tryQ = async (db, sql, params) => { try { return { rows: (await db.query(sql, params)).rows, error: null }; } catch (e) { return { rows: null, error: e.message }; } };

// supabase-js look-alike for exactly the query-builder subset supabase/functions/eas-game/store.ts uses, executing as service_role (like the Edge Function).
const norm = v => v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v;
const normRow = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, norm(v)]));
export function serviceClient(db) {
  const run = async (sql, params) => { await db.exec('set role service_role'); try { return await db.query(sql, params); } finally { await db.exec('reset role'); } };
  const builder = table => {
    const st = { table, cols: '*', where: [], params: [], order: null, upd: null, ret: null, single: false };
    const b = {
      select(cols) { if (st.upd) st.ret = cols; else st.cols = cols; return b; },
      update(vals) { st.upd = vals; return b; },
      eq(c, v) { st.params.push(v); st.where.push(`${c} = $${st.params.length}`); return b; },
      lte(c, v) { st.params.push(v); st.where.push(`${c} <= $${st.params.length}`); return b; },
      order(c) { st.order = c; return b; },
      maybeSingle() { st.single = true; return b; },
      then(res, rej) { return exec().then(res, rej); }
    };
    const exec = async () => {
      try {
        if (/games!inner/.test(st.cols)) {   // findOpenGameId: game_players joined to its game
          const r = await run(`select gp.game_id, to_jsonb(g) as games from public.game_players gp join public.games g on g.id = gp.game_id where ${st.where.join(' and ')}`, st.params);
          return { data: r.rows.map(x => ({ game_id: x.game_id, games: x.games })), error: null };
        }
        let sql, params = st.params;
        if (st.upd) {
          const keys = Object.keys(st.upd), set = keys.map((k, i) => `${k} = $${st.params.length + i + 1}`).join(', '); params = [...st.params, ...keys.map(k => st.upd[k])];
          sql = `update public.${st.table} set ${set} where ${st.where.join(' and ')}${st.ret ? ` returning ${st.ret}` : ''}`;
        } else sql = `select ${st.cols} from public.${st.table}${st.where.length ? ' where ' + st.where.join(' and ') : ''}${st.order ? ' order by ' + st.order : ''}`;
        const r = await run(sql, params); const rows = r.rows.map(normRow);
        if (st.single) { if (rows.length > 1) return { data: null, error: { message: 'multiple rows' } }; return { data: rows[0] ?? null, error: null }; }
        return { data: st.upd && !st.ret ? null : rows, error: null };
      } catch (e) { return { data: null, error: { message: e.message } }; }
    };
    return b;
  };
  return {
    from: builder,
    async rpc(fn, args) {
      const keys = Object.keys(args);
      try { const r = await run(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map(k => args[k])); return { data: norm(r.rows[0].r) ?? null, error: null }; }
      catch (e) { return { data: null, error: { message: e.message } }; }
    }
  };
}
