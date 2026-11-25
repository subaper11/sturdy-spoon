// Where a dragged tile lands, for touch and pen (js/touchdrag.js). Pure arithmetic: no DOM, no game state.
//
// The drop point is the ghost's centre, held `lift` px above the fingertip so the hand never hides the target. On a short landscape phone the board runs almost to the bottom of the
// screen, so the finger would have to go BELOW the screen to reach the bottom row and its corners. There (and only there) the lift fades out over the last stretch above the bottom
// edge, as a continuous function of the finger: the drop point never jumps, nothing snaps to another square, and a finger exactly on a square still drops on that square. Every
// screen where the bottom row is reachable with the plain lift (portrait, tablets, desktops, tall landscape) gets the plain lift, unchanged.
export const EDGE = 14;   // px above the bottom of the screen: the lowest fingertip position treated as reachable (gesture bars and bezels live below it)

// y: fingertip, lift: normal lift, rowC: vertical centre of the board's bottom row, vh: visible viewport height
export function dropY(y, lift, rowC, vh) {
  const yMax = vh - EDGE;
  if (!(rowC + lift > yMax)) return y - lift;   // reachable as is (also covers NaN inputs)
  const span = 3 * lift, y1 = yMax - span, c1 = y1 - lift;   // the fade starts at y1, where the plain drop point is c1
  if (y <= y1) return y - lift;
  const target = Math.min(rowC, yMax);                       // at yMax the drop point reaches the bottom row's centre
  if (y <= yMax) return c1 + (y - y1) * (target - c1) / (yMax - y1);
  return target + (y - yMax);                                // below yMax it keeps moving 1:1
}

// The lowest fingertip y that still reaches the centre of the bottom row, to check reachability (tests, diagnostics)
export function reachY(lift, rowC, vh) {
  const yMax = vh - EDGE;
  if (!(rowC + lift > yMax)) return rowC + lift;
  return yMax;
}
