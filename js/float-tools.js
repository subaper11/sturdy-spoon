// Floating engine, part 4 of 7: Game Tools. RETIRED AS A SEPARATE MODULE: the tool buttons stay inside the Turn Controls dock (#toolRow) in every mode, so the Floating Workspace
// shows the same single, integrated group as the default layout. #tools remains as an empty, hidden shell so the registry, saved layouts and tests that know the id keep working.
const HOME_TOOLS = ['bReplay', 'bLog', 'bPause', 'bFs', 'bSettings', 'bNew'];   // their order in the tool row (#toolRow)
export function dockTools() {   // idempotent: makes sure nothing was left behind in the shell (an older build, a stale state)
  const tools = document.getElementById('tools'), home = document.getElementById('toolRow'); if (!tools || !home) return;
  tools.classList.remove('ctrls'); document.getElementById('toolsToggle')?.remove(); delete tools.dataset.min;
  for (const id of HOME_TOOLS) { const b = document.getElementById(id); if (b && b.parentNode !== home) home.append(b); }
}
export function syncTools() { /* nothing to minimize any more */ }
