// Verdict stamp + the geometry shared by the long-press challenge (js/tkpress.js) and the replay (js/replay.js).
// A history entry says where a move landed either as `tl` (tiles with letters: local games and servers that record them) or as `cells` ([row, col] pairs: older online data).
import { SIZE } from './config.js';
import { haptic } from './haptics.js';

export const positions = e => e.tl ? e.tl.map(x => [x.r, x.c]) : (e.cells || []);

// Every square of the words a move formed: the run through each placed square, horizontally and vertically, when it is two squares or longer.
export function wordCells(board, pos) {
  const set = new Set(), at = (r, c) => r >= 0 && c >= 0 && r < SIZE && c < SIZE && board[r] && board[r][c];
  for (const [r, c] of pos) {
    if (!at(r, c)) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      let a = 0, b = 0;
      while (at(r - dr * (a + 1), c - dc * (a + 1))) a++;
      while (at(r + dr * (b + 1), c + dc * (b + 1))) b++;
      if (a + b < 1) continue;
      for (let k = -a; k <= b; k++) set.add((r + dr * k) * SIZE + c + dc * k);
    }
    if (!set.has(r * SIZE + c)) set.add(r * SIZE + c);
  }
  return set;
}

// A stamp lands on the middle of the given squares (fixed to the viewport, so it follows the board wherever it is: scaled, floating, inside the replay).
export function stampOver(els, kind) {
  els = els.filter(Boolean); if (!els.length) return;
  const rs = els.map(e => e.getBoundingClientRect()), l = Math.min(...rs.map(r => r.left)), r = Math.max(...rs.map(r => r.right)), t = Math.min(...rs.map(r => r.top)), b = Math.max(...rs.map(r => r.bottom));
  const d = document.createElement('div'); d.className = 'tkStamp ' + kind; d.setAttribute('aria-hidden', 'true');
  d.textContent = kind === 'ok' ? 'صحيح' : 'خطأ';
  d.style.left = (l + r) / 2 + 'px'; d.style.top = (t + b) / 2 + 'px';
  d.style.setProperty('--fs', Math.max(32, Math.min(60, (r - l) * 0.55 + 12)) + 'px');
  document.body.append(d); haptic(kind === 'ok' ? 'score' : 'tick');
  setTimeout(() => d.classList.add('out'), 1700); setTimeout(() => d.remove(), 2200);
}
// A verdict has just been applied to history entry e: stamp it on the board (a tick later, once the board has been redrawn).
export function stampWord(e, kind, board = document.getElementById('board')) {
  setTimeout(() => { if (board) stampOver(positions(e).map(([r, c]) => board.children[r * SIZE + c]), kind); }, 70);
}
