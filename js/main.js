// Application entry point.
import { TICK_MS } from './config.js';
import { S } from './state.js';
import { buildDom, onAfterRender, render } from './ui.js';
import { tick, newGame } from './game.js';
import { initInput } from './input.js';
import { initThemes } from './themes.js';
import { initHistoryToggle } from './histview.js';
import { showCover } from './cover.js';
import { initLayout } from './layout.js';
import { initWorkspace } from './float.js';
import { initFullscreen } from './fullscreen.js';
import { loadNames } from './names.js';
import { initNameEdit } from './nameedit.js';
import { initHaptics } from './haptics.js';
import { loadSaved, initPersistence, startFlow, schedule } from './persist.js';
import { initPwa } from './pwa.js';
import { initPrefs } from './prefs.js';
import { initPause } from './pause.js';
import { initScale } from './scale.js';
import { initHome, HOME_FLAG } from './home.js';
import { initI18n } from './i18n.js';
import { initReplay } from './replay.js';

const RESUME = 'scrabble.online.resume';
// One-shot flags left by the previous page (js/home.js, js/pwa.js): the player just went to the main screen / just applied an update.
const once = k => { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return !!v; } catch { return false; } };
const wantsOnline = () => { try { return !!new URLSearchParams(location.search).get('room') || !!localStorage.getItem(RESUME); } catch { return false; } };

function start() {
  const saved = loadSaved();   // an unfinished match from a previous visit, validated; read before anything can overwrite it
  initThemes();
  loadNames();   // before buildDom: the panels are drawn with the saved names
  initHistoryToggle();
  initLayout();
  buildDom(); initReplay();
  initFullscreen();
  initI18n();          // the second language under the Arabic: the page as it is, and again whenever Settings > Language changes
  initHome();          // Settings > main screen
  initScale();         // whole-pixel board cells + text that follows the board's size
  initWorkspace();   // needs the player panels that buildDom just created; a saved "Floating Workspace: ON" is restored here
  initInput();
  initNameEdit();
  initHaptics();
  initPrefs(render);   // rack display (local) and live preview (online) preferences
  initPause();         // local pause: press a clock or P
  setInterval(tick, TICK_MS);
  newGame();
  S.paused = true;       // clock stays frozen until the setup flow finishes
  initPersistence(saved);   // before the render hook, so the start-up game can never replace a saved match
  onAfterRender(schedule);
  // Online code is fetched only when asked for (or when a ?room= link / an unfinished online match asks for it): local play never loads it.
  const openOnline = auto => import('./online/lobby.js').then(m => m.lobby.open(() => {}, auto));
  showCover(() => startFlow(saved), () => openOnline(false));   // cover first; "Play" offers to resume a saved match, else opens mode selection, then duration
  const home = once(HOME_FLAG), updated = once('eas.updated');
  if (wantsOnline() && !home) openOnline(true);   // an unfinished online match resumes by itself, except right after the player chose the main screen
  if (updated && saved && !home) document.getElementById('coverPlay').click();   // after an update: straight back to the question about the saved local match, not the title screen
  initPwa();
  document.documentElement.setAttribute('data-app-ready', '');   // the board has its 225 cells, both panels are drawn, the labels are translated and the cover is wired: nothing of the start-up is left to show
  endBoot();
}

// Transitions are held back during start-up (css/style.css, html.boot). Released after the first frames have been drawn; the timer covers a tab that is hidden at load (no frames there).
function endBoot() {
  const root = document.documentElement; let done = false;
  const end = () => { if (done) return; done = true; root.classList.remove('boot'); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(end));
  setTimeout(end, 1200);
}

start();
