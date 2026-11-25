// Replay of a finished game: the board is rebuilt move by move from the history (the same record both local and online games keep),
// with a timeline you can drag or play. Tahkim challenges come back as their stamp; the last step shows the settled scores.
// Nothing here touches the game: it draws its own board (same square / tile markup and css as the real one) inside an overlay.
import { SIZE, LAYOUT, GLYPH, FACE, LABEL } from './config.js';
import { tileValue } from './modes.js';
import { $, S, app } from './state.js';
import { nameIso, esc } from './names.js';
import { L3, bt } from './i18n.js';
import { sqHTML } from './ui.js';
import { positions, stampOver } from './stamp.js';
import { haptic } from './haptics.js';

const IC = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>', play: '<path d="M7 4.5v15l12-7.5z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
  prev: '<path d="M17 5v14M15 12L6 5.5v13z"/>', next: '<path d="M7 5v14M9 12l9-6.5v13z"/>'
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const TROPHY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 01-8 0zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M9 20h6M10 17h4"/></svg>';
const SPEEDS = [1, 2, 4];
let R = null;   // the open replay: { steps, n, playing, speed, timer, cells, ... }

// ---------- data ----------
function buildSteps() {
  const steps = [];
  for (const e of S.hist) {
    if (!['move', 'pass', 'swap'].includes(e.type)) continue;
    steps.push({ k: e.type, e });
    if (e.type === 'move' && (e.st === 'ok' || e.st === 'void')) steps.push({ k: e.st, e });
  }
  if (app.lastResult) steps.push({ k: 'end' });
  return steps;
}
// The tiles of a move as objects the board markup understands. Older online data only knows where they landed: the letters come from the final board when they are still there.
const tilesCache = new WeakMap();
function tilesOf(e) {
  if (tilesCache.has(e)) return tilesCache.get(e);
  const out = e.tl ? e.tl.map(x => ({ r: x.r, c: x.c, t: { l: x.l, v: x.v, blank: x.b, as: x.as, flex: x.f, o: e.p } }))
    : positions(e).map(([r, c]) => { const f = S.board[r] && S.board[r][c]; return { r, c, t: f ? { ...f, o: e.p } : { l: '', v: 0, blank: false, as: null, unknown: true, o: e.p } }; });
  tilesCache.set(e, out); return out;
}
function stateAt(n) {
  const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null)), score = [0, 0]; let last = null;
  for (let i = 0; i < n; i++) {
    const s = R.steps[i], e = s.e; last = s;
    if (s.k === 'move') { tilesOf(e).forEach(x => board[x.r][x.c] = x.t); score[e.p] += e.total; }
    else if (s.k === 'void') { tilesOf(e).forEach(x => board[x.r][x.c] = null); score[e.p] -= e.total; }
    else if (s.k === 'ok') score[1 - e.p] -= e.pen || 0;
    else if (s.k === 'end') app.lastResult.rows.forEach((r, p) => score[p] = r.score);
  }
  return { board, score, last };
}

