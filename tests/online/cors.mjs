// Production CORS: fail closed, exact-origin allowlist, never reflect arbitrary origins.
import { suite } from './lib.mjs';
import fs from 'fs';
import { parseOrigins, corsFor } from '../../supabase/functions/_shared/core/cors.js';
const { ok, group, done } = suite('edge function CORS');
const throws = f => { try { f(); return null; } catch (e) { return e.message; } };

group('configuration is validated at startup');
ok(/not set/.test(throws(() => parseOrigins(undefined))) && /not set/.test(throws(() => parseOrigins('  , '))), 'unset or empty ALLOWED_ORIGIN refuses to start');
ok(/refused/.test(throws(() => parseOrigins('*'))) && /refused/.test(throws(() => parseOrigins('https://a.app, *'))), '"*" is refused in production');
ok(parseOrigins('*', true).has('*'), '"*" only with the explicit local-dev flag');
ok(/not a valid origin/.test(throws(() => parseOrigins('my-game.vercel.app'))) && /http\(s\)/.test(throws(() => parseOrigins('ftp://x.y'))), 'garbage and non-http entries are refused');
ok(/http\(s\)/.test(throws(() => parseOrigins('https://u:p@x.app'))), 'credentials in an origin are refused');
const A = parseOrigins('https://My-Game.vercel.app/, http://localhost:5173 ,https://game.example.com:443');
ok(A.has('https://my-game.vercel.app') && A.has('http://localhost:5173') && A.has('https://game.example.com') && A.size === 3, 'comma list is normalised (case, trailing slash, default port)');

group('request handling');
const h = o => corsFor(A, o);
ok(h('https://my-game.vercel.app').allowed && h('https://my-game.vercel.app').headers['Access-Control-Allow-Origin'] === 'https://my-game.vercel.app', 'allowed origin is echoed exactly (never "*")');
ok(h('https://game.example.com').allowed, 'every listed origin works');
for (const bad of ['https://evil.example', 'https://my-game.vercel.app.evil.example', 'http://my-game.vercel.app', 'https://sub.my-game.vercel.app', 'null', 'not a url', 'https://my-game.vercel.app:8443']) {
  const r = h(bad); ok(!r.allowed && !('Access-Control-Allow-Origin' in r.headers), `refused, no ACAO header: ${bad}`);
}
ok(h('').allowed && !('Access-Control-Allow-Origin' in h('').headers), 'no Origin header (not a browser cross-origin call): passes to authentication, no ACAO');
const hd = h('https://my-game.vercel.app').headers;
ok(/authorization/.test(hd['Access-Control-Allow-Headers']) && /apikey/.test(hd['Access-Control-Allow-Headers']) && /x-client-info/.test(hd['Access-Control-Allow-Headers']) && /content-type/.test(hd['Access-Control-Allow-Headers']), 'Supabase authorization / API headers are still allowed');
ok(hd.Vary === 'Origin' && hd['Access-Control-Allow-Methods'] === 'POST, OPTIONS', 'Vary: Origin; POST and OPTIONS only');
ok(corsFor(parseOrigins('*', true), 'https://anything.example').headers['Access-Control-Allow-Origin'] === '*', 'dev flag allows any origin');

group('wiring in index.ts');
const src = fs.readFileSync(new URL('../../supabase/functions/eas-game/index.ts', import.meta.url), 'utf8');
ok(!/\|\|\s*'\*'/.test(src), "no default to '*' in index.ts");
ok(src.indexOf('if (!allowed)') > 0 && src.indexOf('if (!allowed)') < src.indexOf("req.method === 'OPTIONS'") && src.indexOf("req.method === 'OPTIONS'") < src.indexOf('await userIdOf(token)')   /* authentication moved into userIdOf in 5.12; this is its only call site */, 'an unapproved origin is refused before OPTIONS handling, authentication and any database access');
done();
