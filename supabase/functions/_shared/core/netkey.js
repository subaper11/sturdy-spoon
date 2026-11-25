// Opaque network key for the room-guess limiter: a keyed hash of the caller's address, never the address itself.
// Only the header the platform sets is trusted (TRUSTED_IP_HEADER, default cf-connecting-ip); the LAST value is used because proxies append, while
// anything before it is client-supplied and spoofable. No header, or an unusable value -> null: the limiter then relies on the per-user key alone.
export async function netKey(headers, headerName, salt) {
  const raw = headers.get(headerName); if (!raw || !salt) return null;
  const ip = raw.split(',').pop().trim(); if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(salt), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip)));
  return Array.from(mac.slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');   // 32 hex chars
}