// ---------- markup ----------
function tileMini(t) {
  if (t.unknown) return `<div class="tile" data-o="${t.o}"><b>·</b></div>`;
  const L = t.blank ? (t.as || '') : t.l, v = tileValue(t);
  return `<div class="tile${t.blank ? ' blank' : ''}${t.flex ? ' flex' : ''}" data-o="${t.o}"><b${GLYPH[L] ? ` style="transform:translate(${GLYPH[L][0]}em,${GLYPH[L][1]}em)"` : ''}>${FACE[L] || L}</b><i>${v}</i></div>`;
}
const nm = p => bt(nameIso(p));
function build() {
  const ov = document.createElement('div'); ov.className = 'rpOv'; ov.id = 'rpOv'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', L3('إعادة اللعبة', 'Putar ulang permainan', 'Game replay'));
  ov.innerHTML = `<div class="rpCard">
    <header class="rpTop"><button type="button" class="btn rpX" data-rp="close" aria-label="${L3('إغلاق', 'Tutup', 'Close')}">${ic('x')}</button>
      <div class="rpScores">${[0, 1].map(p => `<div class="rpS" data-p="${p}"><span class="rpName"><bdi>${esc(nm(p))}</bdi></span><b class="rpNum">0</b></div>`).join('')}</div></header>
    <div class="rpBoardWrap"><div class="board rpBoard" id="rpBoard" aria-hidden="true"></div><div class="rpChip" role="status" hidden></div></div>
    <footer class="rpBar">
      <div class="rpScrub"><svg class="rpSpark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path class="a0" d=""/><path class="a1" d=""/><path class="zero" d="M0 20H100"/><path class="line" d=""/></svg>
        <div class="rpTicks" aria-hidden="true">${R.steps.map(s => `<i class="${s.k === 'ok' || s.k === 'void' ? 'tk' : s.k === 'end' ? 'en' : 'p' + s.e.p}"></i>`).join('')}</div>
        <input type="range" class="rpRange" min="0" max="${R.steps.length}" step="1" value="0" aria-label="${L3('خط زمن اللعبة', 'Garis waktu permainan', 'Game timeline')}"></div>
      <div class="rpCtl"><button type="button" class="btn" data-rp="prev" aria-label="${L3('السابق', 'Sebelumnya', 'Previous')}">${ic('prev')}</button>
        <button type="button" class="btn rpPlay" data-rp="play" aria-label="${L3('تشغيل / إيقاف', 'Putar / jeda', 'Play / pause')}">${ic('play')}</button>
        <button type="button" class="btn" data-rp="next" aria-label="${L3('التالي', 'Berikutnya', 'Next')}">${ic('next')}</button>
        <button type="button" class="btn rpSpd" data-rp="speed" aria-label="${L3('السرعة', 'Kecepatan', 'Speed')}">1×</button></div>
    </footer></div>`;
  document.body.append(ov);
  const bd = ov.querySelector('#rpBoard'); R.cells = [];
  for (let i = 0; i < SIZE * SIZE; i++) { const d = document.createElement('div'); d.dataset.r = i / SIZE | 0; d.dataset.c = i % SIZE; bd.append(d); R.cells.push(d); }
  R.ov = ov; R.chip = ov.querySelector('.rpChip'); R.range = ov.querySelector('.rpRange'); R.playBtn = ov.querySelector('.rpPlay'); R.spd = ov.querySelector('.rpSpd');
  // the score-difference curve: who led, step by step (player 0 above the line, player 1 below)
  const diffs = [0]; for (let i = 1; i <= R.steps.length; i++) { const s = stateAt(i).score; diffs.push(s[0] - s[1]); }
  const mx = Math.max(10, ...diffs.map(Math.abs)), X = i => R.steps.length ? i / R.steps.length * 100 : 0, Y = d => 20 - d / mx * 17;
  const pts = diffs.map((d, i) => [X(i), Y(d)]);
  ov.querySelector('.line').setAttribute('d', 'M' + pts.map(p => p.map(v => v.toFixed(2)).join(' ')).join('L'));
  const area = sign => 'M0 20' + pts.map(([x, y], i) => `L${x.toFixed(2)} ${(sign > 0 ? Math.min(y, 20) : Math.max(y, 20)).toFixed(2)}`).join('') + `L100 20Z`;
  ov.querySelector('.a0').setAttribute('d', area(1)); ov.querySelector('.a1').setAttribute('d', area(-1));
}

