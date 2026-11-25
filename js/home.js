// Back to the main screen (Settings > title bar). The main screen is the cover: PLAY (local) / ONLINE. Nothing is thrown away on the way there:
//   local match   it is written to this device first, and PLAY then offers to continue it; asked first, because it is the only way to lose the thread of a game by accident
//   online match  it keeps running on the server (resume key kept); only this page leaves. ONLINE brings the player back to it
//   lobby / over  the existing leave flow (leave the room / back to the cover)
// Going home is a plain navigation to the same page (the cover is a start-up screen, so a fresh start is the one state that is always consistent), flagged for one load so an
// online resume does not pull the player straight back into the match they just left.
import { $, S, app } from './state.js';
import { ask } from './ui.js';
import { saveNow } from './persist.js';

export const HOME_FLAG = 'eas.home';
const go = () => {
  try { saveNow(); } catch { /* nothing to save */ }
  try { sessionStorage.setItem(HOME_FLAG, '1'); } catch { /* storage unavailable: the page still opens on the main screen, an online match may resume by itself */ }
  location.href = location.pathname;
};
const localInProgress = () => !app.net && !!S.board && !S.ended && (S.hist.length > 0 || S.move.length > 0 || S.started);

async function leave() {
  if (app.net) {
    const { net } = await import('./online/session.js'), st = net.snap?.game?.status;
    if (!st || ['lobby', 'finished', 'abandoned'].includes(st)) return net.leave();   // leave the room / the match is over: the existing flow returns to the cover
    return ask('العودة إلى الشاشة الرئيسية', 'ستبقى المباراة عبر الإنترنت قائمة على الخادم ويمكنك العودة إليها من «ONLINE». سينتظرك الخصم، وقد تُعدّ المباراة متروكة إن طال غيابك.',
      'الشاشة الرئيسية', go, null, 'btn main', 'متابعة اللعب');
  }
  if (!localInProgress()) return go();
  ask('العودة إلى الشاشة الرئيسية', 'ستُحفظ المباراة الحالية على هذا الجهاز ويمكنك متابعتها لاحقًا من «PLAY».', 'الشاشة الرئيسية', go, null, 'btn main', 'متابعة اللعب');
}

// The guide is a website. Offline (the app is a PWA) it cannot open, so the built-in rules view takes over; it is loaded only then.
function initGuide() {
  const a = $('#guideLink'); if (!a) return;
  a.addEventListener('click', e => {
    if (navigator.onLine !== false) return;   // online: the link opens the guide in a new tab, untouched
    e.preventDefault();
    import('./rulesview.js').then(m => { m.initRulesView(); m.openRules(); });
  });
}

export function initHome() {
  initGuide();
  $('#goHome').addEventListener('click', () => {
    $('#ad').close();   // the sheet goes first; the confirmation (if any) is the only thing on screen
    setTimeout(() => { leave().catch(() => go()); }, 0);
  });
}
