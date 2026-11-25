# v5.10.2: Normal landscape reachability, cleaner board

## What you will see
- **No dot beside the player name.** The active panel is told apart by its accent border and soft glow (unchanged); `aria-current` on the panel still carries the turn for screen readers.
- **No dot on the last-move tile.** One quiet ring along the tile's edge instead, static (no animation): clear on a large board, thinner and softer on a medium one, a hairline on a very small one.
- **Landscape phone, Normal interface:** the players column and the dock no longer sit on top of the board. Before, on 740-932 px wide phones the 321 px minimum width of the one-row dock stretched the side column (about 228 px) and it spilled 50-100 px onto the board, covering its edge columns (touches there hit the panel). The dock now wraps to two centred rows when, and only when, its column is too narrow; the gutter between players and board is 14 px (was 10). Layouts that were already fine (portrait, small landscape, tablets, desktops 1366+, desktop duel) are pixel-identical to v5.10.1.
- **Dragging a tile to the bottom row and bottom corners on a short landscape screen.** The drop point sits about 1.3 squares above the fingertip so the hand never hides it. On a short landscape phone the board runs to the bottom of the screen, so the finger would have to be below the screen to reach the bottom row. Now, on such screens only, that lift fades out smoothly over the last ~110 px above the bottom edge (js/dropgeom.js). It is continuous (no jump, nothing snaps, no tile moves by itself), the ghost is drawn where the tile will land, and every other screen keeps the plain lift exactly.
- The rack does not shrink during a drag: that would change the layout in the middle of a gesture (FPS risk), and the two fixes above already solve the complaint.

## Kept as is
Floating Workspace stays unlimited (no min width/height anywhere). FPS fixes from v5.10.1 (13 layout passes instead of 127 for the same dock state changes, re-measured) and the Floating icon scaling fix are untouched.

## Files
css/style.css (turn dot removed; `.side` column cannot overflow; 14 px gutter in phone landscape), css/online.css (last-move ring), css/gfx.css (low-tier ring reads the same variables), css/bar.css (dock wrap, centred tool row), js/touchdrag.js + js/dropgeom.js (drop point), sw.js (precache), js/version.js (5.10.2).

## Tests
New: logic/dropgeom.mjs (37), layout/normal-landscape.mjs (250: geometry on 8 landscape sizes x 2 layouts, nothing steals a touch from the board's edges and corners, real CDP touch drags to every corner and edge on 7 screens). On v5.10.1 the new layout test fails 54 times; on v5.10.2 it passes. layout/adaptive.mjs follows the new marker. Still red exactly as on v5.10.0: e2e/local (1), e2e/run, layout/log-icon (16), layout/history-toggle (9), layout/float_modules, contrast.py (pink theme, 4.49 vs 4.5); layout/feel and pwa/e2e time out / fail identically on v5.10.1 in the sandbox.

## Initial load (production dist, simulated mid phone: 4x CPU slowdown, brotli)
Cold: Slow 4G 4.9 s to a usable Play button (FCP 1.6 s, LCP 3.8 s), Good 4G 2.9 s. Warm (service worker): about 2 s on any network, i.e. CPU-bound. 73 requests, 433 KB transferred cold. 15 stylesheets finish by 0.8 s; the 52-module JS chain (3 levels) by 3.2 s; Amiri-Regular (106 KB) is requested late (3.5 s) and finishes at 4.3 s. A/B tested font preload (-0.35 s on Slow 4G only) and modulepreload (-0.45 s on Slow 4G, but first paint 0.5 s later): neither shipped. Real-phone CPU/network still has to be checked on a device.
