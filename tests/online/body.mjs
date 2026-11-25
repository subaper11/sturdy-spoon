// Request body limits for the Edge Function.
import { suite } from './lib.mjs'; import fs from 'fs';
import { readJsonLimited, MAX_BODY_BYTES } from '../../supabase/functions/_shared/core/body.js';
const { ok, group, done } = suite('edge function request body limit');
const req = (body, headers = {}) => new Request('http://x/', { method: 'POST', body, headers });
group('readJsonLimited');
ok((await readJsonLimited(req('{"action":"snapshot"}'))).body?.action === 'snapshot', 'a normal request parses');
ok((await readJsonLimited(req('{"a":"' + 'x'.repeat(MAX_BODY_BYTES) + '"}'))).status === 413, 'a body over the limit: 413, never parsed');
ok((await readJsonLimited(req('{"a":1}', { 'content-length': String(MAX_BODY_BYTES + 1) }))).status === 413, 'a declared oversize length is refused up front');
const chunked = new Request('http://x/', { method: 'POST', duplex: 'half', body: new ReadableStream({ start(c) { for (let i = 0; i < 40; i++) c.enqueue(new TextEncoder().encode('y'.repeat(1024))); c.close(); } }) });
ok((await readJsonLimited(chunked)).status === 413, 'a chunked body with no content-length is cut off at the limit');
ok((await readJsonLimited(req('not json'))).status === 400 && (await readJsonLimited(req(''))).status === 400, 'invalid / empty body: 400');
ok((await readJsonLimited(req('[1,2]'))).status === 400 && (await readJsonLimited(req('"s"'))).status === 400 && (await readJsonLimited(req('null'))).status === 400, 'only a JSON object is accepted');
ok((await readJsonLimited(req('{"t":"' + 'م'.repeat(3000) + '"}'))).body?.t.length === 3000, 'multi-byte (Arabic) text counts in bytes and still fits a normal message');
group('wiring');
const src = fs.readFileSync(new URL('../../supabase/functions/eas-game/index.ts', import.meta.url), 'utf8');
ok(!/req\.json\(\)/.test(src) && /readJsonLimited\(req\)/.test(src), 'index.ts no longer calls req.json() directly');
ok(src.indexOf('getUser(token)') < src.indexOf('await readJsonLimited(req)'), 'the body is only read after the caller is authenticated');
done();
