# v5.10.1: motion budget (FPS fix)

**Problem.** After pressing the check mark the dock reshaped itself with a 0.32 s transition of `width`, `flex-grow`, `margin`, `max-width` and `padding`. Every frame was a full layout of the dock; in the Floating Workspace the module's `ResizeObserver` (js/float.js) also re-ran `fitContent` on every frame. Result: dropped frames exactly when a move is confirmed.

**Fix (css/bar.css).** The dock never animates a layout property now. A state change is one layout (buttons outside the state are `display:none`, which also keeps them out of the tab order) plus a 0.16 s `dockIn` entrance (opacity + transform, compositor only). The edge light `dockBreath` loops only from Graphics *mid* up, like every other looping cue; the dock's `box-shadow` no longer transitions.

**Other motion that cost frames**
| Where | Before | After |
|---|---|---|
| picked tile flicker (`blink`, style.css) | animated `box-shadow` with a 16 px blur on the tile: repaint every frame | the glow is a static shadow on `.tile.pick::after`; only its opacity pulses |
| player panel turn glow (style.css) | `box-shadow` transition on the whole panel (racks repaint) | `.panel::after` glow fades by opacity |
| pause icon pulse (overlay.css) | animated `box-shadow` spread | ring on `::after`, opacity only |
| score pill / score pop (js/ui.js, js/online/hud.js) | `void el.offsetWidth` to restart the animation = forced synchronous layout after every DOM write | two identically-animated class names alternate (`tick`/`tick2`, `pop`/`pop2`): no layout |

**Unchanged on purpose:** Graphics levels low/mid/high, reduced-motion behaviour (the picked tile still flickers there), all dock states, order, sizes, colours and accessible names.

**Tests.** tests/pwa/static.mjs gained assertions that the dock has no layout transitions and that blink/panel do not animate `box-shadow`; the reduce-motion assertion follows the flicker to `::after`.

## Added during the test cleanup
**Floating dock icons scaled by u squared.** In the Floating Workspace the button's `font-size` already carries the module scale (`css/float.css`: `--b-fs * --u`), and `css/bar.css` multiplied the icon's `em` by `--k` (the same `u`) again. Icons were oversized at large modules (a 2150 px dock was 1027 px tall) and undersized at small ones. Floating now uses plain `1.5em` / `1.2em`; the default layout is unchanged.

**Tests.** `layout/collapse.mjs` now guards the retired Game Tools module (tools live in `#toolRow`, `#tools` is a hidden shell). `layering`, `fluid` and `floating` were brought in line with the single dock; `fluid` gained a proportion check (dock h/w at default vs widest) that fails on the old CSS (0.21 -> 0.70) and passes now.

**Known, unchanged:** `e2e/local`, `e2e/pause-button`, `e2e/run`, `layout/log-icon`, `layout/history-toggle` (one pixel-diff) and `float_modules` fail identically on v5.10.0; `e2e/tahkim-replay` is flaky (a blank tile opens the letter picker). The Floating dock has no minimum width, so a very small dock has sub-touch-size buttons (by design for now).
