// Adaptive fit of the default layouts: the free room on tall phones, tablets and big monitors is used instead of left empty.
//   portrait (phones, portrait tablets): everything under the board (panels, racks, dock, gaps) grows by one factor, the largest that still fits the screen (--fill, at most FMAX);
//     what is left after that is split above and below.
//   wide (desktop / 16:9, >= 1000 px): the board is no longer capped at 880 px (css/style.css) and the players + dock column grows with the screen height (--fill) and is centred beside the board.
// Floating Workspace and the short landscape layouts are not touched (data-fit stays off). css/fit.css reads --fill under html[data-fit].
import { $ } from './state.js';

const root = document.documentElement, FMAX = 1.5;
let raf = 0, applied = '';

function mode() {
  if (root.dataset.floating === 'true' || root.dataset.layout === 'duel') return null;   // the Duel layout has its own arrangement (side-by-side panels): not touched
  if (matchMedia('(min-width: 1000px) and (min-height: 560px)').matches) return 'wide';
  if (matchMedia('(max-width: 999px) and (orientation: portrait)').matches) return 'portrait';
  return null;
}
function apply(m, f) {
  const key = m ? m + f.toFixed(3) : '';
  if (key === applied) return; applied = key;
  if (!m) { root.removeAttribute('data-fit'); root.style.removeProperty('--fill'); return; }
  root.dataset.fit = m; root.style.setProperty('--fill', f.toFixed(3));
}
function fit() {
  raf = 0;
  const m = mode(), app = $('.app'); if (!m || !app) return apply(null);
  if (m === 'wide') return apply('wide', Math.max(1, Math.min(FMAX, (innerHeight - 97) / 700)));
  // portrait: the largest factor that still fits (the content height is monotonic in it)
  const cs = getComputedStyle(document.body), padB = parseFloat(cs.paddingBottom) || 0;
  const room = () => app.offsetTop + app.offsetHeight + padB <= innerHeight - 1;
  root.dataset.fit = 'portrait'; applied = '';
  const test = f => { root.style.setProperty('--fill', f.toFixed(3)); return room(); };
  let lo = 1, hi = FMAX;
  if (test(hi)) lo = hi;
  else { for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (test(mid)) lo = mid; else hi = mid; } }
  if (lo === 1 && !test(1)) { root.removeAttribute('data-fit'); root.style.removeProperty('--fill'); applied = ''; return; }   // it does not even fit as it is (short phones): leave the layout exactly as designed
  root.style.setProperty('--fill', lo.toFixed(3)); applied = 'portrait' + lo.toFixed(3);
}
export const refit = () => { if (!raf) raf = requestAnimationFrame(fit); };

export function initFit() {
  if (typeof matchMedia !== 'function' || typeof requestAnimationFrame !== 'function' || typeof innerHeight === 'undefined') return;   // not a real browser (the test harness)
  addEventListener('resize', refit); addEventListener('orientationchange', refit);
  if (window.visualViewport) visualViewport.addEventListener('resize', refit);
  new MutationObserver(refit).observe(root, { attributes: true, attributeFilter: ['data-layout', 'data-floating', 'data-binfo', 'data-hist', 'data-lang', 'data-theme', 'data-online', 'data-swap'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe($('.app'));
  refit();
}
