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
const PAD_R = 5.6;              // default mallet radius; per-game overridable
const PAD_R_MIN = 3.4;
const PAD_R_MAX = 8.2;

const GOAL_W = 34;
const GX0 = (W - GOAL_W) / 2;   // 33
const GX1 = (W + GOAL_W) / 2;   // 67
const POST_R = 1.5;

const PUCK_MAX = 255;           // a smash crosses the rink in ~0.8 s
const PUCK_MIN_AFTER_HIT = 30;
const PAD_MAX_SPEED = 420;      // clamp so a teleporting finger can't break physics
const FRICTION = 0.94;          // multiplicative per second
const WALL_REST = 0.93;
const PAD_REST = 0.88;          // restitution of a *passive* mallet (a block)
const SMASH_REF = 150;          // mallet speed at which the strike bonus tops out
const SMASH_BONUS = 0.45;       // extra restitution on a full-force strike
const PAD_TRANSFER = 0.22;      // mallet speed injected along the contact normal
const PAD_DRAG = 0.12;          // ...and sideways, so a brushed puck curls away

const TICK = 1 / 60;
const COUNTDOWN_START = 3000;
const COUNTDOWN_GOAL = 1600;
const STALL_LIMIT = 5000;       // ms of a near-motionless puck before we nudge it

const ST = { LOBBY: 0, COUNTDOWN: 1, PLAYING: 2, PAUSED: 3, OVER: 4, HALFTIME: 5 };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r2 = (v) => Math.round(v * 100) / 100;

/* Half time lands when the leader reaches half the winning score. Short
   matches (1-2 goals) are over before a break would make any sense. */
function halftimeFor(target) {
  return target >= 3 ? Math.ceil(target / 2) : 0;
}

function makePaddle(side) {
  // A sits in the bottom half, B in the top half.
  const y = side === 'a' ? H * 0.78 : H * 0.22;
  return { x: W / 2, y, tx: W / 2, ty: y, vx: 0, vy: 0 };
}

class Game {
  /* `opts` may be a plain target score (legacy) or
     { target, padR, halftime }. */
  constructor(opts = 7) {
    const o = (typeof opts === 'number' || opts == null) ? { target: opts } : opts;
    this.target = clamp(Math.round(+o.target || 7), 1, 15);
    this.padR = clamp(+o.padR || PAD_R, PAD_R_MIN, PAD_R_MAX);
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
    this.padA = makePaddle('a');
    this.padB = makePaddle('b');
    this.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.resetPuck(Math.random() < 0.5 ? 1 : -1);
  }

  /* Changing the winning score also moves the break. */
  setTarget(v) {
    this.target = clamp(Math.round(+v) || 7, 1, 15);
    if (this.halfAt) this.halfAt = halftimeFor(this.target);
  }

  resetPuck(dir) {
    this.puck.x = W / 2;
    this.puck.y = H / 2;
    // A wide face-off angle keeps the puck from flying straight into the
    // defender who just reset to centre.
    this.puck.vx = (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 30);
    this.puck.vy = dir * (48 + Math.random() * 22);
    this.stallMs = 0;
  }

  resetPaddles() {
    this.padA = makePaddle('a');
    this.padB = makePaddle('b');
  }

  /* Called when both players are present. */
  startCountdown(ms = COUNTDOWN_START) {
    this.state = ST.COUNTDOWN;
    this.countdown = ms;
  }

  pause() {
    if (this.state === ST.PLAYING || this.state === ST.COUNTDOWN) {
      this.state = ST.PAUSED;
    }
  }

  resume() {
    if (this.state === ST.PAUSED) this.startCountdown(COUNTDOWN_START);
  }

  /* Players have turned the phone around; kick the second half off. */
  resumeHalftime() {
    if (this.state === ST.HALFTIME) this.startCountdown(COUNTDOWN_START);
  }

  restart() {
    this.scoreA = 0;
    this.scoreB = 0;
    this.winner = null;
    this.halfDone = false;
    this.resetPaddles();
    this.resetPuck(Math.random() < 0.5 ? 1 : -1);
    this.startCountdown(COUNTDOWN_START);
  }

  /* Target position from a client, already in canonical field coordinates. */
  setInput(side, x, y) {
    const p = side === 'a' ? this.padA : this.padB;
    const r = this.padR;
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
      // Paddles stay live during the countdown so players can settle in.
      this.movePaddle(this.padA, dt);
      this.movePaddle(this.padB, dt);
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.state = ST.PLAYING;
      }
      return;
    }

    if (this.state !== ST.PLAYING) return;

    this.movePaddle(this.padA, dt);
    this.movePaddle(this.padB, dt);
    this.movePuck(dt);
  }

  movePaddle(p, dt) {
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
    p.x = nx;
    p.y = ny;
  }

  movePuck(dt) {
    const k = this.puck;

    // Sub-step so a fast puck can never tunnel through a paddle or wall.
    const speed = Math.hypot(k.vx, k.vy);
    const steps = clamp(Math.ceil((speed * dt) / (PUCK_R * 0.7)), 1, 12);
    const sdt = dt / steps;

    for (let s = 0; s < steps; s++) {
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

      if (k.y < 0) { this.score('a'); return; }
      if (k.y > H) { this.score('b'); return; }
    }

    // Friction + speed clamp
    const f = Math.pow(FRICTION, dt);
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
        k.vx = (Math.random() - 0.5) * 40;
        k.vy = dir * 55;
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
    const min = PUCK_R + this.padR;
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
    const swing = Math.max(0, p.vx * nx + p.vy * ny);
    const punch = clamp(swing / SMASH_REF, 0, 1);

    // Reflect the puck's velocity relative to the moving paddle
    const rvx = k.vx - p.vx;
    const rvy = k.vy - p.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const rest = PAD_REST + SMASH_BONUS * punch;
      k.vx -= nx * vn * (1 + rest);
      k.vy -= ny * vn * (1 + rest);
    }

    // Inject the paddle's own motion - this is what makes a smash feel like a
    // smash. Straight-on drive counts far more than a sideways brush.
    k.vx += nx * swing * PAD_TRANSFER + (p.vx - nx * swing) * PAD_DRAG;
    k.vy += ny * swing * PAD_TRANSFER + (p.vy - ny * swing) * PAD_DRAG;

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
    this.resetPaddles();

    if (this.scoreA >= this.target || this.scoreB >= this.target) {
      this.winner = this.scoreA > this.scoreB ? 'a' : 'b';
      this.state = ST.OVER;
      this.puck.x = W / 2; this.puck.y = H / 2;
      this.puck.vx = 0; this.puck.vy = 0;
      return;
    }

    // Conceding side gets the puck: A defends y=H, B defends y=0.
    this.resetPuck(side === 'a' ? -1 : 1);

    // Half time: freeze here until the players say they have turned the phone.
    if (this.halfAt && !this.halfDone &&
        Math.max(this.scoreA, this.scoreB) >= this.halfAt) {
      this.halfDone = true;
      this.state = ST.HALFTIME;
      return;
    }

    this.startCountdown(COUNTDOWN_GOAL);
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
  Game, ST, halftimeFor,
  CONST: {
    W, H, PUCK_R, PAD_R, PAD_R_MIN, PAD_R_MAX,
    GOAL_W, GX0, GX1, POST_R, TICK,
    PUCK_MAX, PAD_MAX_SPEED,
  },
};
}));
