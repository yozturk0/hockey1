(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AHEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
'use strict';
/* ------------------------------------------------------------------
   Air Hockey - authoritative physics
   Canonical field: 100 wide x 200 tall, origin top-left.
   Player A defends the BOTTOM goal (y = H), player B the TOP goal (y = 0).
   All units are "field units"; velocities are units/second.
------------------------------------------------------------------ */

const W = 100;
const H = 200;

const PUCK_R = 3.4;
/* Every match is played with the same, biggest mallet: one shared feel, and
   the two sides of an online match are never unequal. Lucky mode still grows
   and shrinks it mid-rally, within the bounds below. */
const PAD_R = 6.8;
const PAD_R_MIN = 3.4;
const PAD_R_MAX = 8.2;

const GOAL_W = 34;
const GX0 = (W - GOAL_W) / 2;   // 33
const GX1 = (W + GOAL_W) / 2;   // 67
const POST_R = 1.5;

/* Puck speeds are deliberately calm: the whole scale below was pulled down
   by 30 % so a rally stays readable for a child's eyes and thumbs. */
const PUCK_MAX = 178;           // a smash crosses the rink in ~1.1 s
const PUCK_MIN_AFTER_HIT = 21;
const PAD_MAX_SPEED = 420;      // clamp so a teleporting finger can't break physics
const FRICTION = 0.94;          // multiplicative per second
const WALL_REST = 0.93;
const PAD_REST = 0.88;          // restitution of a *passive* mallet (a block)
const SMASH_REF = 150;          // mallet speed at which the strike bonus tops out
const SMASH_BONUS = 0.45;       // extra restitution on a full-force strike
const PAD_TRANSFER = 0.22;      // mallet speed injected along the contact normal
const PAD_DRAG = 0.12;          // ...and sideways, so a brushed puck curls away
/* The one tempo knob. A mallet drives the puck with this fraction of its own
   speed, which - together with the equally scaled face-off and clamp speeds
   above - makes every rally play out 30 % slower without touching how quickly
   a finger can move the mallet itself. */
const PUCK_TEMPO = 0.7;

const TICK = 1 / 60;
/* One countdown length for every restart - kickoff, goals and half time all
   run the same 3 - 2 - 1. 2.5 s is long enough to read all three digits and
   short enough that nobody drums their fingers. */
const COUNTDOWN_MS = 2500;
const COUNTDOWN_STEPS = 3;
const STALL_LIMIT = 5000;       // ms of a near-motionless puck before we nudge it

/* ---------------- lucky mode ---------------- */
/* "Sansli" sprinkles small, short-lived twists over an otherwise normal match.
   Everything here is deliberately mild: a twist should change how a rally
   feels, never decide who wins it. */
const MODE_CLASSIC = 'klasik';
const MODE_LUCKY = 'sansli';

const LUCKY_FIRST_MS = 4500;    // first twist of a rally
const LUCKY_GAP_MS = 6500;      // ...then one every 6.5 - 9 s
const LUCKY_JITTER_MS = 2500;
const LUCKY_DUR_MS = 6000;      // how long one twist lasts
const LUCKY_GROW = 1.18;        // +18 % mallet
const LUCKY_SHRINK = 0.85;      // -15 % mallet
const LUCKY_ICE_FAST = 0.972;   // slick ice: the puck keeps rolling
const LUCKY_ICE_SLOW = 0.900;   // sticky ice: it dies sooner
/* Effect codes carried by a type-3 event. */
const FX_GROW = 0, FX_SHRINK = 1, FX_FAST = 2, FX_SLOW = 3;

const ST = { LOBBY: 0, COUNTDOWN: 1, PLAYING: 2, PAUSED: 3, OVER: 4, HALFTIME: 5 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r2 = (v) => Math.round(v * 100) / 100;

/* Half time lands when the leader reaches half the winning score. Short
   matches (1-2 goals) are over before a break would make any sense. */
function halftimeFor(target) {
  return target >= 3 ? Math.ceil(target / 2) : 0;
}

/* Which digit a countdown of `ms` should be showing. Always 3 -> 2 -> 1,
   whatever the countdown's total length happens to be. */
function countdownDigit(ms, total = COUNTDOWN_MS) {
  const step = total / COUNTDOWN_STEPS;
  return clamp(Math.ceil(ms / step), 1, COUNTDOWN_STEPS);
}

function makePaddle(side, r) {
  // A sits in the bottom half, B in the top half.
  const y = side === 'a' ? H * 0.78 : H * 0.22;
  return { x: W / 2, y, tx: W / 2, ty: y, vx: 0, vy: 0, r, scale: 1, fxMs: 0 };
}

class Game {
  /* `opts` may be a plain target score (legacy) or
     { target, padR, halftime, mode }. */
  constructor(opts = 7) {
    const o = (typeof opts === 'number' || opts == null) ? { target: opts } : opts;
    this.target = clamp(Math.round(+o.target || 7), 1, 15);
    this.padR = clamp(+o.padR || PAD_R, PAD_R_MIN, PAD_R_MAX);
    this.mode = o.mode === MODE_LUCKY ? MODE_LUCKY : MODE_CLASSIC;
    this.halfAt = o.halftime ? halftimeFor(this.target) : 0;
    this.halfDone = false;
    this.scoreA = 0;
    this.scoreB = 0;
    this.state = ST.LOBBY;
    this.countdown = 0;
    this.winner = null;
    this.tick = 0;
    this.events = [];
    this.stallMs = 0;
    this.padA = makePaddle('a', this.padR);
    this.padB = makePaddle('b', this.padR);
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.luckyMs = LUCKY_FIRST_MS;
    this.luckyBag = [];
    this.iceMs = 0;
    this.iceFriction = FRICTION;
    this.resetPuck(Math.random() < 0.5 ? 1 : -1);
  }

  /* Changing the winning score also moves the break. */
  setTarget(v) {
    this.target = clamp(Math.round(+v) || 7, 1, 15);
    if (this.halfAt) this.halfAt = halftimeFor(this.target);
  }

  setMode(v) {
    this.mode = v === MODE_LUCKY ? MODE_LUCKY : MODE_CLASSIC;
    if (this.mode === MODE_CLASSIC) this.clearLucky();
  }

  /* Turn the half-time break on or off; only meaningful before kickoff. */
  setHalftime(on) {
    this.halfAt = on ? halftimeFor(this.target) : 0;
  }

  resetPuck(dir) {
    this.puck.x = W / 2;
    this.puck.y = H / 2;
    // A wide face-off angle keeps the puck from flying straight into the
    // defender who just reset to centre.
    this.puck.vx = (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 21);
    this.puck.vy = dir * (34 + Math.random() * 15);
    this.stallMs = 0;
  }

  resetPaddles() {
    this.padA = makePaddle('a', this.padR);
    this.padB = makePaddle('b', this.padR);
  }

  /* Every rally starts from a clean slate, so a twist can never carry a
     scoring advantage over into the next face-off. */
  clearLucky() {
    this.iceMs = 0;
    this.iceFriction = FRICTION;
    this.luckyMs = LUCKY_FIRST_MS;
    for (const p of [this.padA, this.padB]) { p.scale = 1; p.r = this.padR; p.fxMs = 0; }
  }

  /* Called when both players are present, and after every goal. */
  startCountdown(ms = COUNTDOWN_MS) {
    this.state = ST.COUNTDOWN;
    this.countdown = ms;
    this.resetPaddles();
    this.clearLucky();
  }

  pause() {
    if (this.state === ST.PLAYING || this.state === ST.COUNTDOWN) {
      this.state = ST.PAUSED;
    }
  }

  resume() {
    if (this.state === ST.PAUSED) this.startCountdown();
  }

  /* Both players are back from the break; kick the second half off. */
  resumeHalftime() {
    if (this.state === ST.HALFTIME) this.startCountdown();
  }

  restart() {
    this.scoreA = 0;
    this.scoreB = 0;
    this.winner = null;
    this.halfDone = false;
    this.resetPuck(Math.random() < 0.5 ? 1 : -1);
    this.startCountdown();
  }

  /* Target position from a client, already in canonical field coordinates. */
  setInput(side, x, y) {
    // Mallets are locked while the countdown runs; accepting input here would
    // let a player creep across the rink before the puck is live.
    if (this.state !== ST.PLAYING) return;
    const p = side === 'a' ? this.padA : this.padB;
    const r = p.r;
    p.tx = clamp(x, r, W - r);
    p.ty = side === 'a'
      ? clamp(y, H / 2 + r, H - r)
      : clamp(y, r, H / 2 - r);
  }

  ev(type, x, y, i) {
    if (this.events.length < 8) this.events.push([type, r2(x), r2(y), r2(i)]);
  }

  step(dt = TICK) {
    this.tick++;

    if (this.state === ST.COUNTDOWN) {
      this.countdown -= dt * 1000;
      // Both mallets are frozen on their spots. Letting them slide about
      // during "3 - 2 - 1" reads as lag, and a mallet already at full tilt
      // when the puck goes live is a free shot.
      this.holdPaddle(this.padA);
      this.holdPaddle(this.padB);
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.state = ST.PLAYING;
      }
      return;
    }

    if (this.state !== ST.PLAYING) return;

    if (this.mode === MODE_LUCKY) this.luckyStep(dt);
    this.advance(dt);
  }

  holdPaddle(p) {
    p.tx = p.x;
    p.ty = p.y;
    p.vx = 0;
    p.vy = 0;
  }

  /* Where a mallet wants to be at the end of this frame, and how fast it is
     travelling to get there. It is deliberately NOT moved here: the mallet is
     carried across the sub-steps together with the puck, because a mallet that
     teleports a whole frame's worth of distance jumps clean over any puck that
     happened to be in the gap - which is exactly what "the mallet went through
     the puck" looks like. */
  padStep(p, dt) {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    const maxStep = PAD_MAX_SPEED * dt;
    let nx, ny;
    if (d <= maxStep || d === 0) {
      nx = p.tx; ny = p.ty;
    } else {
      nx = p.x + (dx / d) * maxStep;
      ny = p.y + (dy / d) * maxStep;
    }
    p.vx = (nx - p.x) / dt;
    p.vy = (ny - p.y) / dt;
    return { x0: p.x, y0: p.y, x1: nx, y1: ny };
  }

  /* One frame of the live rink: both mallets and the puck move along the same
     sub-divided timeline, so every contact is caught no matter how hard either
     of them is moving. */
  advance(dt) {
    const k = this.puck;
    const a = this.padStep(this.padA, dt);
    const b = this.padStep(this.padB, dt);

    const puckMove = Math.hypot(k.vx, k.vy) * dt;
    const padMove = Math.max(Math.hypot(a.x1 - a.x0, a.y1 - a.y0),
                             Math.hypot(b.x1 - b.x0, b.y1 - b.y0));
    const steps = clamp(Math.ceil(Math.max(puckMove, padMove) / (PUCK_R * 0.7)), 1, 16);
    const sdt = dt / steps;

    for (let s = 1; s <= steps; s++) {
      const f = s / steps;
      this.padA.x = a.x0 + (a.x1 - a.x0) * f;
      this.padA.y = a.y0 + (a.y1 - a.y0) * f;
      this.padB.x = b.x0 + (b.x1 - b.x0) * f;
      this.padB.y = b.y0 + (b.y1 - b.y0) * f;
      if (this.puckSubstep(sdt)) return;   // a goal ends the frame
    }

    this.puckSettle(dt);
  }

  /* ---------------- lucky mode ---------------- */

  luckyStep(dt) {
    const ms = dt * 1000;

    for (const p of [this.padA, this.padB]) {
      if (p.fxMs <= 0) continue;
      p.fxMs -= ms;
      if (p.fxMs <= 0) { p.fxMs = 0; this.scalePad(p, 1); }
    }
    if (this.iceMs > 0) {
      this.iceMs -= ms;
      if (this.iceMs <= 0) { this.iceMs = 0; this.iceFriction = FRICTION; }
    }

    this.luckyMs -= ms;
    if (this.luckyMs <= 0) {
      this.luckyMs = LUCKY_GAP_MS + Math.random() * LUCKY_JITTER_MS;
      this.rollLucky();
    }
  }

  rollLucky() {
    // Roughly one twist in three re-surfaces the ice, which hits both players
    // equally. The rest are personal and come out of a shuffled bag, so over
    // every four of them each player gets one bigger and one smaller mallet.
    if (Math.random() < 0.34) {
      const fast = Math.random() < 0.5;
      this.iceFriction = fast ? LUCKY_ICE_FAST : LUCKY_ICE_SLOW;
      this.iceMs = LUCKY_DUR_MS;
      this.ev(3, this.puck.x, this.puck.y, fast ? FX_FAST : FX_SLOW);
      return;
    }

    if (!this.luckyBag.length) {
      this.luckyBag = [['a', FX_GROW], ['a', FX_SHRINK], ['b', FX_GROW], ['b', FX_SHRINK]];
      for (let i = this.luckyBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = this.luckyBag[i]; this.luckyBag[i] = this.luckyBag[j]; this.luckyBag[j] = t;
      }
    }
    const [side, kind] = this.luckyBag.pop();
    const p = side === 'a' ? this.padA : this.padB;
    this.scalePad(p, kind === FX_GROW ? LUCKY_GROW : LUCKY_SHRINK);
    p.fxMs = LUCKY_DUR_MS;
    this.ev(3, p.x, p.y, kind);
  }

  /* Resize a mallet and pull it back inside its own half, since the legal
     area shrinks and grows with the radius. */
  scalePad(p, scale) {
    p.scale = scale;
    p.r = clamp(this.padR * scale, PAD_R_MIN, PAD_R_MAX);
    const isA = p === this.padA;
    const r = p.r;
    const lo = isA ? H / 2 + r : r;
    const hi = isA ? H - r : H / 2 - r;
    p.x = clamp(p.x, r, W - r);
    p.y = clamp(p.y, lo, hi);
    p.tx = clamp(p.tx, r, W - r);
    p.ty = clamp(p.ty, lo, hi);
  }

  frictionNow() {
    return this.iceMs > 0 ? this.iceFriction : FRICTION;
  }

  /* ---------------- puck ---------------- */

  /* Advance the puck by one sub-step and resolve everything it can touch.
     Returns true when the puck has crossed a goal line. */
  puckSubstep(sdt) {
    const k = this.puck;

    k.x += k.vx * sdt;
    k.y += k.vy * sdt;

    this.collidePaddle(k, this.padA);
    this.collidePaddle(k, this.padB);

    // Side walls
    if (k.x < PUCK_R) {
      k.x = PUCK_R;
      k.vx = Math.abs(k.vx) * WALL_REST;
      this.ev(1, k.x, k.y, Math.abs(k.vx));
    } else if (k.x > W - PUCK_R) {
      k.x = W - PUCK_R;
      k.vx = -Math.abs(k.vx) * WALL_REST;
      this.ev(1, k.x, k.y, Math.abs(k.vx));
    }

    const inMouth = k.x > GX0 && k.x < GX1;

    // Top wall / B's goal
    if (k.y < PUCK_R && !inMouth) {
      k.y = PUCK_R;
      k.vy = Math.abs(k.vy) * WALL_REST;
      this.ev(1, k.x, k.y, Math.abs(k.vy));
    }
    // Bottom wall / A's goal
    if (k.y > H - PUCK_R && !inMouth) {
      k.y = H - PUCK_R;
      k.vy = -Math.abs(k.vy) * WALL_REST;
      this.ev(1, k.x, k.y, Math.abs(k.vy));
    }

    this.collidePost(k, GX0, 0);
    this.collidePost(k, GX1, 0);
    this.collidePost(k, GX0, H);
    this.collidePost(k, GX1, H);

    if (k.y < 0) { this.score('a'); return true; }
    if (k.y > H) { this.score('b'); return true; }
    return false;
  }

  /* Friction, the speed ceiling and the anti-stall nudge - once per frame,
     never per sub-step. */
  puckSettle(dt) {
    const k = this.puck;

    const f = Math.pow(this.frictionNow(), dt);
    k.vx *= f;
    k.vy *= f;
    const sp = Math.hypot(k.vx, k.vy);
    if (sp > PUCK_MAX) {
      k.vx = (k.vx / sp) * PUCK_MAX;
      k.vy = (k.vy / sp) * PUCK_MAX;
    }

    // Anti-stall: a puck parked in a corner would deadlock the match.
    if (sp < 7) {
      this.stallMs += dt * 1000;
      if (this.stallMs > STALL_LIMIT) {
        this.stallMs = 0;
        const dir = k.y < H / 2 ? 1 : -1;
        k.vx = (Math.random() - 0.5) * 28;
        k.vy = dir * 38;
      }
    } else {
      this.stallMs = 0;
    }
  }

  collidePost(k, px, py) {
    const dx = k.x - px;
    const dy = k.y - py;
    const dist = Math.hypot(dx, dy);
    const min = PUCK_R + POST_R;
    if (dist >= min || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    k.x = px + nx * min;
    k.y = py + ny * min;
    const vn = k.vx * nx + k.vy * ny;
    if (vn < 0) {
      k.vx -= nx * vn * (1 + WALL_REST);
      k.vy -= ny * vn * (1 + WALL_REST);
    }
    this.ev(1, k.x, k.y, Math.abs(vn));
  }

  collidePaddle(k, p) {
    const dx = k.x - p.x;
    const dy = k.y - p.y;
    let dist = Math.hypot(dx, dy);
    const min = PUCK_R + p.r;
    if (dist >= min) return;
    if (dist === 0) { dist = 0.0001; }

    const nx = dx / dist;
    const ny = dy / dist;

    // Push the puck out of the paddle
    k.x = p.x + nx * (min + 0.05);
    k.y = p.y + ny * (min + 0.05);

    // How hard the mallet is driving *into* the puck along the contact normal.
    // Only a real swing earns the bonus - parking the mallet in front of a
    // fast puck must stay a block, not a free rocket.
    // The mallet is *felt* by the puck at the game's tempo, not at the raw
    // speed the finger is moving; that is what keeps the rink calm.
    const pvx = p.vx * PUCK_TEMPO;
    const pvy = p.vy * PUCK_TEMPO;
    const swing = Math.max(0, pvx * nx + pvy * ny);
    const punch = clamp(swing / SMASH_REF, 0, 1);

    // Reflect the puck's velocity relative to the moving paddle
    const rvx = k.vx - pvx;
    const rvy = k.vy - pvy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const rest = PAD_REST + SMASH_BONUS * punch;
      k.vx -= nx * vn * (1 + rest);
      k.vy -= ny * vn * (1 + rest);
    }

    // Inject the paddle's own motion - this is what makes a smash feel like a
    // smash. Straight-on drive counts far more than a sideways brush.
    k.vx += nx * swing * PAD_TRANSFER + (pvx - nx * swing) * PAD_DRAG;
    k.vy += ny * swing * PAD_TRANSFER + (pvy - ny * swing) * PAD_DRAG;

    // Never let a hit die on contact
    let sp = Math.hypot(k.vx, k.vy);
    if (sp < PUCK_MIN_AFTER_HIT) {
      const s = PUCK_MIN_AFTER_HIT / (sp || 1);
      k.vx = (k.vx || nx) * s;
      k.vy = (k.vy || ny) * s;
      sp = PUCK_MIN_AFTER_HIT;
    }
    if (sp > PUCK_MAX) {
      k.vx = (k.vx / sp) * PUCK_MAX;
      k.vy = (k.vy / sp) * PUCK_MAX;
      sp = PUCK_MAX;
    }

    this.stallMs = 0;
    this.ev(0, k.x, k.y, sp);
  }

  score(side) {
    if (side === 'a') this.scoreA++; else this.scoreB++;
    this.ev(2, W / 2, side === 'a' ? 0 : H, side === 'a' ? 0 : 1);

    if (this.scoreA >= this.target || this.scoreB >= this.target) {
      this.winner = this.scoreA > this.scoreB ? 'a' : 'b';
      this.state = ST.OVER;
      this.resetPaddles();
      this.clearLucky();
      this.puck.x = W / 2; this.puck.y = H / 2;
      this.puck.vx = 0; this.puck.vy = 0;
      return;
    }

    // Conceding side gets the puck: A defends y=H, B defends y=0.
    this.resetPuck(side === 'a' ? -1 : 1);

    // Half time: freeze here until both players say they are ready.
    if (this.halfAt && !this.halfDone &&
        Math.max(this.scoreA, this.scoreB) >= this.halfAt) {
      this.halfDone = true;
      this.state = ST.HALFTIME;
      this.resetPaddles();
      this.clearLucky();
      return;
    }

    this.startCountdown();
  }

  /* Serialize from `side`'s point of view: that player is ALWAYS at the bottom.
     For side B we rotate the whole field 180 degrees, so the client needs no
     mirroring logic of its own - what it receives is what it draws. */
  snapshot(side) {
    const flip = side === 'b';
    const fx = (x) => (flip ? W - x : x);
    const fy = (y) => (flip ? H - y : y);
    const fv = (v) => (flip ? -v : v);

    const me = side === 'a' ? this.padA : this.padB;
    const foe = side === 'a' ? this.padB : this.padA;

    return {
      t: 's',
      k: this.tick,
      st: this.state,
      cd: Math.round(this.countdown),
      p: [r2(fx(this.puck.x)), r2(fy(this.puck.y)), r2(fv(this.puck.vx)), r2(fv(this.puck.vy))],
      m: [r2(fx(me.x)), r2(fy(me.y))],
      o: [r2(fx(foe.x)), r2(fy(foe.y))],
      // The opponent's mallet velocity, so the client can carry it forward
      // over the trip time instead of drawing it where it was a ping ago.
      ov: [r2(fv(foe.vx)), r2(fv(foe.vy))],
      // Mallet radii travel with every frame: in lucky mode they change mid-rally.
      rm: r2(me.r),
      ro: r2(foe.r),
      sm: side === 'a' ? this.scoreA : this.scoreB,
      so: side === 'a' ? this.scoreB : this.scoreA,
      w: this.winner === null ? null : (this.winner === side ? 1 : 0),
      e: this.events.map(([ty, x, y, i]) => [ty, r2(fx(x)), r2(fy(y)), i]),
    };
  }

  /* Convert a client's own-frame input into canonical coordinates. */
  applyInput(side, x, y) {
    if (side === 'b') this.setInput('b', W - x, H - y);
    else this.setInput('a', x, y);
  }

  clearEvents() { this.events.length = 0; }
}

return {
  Game, ST, halftimeFor, countdownDigit,
  MODES: { CLASSIC: MODE_CLASSIC, LUCKY: MODE_LUCKY },
  FX: { GROW: FX_GROW, SHRINK: FX_SHRINK, FAST: FX_FAST, SLOW: FX_SLOW },
  CONST: {
    W, H, PUCK_R, PAD_R, PAD_R_MIN, PAD_R_MAX,
    GOAL_W, GX0, GX1, POST_R, TICK,
    PUCK_MAX, PAD_MAX_SPEED, COUNTDOWN_MS, COUNTDOWN_STEPS,
  },
};
}));
