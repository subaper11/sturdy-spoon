// Supabase Edge Function `eas-game`: the single authoritative entry point for online Arabic Scrabble.
//   POST { action, ...payload }   Authorization: Bearer <user JWT (anonymous sign-in is fine)>
// It authenticates the caller, then hands everything to the PURE core in ../_shared/core (unit-tested in Node), which uses the SAME
// rules, scoring and end-of-game settlement as the local game (mirrored from /js by tools/sync-edge-shared.mjs). There is no dictionary: Tahkim judges words.
// The service-role key lives only here (it is injected by Supabase); it never reaches a browser.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleRequest } from '../_shared/core/service.js';
import { parseOrigins, corsFor } from '../_shared/core/cors.js';
import { netKey } from '../_shared/core/netkey.js';
import { readJsonLimited } from '../_shared/core/body.js';
import { SupabaseStore } from './store.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// ALLOWED_ORIGIN (required): the exact site origin(s), comma-separated, e.g. https://my-game.vercel.app,https://game.example.com. Unset = the function refuses to start (fail closed).
// Local development only: EAS_DEV_CORS=1 additionally allows '*'. See _shared/core/cors.js.
const ALLOWED = parseOrigins(Deno.env.get('ALLOWED_ORIGIN'), Deno.env.get('EAS_DEV_CORS') === '1');

// Room-guess limiter network key: header named by TRUSTED_IP_HEADER (default cf-connecting-ip), hashed with RATE_LIMIT_SALT (falls back to the service key; never logged).
const NET_HEADER = (Deno.env.get('TRUSTED_IP_HEADER') || 'cf-connecting-ip').toLowerCase(), NET_SALT = Deno.env.get('RATE_LIMIT_SALT') || SERVICE_KEY;

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const store = new SupabaseStore(db);

const deps = {
  now: () => Date.now(),
  rng: () => { const a = new Uint32Array(2); crypto.getRandomValues(a); return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53; },   // 53 random bits, uniform in [0,1)
  uuid: () => crypto.randomUUID(),
  // Structured logs. Never rack contents, bag order, tokens or keys.
  log: (evt: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ ts: new Date().toISOString(), evt, ...fields }))
};

Deno.serve(async (req) => {
  const { allowed, headers: cors } = corsFor(ALLOWED, req.headers.get('Origin'));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (!allowed) return json({ ok: false, code: 'BAD_REQUEST', message: 'Origin not allowed.' }, 403);   // before auth, body parsing or any database access
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, code: 'BAD_REQUEST', message: 'POST only.' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, code: 'NOT_MEMBER', message: 'الجلسة منتهية. أعد تحميل الصفحة.' }, 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return json({ ok: false, code: 'NOT_MEMBER', message: 'الجلسة منتهية. أعد تحميل الصفحة.' }, 401);
  const read = await readJsonLimited(req);   // at most 16 KB, a JSON object
  if (!read.body) return json({ ok: false, code: 'BAD_REQUEST', message: read.status === 413 ? 'الطلب كبير جدًا.' : 'طلب غير صالح.' }, read.status);
  const body = read.body;
  // Domain errors are normal answers (HTTP 200 + ok:false): the browser never has to parse a platform error page.
  return json(await handleRequest(store, data.user.id, body, { ...deps, netKey: await netKey(req.headers, NET_HEADER, NET_SALT) }));
});
