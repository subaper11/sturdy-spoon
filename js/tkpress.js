// Tahkim by press-and-hold. The words of the opponent's last move wear a thin accent underline while they can be challenged; holding one fills a ring
// around them and, when it is full, opens the usual Tahkim flow (the hidden #bJudge keeps the one rule for whether a challenge is allowed: its own disabled state).
// Mouse: hold the button, or right-click for a one-item menu. Keyboard: hold Enter or Space on a marked square. History: a small button on the last move.
import { SIZE } from './config.js';
import { $, S } from './state.js';
import { haptic } from './haptics.js';
import { L3 } from './i18n.js';
import { positions, wordCells } from './stamp.js';

const HOLD = 700, MOVE_SLOP = 12, TOUCH_SLOP = 22, HINT_KEY = 'eas.tkHint';
const tip = () => L3('اضغط مطوّلًا لتحكيم هذه الكلمة', 'Tahan untuk menantang kata ini (Tahkim)', 'Hold to challenge this word');
let press = null, menu = null, lastType = 'mouse', skipClick = false;
const hasHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

// Called after every render (js/ui.js). Returns true once, the first time a challenge becomes possible: the caller shows a one-line hint.
export function markTahkim() {
  const b = $('#bJudge'), board = $('#board'), e = S.hist[S.hist.length - 1];
  const on = !!(b && board && !b.disabled && !S.ended && e && e.type === 'move' && !e.st);
  const set = on ? wordCells(S.board, positions(e)) : new Set();
  for (let i = 0; i < board.children.length; i++) {
    const el = board.children[i], f = set.has(i);
    if (el.classList.contains('tkq') !== f) { el.classList.toggle('tkq', f); if (f && hasHover()) el.title = tip(); else el.removeAttribute('title'); }   // a tooltip only where there is a hover: on Samsung Internet a long press shows it and steals the gesture
  }
  const v = on ? '1' : '', root = document.documentElement;
  if ((root.dataset.tkq || '') !== v) { if (v) root.dataset.tkq = v; else delete root.dataset.tkq; }
  if (on) { try { if (!localStorage.getItem(HINT_KEY)) { localStorage.setItem(HINT_KEY, '1'); return true; } } catch { /* storage refused: no hint */ } }
  return false;
}
export const hintText = () => L3('تحكيم: اضغط مطوّلًا على كلمة الخصم', 'Tahkim: tahan kata lawan untuk menantangnya', 'Tahkim: hold the opponent’s word to challenge it');

function wordsRect() {
  const els = [...$('#board').querySelectorAll('.sq.tkq')]; if (!els.length) return null;
  const rs = els.map(e => e.getBoundingClientRect());
  return { l: Math.min(...rs.map(r => r.left)), t: Math.min(...rs.map(r => r.top)), r: Math.max(...rs.map(r => r.right)), b: Math.max(...rs.map(r => r.bottom)) };
}
function start(x, y) {
  if (press) return;
  const rc = wordsRect(); if (!rc) return;
  const ring = document.createElement('div'); ring.className = 'tkRing'; ring.setAttribute('aria-hidden', 'true');
  ring.style.cssText = `left:${rc.l - 5}px;top:${rc.t - 5}px;width:${rc.r - rc.l + 10}px;height:${rc.b - rc.t + 10}px;--hold:${HOLD}ms`;
  ring.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1.5" y="1.5" width="97" height="97" rx="9" pathLength="100"/></svg>';
  document.body.append(ring);
  press = { x, y, ring, timer: setTimeout(done, HOLD) };
}
function stop() { if (!press) return; clearTimeout(press.timer); press.ring.remove(); press = null; }
function done() {
  if (!press) return;
  stop(); skipClick = true; setTimeout(() => skipClick = false, 400);
  haptic('score'); const b = $('#bJudge'); if (b && !b.disabled) b.click();
}
function closeMenu() { if (menu) { menu.remove(); menu = null; } }

export function initTkPress() {
  const board = $('#board');
  board.addEventListener('pointerdown', e => {
    lastType = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.sq.tkq')) start(e.clientX, e.clientY);
  });
  // A finger wobbles more than a mouse: a wider slop for touch. Only a real end of the touch cancels: NOT scroll or a blur in capture phase (a touch moves focus to the tapped square,
  // which blurs the element that had it; that used to cancel the press at once on phones).
  window.addEventListener('pointermove', e => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > (e.pointerType === 'mouse' ? MOVE_SLOP : TOUCH_SLOP)) stop(); });
  ['pointerup', 'pointercancel', 'blur'].forEach(t => window.addEventListener(t, stop));
  document.addEventListener('visibilitychange', stop);
  board.addEventListener('click', e => { if (skipClick && e.target.closest('.sq.tkq')) { e.stopPropagation(); e.preventDefault(); } }, true);
  // Touch screens raise a context menu on a long press: never on these squares. A mouse's right-click gets the one-item menu instead.
  board.addEventListener('contextmenu', e => {
    if (!e.target.closest('.sq.tkq')) return;
    e.preventDefault();   // never the browser's own menu / selection / "describe" bubble on these squares
    if (lastType !== 'mouse') return;   // a long press on a phone raises this event too, about 0.5 s in: it must not cancel the hold (that was the "nothing happens" on Android)
    stop();
    closeMenu();
    menu = document.createElement('div'); menu.className = 'tkMenu'; menu.setAttribute('role', 'menu');
    menu.style.cssText = `left:${Math.min(e.clientX, innerWidth - 190)}px;top:${Math.min(e.clientY, innerHeight - 60)}px`;
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.className = 'btn';
    b.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M5 21h14M6 7h12M6 7l-3 7a3 3 0 006 0zM18 7l-3 7a3 3 0 006 0z"/></svg><span></span>';
    b.lastChild.textContent = L3('تحدٍّ (تحكيم)', 'Tantang (Tahkim)', 'Challenge (Tahkim)');
    b.onclick = () => { closeMenu(); const j = $('#bJudge'); if (j && !j.disabled) j.click(); };
    menu.append(b); document.body.append(menu); b.focus();
  });
  document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  // Keyboard: hold Enter or Space on a marked square.
  board.addEventListener('keydown', e => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.closest?.('.sq.tkq')) return;
    e.preventDefault(); if (!e.repeat) start(0, 0);
  });
  board.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') stop(); });
  // History: the last move carries a small challenge button (shown only while a challenge is possible).
  document.addEventListener('click', e => { const b = e.target.closest('.hTkBtn'); if (b) { const j = $('#bJudge'); if (j && !j.disabled) j.click(); } });
}
