/* Air Hockey — how the 100 x 200 rink is laid into whatever window it got.

   Two independent turns can apply at once:

     * a quarter turn, when the window is wider than it is tall, so a portal
       page or a phone held sideways gets a rink that fills it;
     * a half turn, during the second half of a same-device match, because the
       phone itself has been spun round on the table.

   Drawing applies them as canvas transforms; a finger has to come back through
   the same turns in reverse. Getting one sign wrong there does not crash
   anything — it just makes the mallet follow the finger in the wrong
   direction — so the two directions live here, next to each other, and a test
   holds them to being exact inverses.  */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AHView = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';

/* Where the rink sits in a window of `w` x `h`, for a field of `fw` x `fh`. */
function layout(w, h, fw, fh, pad) {
  const p = pad == null ? 6 : pad;
  const turn = w > h;
  // Turned on its side, the window's height has to cover the field's width.
  let s = turn
    ? Math.min((h - p * 2) / fw, (w - p * 2) / fh)
    : Math.min((w - p * 2) / fw, (h - p * 2) / fh);
  // A window can genuinely be reported as zero-sized — a hidden tab, a frame
  // the portal has not laid out yet — and a scale of zero or less turns every
  // coordinate downstream into a NaN that never washes out. A resize lands as
  // soon as the window is real, so the only job here is to stay finite.
  if (!(s > 0)) s = 1e-6;
  return turn
    ? { ox: 0, oy: 0, s, w, h, turn: true }
    : { ox: (w - fw * s) / 2, oy: (h - fh * s) / 2, s, w, h, turn: false };
}

/* Field -> screen. This mirrors, step for step, the transform chain render()
   pushes onto the canvas. */
function toScreen(V, x, y, flip, fw, fh) {
  let fxv = x, fyv = y;
  if (flip) { fxv = fw - fxv; fyv = fh - fyv; }
  if (!V.turn) return { px: V.ox + fxv * V.s, py: V.oy + fyv * V.s };
  // A quarter turn clockwise about the middle of the window puts the field's
  // far end (y = fh) against the left wall, which is the goal the player keeps.
  return {
    px: V.w / 2 - (fyv * V.s - fh * V.s / 2),
    py: V.h / 2 + (fxv * V.s - fw * V.s / 2),
  };
}

/* Screen -> field. The exact inverse of toScreen. */
function toField(V, px, py, flip, fw, fh) {
  let x, y;
  if (V.turn) {
    x = (py - V.h / 2) / V.s + fw / 2;
    y = (V.w / 2 - px) / V.s + fh / 2;
  } else {
    x = (px - V.ox) / V.s;
    y = (py - V.oy) / V.s;
  }
  if (flip) { x = fw - x; y = fh - y; }
  return { x, y };
}

return { layout, toScreen, toField };
}));
