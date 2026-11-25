// Bounded JSON body reader. A legitimate request is a few hundred bytes (a move is ~1 KB); anything larger is refused before it is parsed or buffered whole.
export const MAX_BODY_BYTES = 16 * 1024;
// -> { body } | { status, code }   (413 too large, 400 not JSON / not an object)
export async function readJsonLimited(req, max = MAX_BODY_BYTES) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > max) return { status: 413, code: 'BAD_REQUEST' };
  const reader = req.body?.getReader(); if (!reader) return { status: 400, code: 'BAD_REQUEST' };
  const chunks = []; let n = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > max) { reader.cancel().catch(() => {}); return { status: 413, code: 'BAD_REQUEST' }; } chunks.push(value); }   // counts real bytes: content-length can lie or be absent (chunked)
  const buf = new Uint8Array(n); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  try { const body = JSON.parse(new TextDecoder().decode(buf)); if (!body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, code: 'BAD_REQUEST' }; return { body }; }
  catch { return { status: 400, code: 'BAD_REQUEST' }; }
}