// ---------- drawing a step ----------
function show(n, animate) {
  n = Math.max(0, Math.min(R.steps.length, n));
  const prev = R.n; R.n = n;
  const { board, score, last } = stateAt(n), fresh = new Set();
  if (animate && last && last.k === 'move') tilesOf(last.e).forEach(x => fresh.add(x.r * SIZE + x.c));
  const lastCells = last && last.e ? new Set(tilesOf(last.e).map(x => x.r * SIZE + x.c)) : new Set();
  R.cells.forEach((el, i) => {
    const r = i / SIZE | 0, c = i % SIZE, t = board[r][c], k = LAYOUT[r][c];
    const h = t ? tileMini(t) : sqHTML(k), key = h + (fresh.has(i) ? '|n' : '') + (t && lastCells.has(i) && last.k === 'move' ? '|l' : '');
    if (el._h === key) return; el._h = key; el.innerHTML = h;
    el.className = 'sq k' + k + (t ? ' has' : '') + (fresh.has(i) ? ' rpNew' : '') + (t && lastCells.has(i) && last.k === 'move' ? ' rpLast' : '');
  });
  R.ov.querySelectorAll('.rpS').forEach((el, p) => {
    const b = el.querySelector('.rpNum'), v = String(score[p]);
    if (b.textContent !== v) { b.textContent = v; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    el.classList.toggle('on', !!last && last.e && last.e.p === p && last.k !== 'end' && last.k !== 'ok' && last.k !== 'void');
    el.classList.toggle('win', !!last && last.k === 'end' && app.lastResult.winner === p);
  });
  R.range.value = n; R.range.setAttribute('aria-valuetext', describe(last, n));
  const ticks = R.ov.querySelectorAll('.rpTicks i'); ticks.forEach((t, i) => t.classList.toggle('on', i < n));
  placeChip(last);
  // a verdict step reached by playing / stepping forward: the stamp lands on the word
  if (animate && last && (last.k === 'ok' || last.k === 'void') && n === prev + 1) setTimeout(() => stampOver(tilesOf(last.e).map(x => R.cells[x.r * SIZE + x.c]), last.k), 120);
  if (animate && last && last.k === 'move') haptic('tick');
}
function describe(s, n) {
  if (!s) return L3('بداية اللعبة', 'Awal permainan', 'Start of the game');
  const e = s.e;
  if (s.k === 'move') return `${nm(e.p)}: ${e.words.map(w => w.w + ' ' + w.pts).join('، ')} (+${e.total})`;
  if (s.k === 'pass') return `${nm(e.p)}: ${L3('تمرير', 'melewati', 'passed')}`;
  if (s.k === 'swap') return `${nm(e.p)}: ${L3('بدّل', 'menukar', 'swapped')} ${e.cnt}`;
  if (s.k === 'ok') return `${L3('صحيح', 'صحيح', 'صحيح')}${e.pen ? ' −' + e.pen : ''}`;
  if (s.k === 'void') return 'خطأ';
  return L3('النتيجة النهائية', 'Skor akhir', 'Final scores');
}
function placeChip(s) {
  const c = R.chip, wrap = c.parentElement;
  if (!s || s.k === 'end' || s.k === 'ok' || s.k === 'void') { c.hidden = true; return; }
  const e = s.e;
  c.className = 'rpChip p' + e.p;
  if (s.k === 'move') c.innerHTML = e.words.map(w => `<span>${esc(w.w)} <b>${w.pts}</b></span>`).join('') + `<em>+${e.total}</em>`;
  else c.innerHTML = `<span>${s.k === 'pass' ? L3('تمرير', 'Lewati', 'Pass') : L3('تبديل', 'Tukar', 'Swap') + ' ' + e.cnt}</span>`;
  c.hidden = false;
  const wr = wrap.getBoundingClientRect();
  let l, t;
  if (s.k === 'move') {
    const rs = tilesOf(e).map(x => R.cells[x.r * SIZE + x.c].getBoundingClientRect());
    const x0 = Math.min(...rs.map(r => r.left)), x1 = Math.max(...rs.map(r => r.right)), y0 = Math.min(...rs.map(r => r.top)), y1 = Math.max(...rs.map(r => r.bottom));
    l = (x0 + x1) / 2 - wr.left; t = y0 - wr.top - c.offsetHeight - 6;
    if (t < 2) t = y1 - wr.top + 6;   // no room above the word: below it
  } else { l = wr.width / 2; t = 6; }
  const half = c.offsetWidth / 2;
  c.style.left = Math.max(half + 2, Math.min(wr.width - half - 2, l)) + 'px'; c.style.top = Math.max(2, Math.min(wr.height - c.offsetHeight - 2, t)) + 'px';
}

// ---------- playback ----------
function setPlaying(on) {
  clearTimeout(R.timer); R.playing = on;
  R.playBtn.innerHTML = ic(on ? 'pause' : 'play');
  if (on) { if (R.n >= R.steps.length) show(0, false); tick(); }
}
function tick() {
  if (!R || !R.playing) return;
  const nextK = R.steps[R.n] && R.steps[R.n].k, hold = nextK === 'ok' || nextK === 'void' ? 1700 : nextK === 'end' ? 1200 : 1150;
  R.timer = setTimeout(() => { if (!R || !R.playing) return; if (R.n >= R.steps.length) return setPlaying(false); show(R.n + 1, true); if (R.n >= R.steps.length) setPlaying(false); else tick(); }, hold / R.speed);
}
function close() {
  if (!R) return;
  clearTimeout(R.timer); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize);
  R.ov.classList.remove('on'); const ov = R.ov, back = R.back; R = null;
  setTimeout(() => ov.remove(), 220); if (back && back.isConnected) back.focus({ preventScroll: true });
}
const onResize = () => { if (R) placeChip(R.n ? R.steps[R.n - 1] : null); };
function onKey(e) {
  if (!R) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  else if (e.key === ' ' && e.target === document.body || e.key === 'k') { e.preventDefault(); setPlaying(!R.playing); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setPlaying(false); show(R.n + (e.key === 'ArrowRight' ? 1 : -1), true); }
  else if (e.key === 'Home') { e.preventDefault(); setPlaying(false); show(0, false); }
  else if (e.key === 'End') { e.preventDefault(); setPlaying(false); show(R.steps.length, false); }
  else if (e.key === 'Tab') {   // the overlay is modal: Tab stays inside
    const f = [...R.ov.querySelectorAll('button,input')].filter(n => !n.disabled), a = document.activeElement;
    if (!f.length) return; if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
}
export function openReplay() {
  if (R) return;
  const steps = buildSteps(); if (!steps.length) return;
  R = { steps, n: 0, playing: false, speed: 1, timer: 0, back: document.activeElement };
  build();
  R.ov.addEventListener('click', e => {
    const b = e.target.closest('[data-rp]'); if (!b) return;
    const a = b.dataset.rp;
    if (a === 'close') close();
    else if (a === 'play') setPlaying(!R.playing);
    else if (a === 'prev') { setPlaying(false); show(R.n - 1, true); }
    else if (a === 'next') { setPlaying(false); show(R.n + 1, true); }
    else if (a === 'speed') { R.speed = SPEEDS[(SPEEDS.indexOf(R.speed) + 1) % SPEEDS.length]; R.spd.textContent = R.speed + '×'; }
  });
  R.range.addEventListener('input', () => { setPlaying(false); show(+R.range.value, false); });
  document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize);
  requestAnimationFrame(() => { R.ov.classList.add('on'); show(0, false); R.playBtn.focus({ preventScroll: true });
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(true); });
}
export function initReplay() {
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-replay]'); if (!b) return;
    const d = $('#dlg'); if (d.open && d.classList.contains('result')) d.close();   // closing without a choice: the result dialog's "new game" is NOT triggered
    openReplay();
  });
}
