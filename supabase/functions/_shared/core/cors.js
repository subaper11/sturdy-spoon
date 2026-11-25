// Origin allowlist for the Edge Function. Pure (no Deno APIs) so Node tests exercise the real code. Fails closed:
// no ALLOWED_ORIGIN = the function refuses to start, and "*" is only accepted when EAS_DEV_CORS=1 (local development).
export function parseOrigins(raw, dev = false) {
  const list = String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) throw new Error('ALLOWED_ORIGIN is not set: set it to the exact site origin(s), comma-separated (e.g. https://my-game.vercel.app). For local development set EAS_DEV_CORS=1.');
  const out = new Set();
  for (const o of list) {
    if (o === '*') { if (!dev) throw new Error('ALLOWED_ORIGIN="*" is refused outside local development (EAS_DEV_CORS=1).'); out.add('*'); continue; }
    let u; try { u = new URL(o); } catch { throw new Error(`ALLOWED_ORIGIN entry is not a valid origin: ${o}`); }
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new Error(`ALLOWED_ORIGIN entry must be http(s)://host[:port]: ${o}`);
    out.add(u.origin);   // normalised: lower-case host, no trailing slash, no default port
  }
  return out;
}
// -> { allowed, headers }. A request with an Origin that is not on the list gets NO Access-Control-Allow-Origin and must be refused (403).
// A request without an Origin header is not a browser cross-origin call; it still needs a valid user JWT, which index.ts checks.
export function corsFor(allowed, origin) {
  const base = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600', 'Vary': 'Origin' };
  if (!origin) return { allowed: true, headers: base };
  let o = ''; try { o = new URL(origin).origin; } catch { /* malformed Origin: refused below */ }
  const ok = !!o && (allowed.has('*') || allowed.has(o));
  return { allowed: ok, headers: ok ? { ...base, 'Access-Control-Allow-Origin': allowed.has('*') ? '*' : o } : base };
}
