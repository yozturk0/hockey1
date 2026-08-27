/* The rink's two turns must be exact inverses of each other. A sign error here
   does not throw: it just sends the mallet the wrong way, which is the kind of
   bug that only shows up on a device you do not have. */
'use strict';
const { layout, toScreen, toField } = require('../web/view.js');
const { CONST } = require('../web/engine.js');
const { W, H } = CONST;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const near = (a, b) => Math.abs(a - b) < 1e-6;

/* Every shape a real player actually hands us. */
const WINDOWS = [
  ['iPhone portrait', 390, 844],
  ['iPhone landscape', 844, 390],
  ['tablet portrait', 768, 1024],
  ['Poki desktop frame', 1280, 720],
  ['Poki small frame', 640, 360],
  ['square', 600, 600],
];

console.log('the rink fits the window');
for (const [name, w, h] of WINDOWS) {
  const V = layout(w, h, W, H);
  const span = V.turn ? { x: H * V.s, y: W * V.s } : { x: W * V.s, y: H * V.s };
  ok(name + ' — fits inside', span.x <= w + 1e-9 && span.y <= h + 1e-9);
  ok(name + ' — turns only when wide', V.turn === (w > h));
  ok(name + ' — uses one axis fully',
     Math.abs(span.x - (w - 12)) < 1e-6 || Math.abs(span.y - (h - 12)) < 1e-6);
}

console.log('screen and field are exact inverses');
const PTS = [[0, 0], [W, H], [W / 2, H / 2], [3.4, 196.6], [W - 3.4, 1.2], [12.5, 87.3]];
for (const [name, w, h] of WINDOWS) {
  const V = layout(w, h, W, H);
  for (const flip of [false, true]) {
    let worst = 0;
    for (const [x, y] of PTS) {
      const s = toScreen(V, x, y, flip, W, H);
      const f = toField(V, s.px, s.py, flip, W, H);
      worst = Math.max(worst, Math.abs(f.x - x), Math.abs(f.y - y));
    }
    ok(name + (flip ? ' (second half)' : '') + ' — round trip', worst < 1e-9);
  }
}

console.log('the player keeps their own goal');
for (const [name, w, h] of WINDOWS) {
  const V = layout(w, h, W, H);
  // The player defends y = H. Portrait puts it at the bottom of the window,
  // landscape against the left wall — either way, nearest the player.
  const mine = toScreen(V, W / 2, H, false, W, H);
  const theirs = toScreen(V, W / 2, 0, false, W, H);
  if (V.turn) ok(name + ' — my goal is on the left', mine.px < theirs.px);
  else ok(name + ' — my goal is at the bottom', mine.py > theirs.py);
}

console.log('a window with no size yet');
for (const [w, h] of [[0, 0], [0, 500], [500, 0], [4, 4]]) {
  const V = layout(w, h, W, H);
  const f = toField(V, 10, 10, false, W, H);
  ok(w + 'x' + h + ' — scale stays positive', V.s > 0);
  ok(w + 'x' + h + ' — coordinates stay finite',
     Number.isFinite(f.x) && Number.isFinite(f.y));
}

console.log('the centre of the rink is the centre of the window');
for (const [name, w, h] of WINDOWS) {
  const V = layout(w, h, W, H);
  const c = toScreen(V, W / 2, H / 2, false, W, H);
  ok(name + ' — centred', near(c.px, w / 2) && near(c.py, h / 2));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
