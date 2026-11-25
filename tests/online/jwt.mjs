import { suite } from './lib.mjs';
import fs from 'fs';
import { verifyAccessToken, makeKeyring } from '../../supabase/functions/_shared/core/jwt.js';
const { ok, group, done } = suite('v5.12 local access-token verification (no Auth round trip per request)');
const ISS = 'https://abcdefgh.supabase.co/auth/v1', NOW = 1_800_000_000_000, SUB = '11111111-2222-4333-8444-555555555555';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function keypair(kid, alg = 'ES256') {
  const p = alg === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const kp = await crypto.subtle.generateKey(p, true, ['sign', 'verify']);
  return { kp, jwk: { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid, alg, use: 'sig' }, alg };
}
async function sign(k, claims = {}, headerOver = {}) {
  const h = enc({ alg: k.alg, typ: 'JWT', kid: k.jwk.kid, ...headerOver }), c = enc({ iss: ISS, aud: 'authenticated', role: 'authenticated', sub: SUB, exp: NOW / 1000 + 3600, ...claims });
  const sp = k.alg === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : { name: 'RSASSA-PKCS1-v1_5' };
  const sig = Buffer.from(await crypto.subtle.sign(sp, k.kp.privateKey, new TextEncoder().encode(h + '.' + c))).toString('base64url');
  return `${h}.${c}.${sig}`;
}
const v = (t, keys, over = {}) => verifyAccessToken(t, { keys, now: NOW, issuer: ISS, ...over });
const es = await keypair('k1'), rs = await keypair('k2', 'RS256'), other = await keypair('k1');   // `other` shares the kid with es but is a different key
const keys = [es.jwk, rs.jwk];

group('accepts a genuine user token');
{
  let r = await v(await sign(es), keys); ok(r.ok && r.sub === SUB, 'ES256 user token: ' + (r.reason || 'ok'));
  r = await v(await sign(rs), keys); ok(r.ok && r.sub === SUB, 'RS256 user token');
  r = await v(await sign(es, { aud: ['x', 'authenticated'] }), keys); ok(r.ok, 'audience may be an array containing "authenticated"');
  r = await v(await sign(es, { is_anonymous: true }), keys); ok(r.ok, 'anonymous-sign-in users are users');
}
group('rejects what must never get in');
{
  const rej = async (name, t, reason, o) => { const r = await v(t, o?.keys || keys, o?.over); ok(!r.ok && r.reason === reason, `${name} -> ${reason} (got ${r.ok ? 'ACCEPTED' : r.reason})`); };
  await rej('expired', await sign(es, { exp: NOW / 1000 - 1 }), 'expired');
  await rej('exp exactly now', await sign(es, { exp: NOW / 1000 }), 'expired');
  await rej('no exp', await sign(es, { exp: undefined }), 'expired');
  await rej('exp as a string', await sign(es, { exp: String(NOW / 1000 + 99) }), 'expired');
  await rej('not before', await sign(es, { nbf: NOW / 1000 + 60 }), 'not_yet');
  await rej('wrong issuer', await sign(es, { iss: 'https://evil.supabase.co/auth/v1' }), 'issuer');
  await rej('wrong audience', await sign(es, { aud: 'anon' }), 'audience');
  await rej('anon key (role anon)', await sign(es, { role: 'anon', sub: undefined }), 'role');
  await rej('service key', await sign(es, { role: 'service_role' }), 'role');
  await rej('subject not a uuid', await sign(es, { sub: 'admin' }), 'subject');
  await rej('no subject', await sign(es, { sub: undefined }), 'subject');
  await rej('signed by another key with the same kid', await sign(other), 'signature');
  const t = await sign(es), [h, c, s] = t.split('.'); const forged = enc({ iss: ISS, aud: 'authenticated', role: 'authenticated', sub: '99999999-2222-4333-8444-555555555555', exp: NOW / 1000 + 99 });
  await rej('payload swapped, signature kept', `${h}.${forged}.${s}`, 'signature');
  await rej('alg none', `${enc({ alg: 'none', typ: 'JWT' })}.${c}.`, 'malformed');
  await rej('alg none with a signature part', `${enc({ alg: 'none', kid: 'k1' })}.${c}.${s}`, 'alg');
  await rej('HS256 (legacy secret): not decided locally', `${enc({ alg: 'HS256', typ: 'JWT' })}.${c}.${s}`, 'alg');
  await rej('alg confusion: RS256 header on an ES key', await sign({ ...es, alg: 'ES256' }, {}, { alg: 'RS256' }), 'kid');
  await rej('garbage', 'not.a.jwt', 'malformed'); await rej('two parts', 'a.b', 'malformed'); await rej('empty', '', 'malformed'); await rej('undefined', undefined, 'malformed');
  await rej('empty key set', await sign(es), 'kid', { keys: [] });
  await rej('key marked for encryption, not signing', await sign(es), 'kid', { keys: [{ ...es.jwk, use: 'enc' }] });
}
group('key rotation: unknown kid asks for a refresh, a known one never does');
{
  const unknown = await keypair('k9'); const t = await sign(unknown);
  const r1 = await v(t, keys); ok(!r1.ok && r1.retryKeys === true, 'unknown kid -> retryKeys');
  const r2 = await v(t, [...keys, unknown.jwk]); ok(r2.ok, 'accepted after the key set is refreshed');
  const r3 = await v(await sign(es, { exp: NOW / 1000 - 5 }), keys); ok(!r3.retryKeys, 'an expired token with a known kid does not trigger a refresh');
}
group('keyring: cache and refresh budget');
{
  let calls = 0, fail = false, set = [es.jwk]; const ring = makeKeyring(async () => { calls++; if (fail) throw new Error('down'); return set; }, { ttlMs: 600000, minRetryMs: 30000 });
  await ring.get(0); await ring.get(1000); await ring.get(599000); ok(calls === 1, 'one fetch serves the next ten minutes');
  await ring.get(600001); ok(calls === 2, 'refetch after the ttl');
  for (let i = 0; i < 50; i++) await ring.refresh(600001 + i); ok(calls === 2, 'random unknown kids cannot force a fetch per request (30 s budget)');
  set = [es.jwk, rs.jwk]; const k = await ring.refresh(700000); ok(calls === 3 && k.length === 2, 'a refresh after the budget picks up a rotated key');
  fail = true; const kept = await ring.refresh(800000); ok(kept.length === 2, 'an unreachable JWKS keeps the last good set');
  const empty = makeKeyring(async () => { throw new Error('down'); }); ok((await empty.get(0)).length === 0, 'never loaded: empty set (the caller falls back to getUser)');
}
group('wiring in index.ts');
{
  const src = fs.readFileSync(new URL('../../supabase/functions/eas-game/index.ts', import.meta.url), 'utf8');
  ok(/verifyAccessToken\(token/.test(src) && /async function userIdOf/.test(src), 'requests go through userIdOf (local verification)');
  ok((src.match(/db\.auth\.getUser\(token\)/g) || []).length === 1 && /reason === 'kid' \|\| r\.reason === 'alg' \|\| r\.reason === 'key'/.test(src), 'getUser stays as the fallback, only for what cannot be decided locally');
  ok(/if \(!userId\) return json\(\{ ok: false, code: 'NOT_MEMBER', message: 'الجلسة منتهية\. أعد تحميل الصفحة\.' \}, 401\)/.test(src), 'a refused token is the same 401 body as before');
  ok(src.indexOf('const userId = await userIdOf') < src.indexOf('readJsonLimited(req)'), 'authentication still comes before the body is read');
}
done();
