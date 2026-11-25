// OPTIONAL Cloudflare Turnstile for anonymous sign-in. Off unless the build has TURNSTILE_SITE_KEY (a PUBLIC site key); without it nothing here runs
// and sign-in is exactly what it was. Supabase must have the matching secret under Authentication -> Attack Protection (docs/DEPLOYMENT.md).
const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;
const load = () => loading ||= new Promise((res, rej) => {
  if (window.turnstile) return res(window.turnstile);
  const s = Object.assign(document.createElement('script'), { src: SRC, async: true });
  s.onload = () => window.turnstile ? res(window.turnstile) : rej(new Error('turnstile missing'));
  s.onerror = () => { loading = null; rej(new Error('turnstile load failed')); };
  document.head.append(s);
});
// Resolves with a one-use token. The widget sits in a small fixed box only while a challenge is shown; it is removed afterwards.
export async function captchaToken(siteKey, timeoutMs = 60000) {
  const ts = await load();
  const box = Object.assign(document.createElement('div'), { className: 'captchaBox' });
  box.style.cssText = 'position:fixed;inset:auto 0 12px 0;display:flex;justify-content:center;z-index:99999';
  document.body.append(box);
  try {
    return await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('captcha timeout')), timeoutMs);
      ts.render(box, { sitekey: siteKey, callback: tok => { clearTimeout(t); res(tok); }, 'error-callback': () => { clearTimeout(t); rej(new Error('captcha error')); }, 'expired-callback': () => {} });
    });
  } finally { box.remove(); }
}
