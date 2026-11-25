// Local verification of a Supabase user access token (JWT), so the Edge Function does not call Auth (getUser) on every request.
// Pure: keys, time and the expected issuer come in as arguments; only WebCrypto is used (the same API in Deno and Node).
// Accepts asymmetric project keys (ES256, RS256) published as a JWKS. HS256 (legacy shared secret) is not verified here: the caller falls back to getUser.
// Rejects: unsigned or unknown-alg tokens, alg/key mismatch, bad signature, expired or not-yet-valid tokens, a wrong issuer or audience,
// the project's anon/service keys (role anon / service_role: they carry no user) and anything whose subject is not a UUID.
const b64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const json = s => JSON.parse(new TextDecoder().decode(b64(s)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALGS = { ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256', verify: { name: 'ECDSA', hash: 'SHA-256' } }, RS256: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', verify: { name: 'RSASSA-PKCS1-v1_5' } } };
const cache = new WeakMap();   // jwk object -> imported CryptoKey

async function keyFor(jwk, alg) {
  if (!cache.has(jwk)) { const a = ALGS[alg], p = a.namedCurve ? { name: a.name, namedCurve: a.namedCurve } : { name: a.name, hash: a.hash }; cache.set(jwk, crypto.subtle.importKey('jwk', jwk, p, false, ['verify'])); }
  return cache.get(jwk);
}

// -> { ok: true, sub, claims } | { ok: false, reason, retryKeys? }.  retryKeys: the kid is unknown to this key set, so refreshing the JWKS may help.
export async function verifyAccessToken(token, { keys, now, issuer, audience = 'authenticated' }) {
  const bad = (reason, extra = {}) => ({ ok: false, reason, ...extra });
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some(p => !p)) return bad('malformed');
  let header, claims;
  try { header = json(parts[0]); claims = json(parts[1]); } catch { return bad('malformed'); }
  if (!header || typeof header !== 'object' || !claims || typeof claims !== 'object') return bad('malformed');
  const alg = header.alg;
  if (!ALGS[alg]) return bad('alg');                                   // none, HS256, anything else: not verified locally
  const list = (keys || []).filter(k => k && (!k.alg || k.alg === alg) && (k.use || 'sig') === 'sig');
  const jwk = header.kid ? list.find(k => k.kid === header.kid) : (list.length === 1 ? list[0] : null);
  if (!jwk) return bad('kid', { retryKeys: true });
  let valid = false;
  try { valid = await crypto.subtle.verify(ALGS[alg].verify, await keyFor(jwk, alg), b64(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])); } catch { return bad('key'); }
  if (!valid) return bad('signature');
  const t = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= t) return bad('expired');
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > t)) return bad('not_yet');
  if (claims.iss !== issuer) return bad('issuer');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(audience)) return bad('audience');
  if (claims.role !== 'authenticated') return bad('role');             // anon key / service key
  if (typeof claims.sub !== 'string' || !UUID.test(claims.sub)) return bad('subject');
  return { ok: true, sub: claims.sub.toLowerCase(), claims };
}

// JWKS cache with a small refresh budget (an attacker sending random kids must not make us fetch on every request).
export function makeKeyring(fetchKeys, { ttlMs = 10 * 60 * 1000, minRetryMs = 30 * 1000 } = {}) {
  let keys = null, at = 0, tried = 0;
  const load = async (now) => { tried = now; try { const k = await fetchKeys(); if (Array.isArray(k)) { keys = k; at = now; } } catch { /* keep the old set */ } };
  return {
    async get(now) { if (!keys || now - at > ttlMs) await load(now); return keys || []; },
    async refresh(now) { if (now - tried >= minRetryMs) await load(now); return keys || []; }
  };
}
