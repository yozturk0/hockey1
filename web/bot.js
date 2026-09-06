/* Air Hockey — computer opponent.

   The bot drives paddle B (the top half) of an ordinary engine instance. It
   never touches the physics: it only ever says "I want my mallet here", exactly
   like a finger does, so a rally against it is governed by the same rules as a
   rally against a person.

   Three things keep it feeling human rather than mechanical:

     * it reacts on a delay, and only re-aims when that delay is up;
     * it aims at where it *believes* the puck will be, and that belief is
       deliberately imperfect;
     * it cannot move its mallet at the engine's full clamp speed.

   The mallet itself is driven like an arm, not like a cursor. A plan is not
   a place the mallet jumps to: the hand eases onto it (`track`), the hand
   carries momentum so it cannot reverse in one frame (`accel`), and the aim
   error is a slow continuous drift rather than a fresh dice roll every
   re-plan. Re-rolling the error was what made the old bot judder pixel by
   pixel: a new random offset every ~100 ms, applied instantly, is visually a
   vibration and no amount of skill tuning hides it.

   Difficulty is one number, `skill` (0..1), which drives all three. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.AHBot = factory(root.AHEngine);
}(typeof self !== 'undefined' ? self : this, function (AHEngine) {
'use strict';

const { W, H, PUCK_R, PAD_MAX_SPEED } = AHEngine.CONST;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/* Where the bot idles when the puck is not its problem: far enough forward to
   look willing, far enough back to cover the goal mouth. */
const HOME_Y = 30;
/* Above this the bot is committed to defending rather than attacking. */
const PANIC_Y = 16;
/* The adaptive band. The ceiling matters more than the floor: past roughly
   0.7 the bot stops conceding at all and the match stops being a match. */
const SKILL_MIN = 0.12;
const SKILL_MAX = 0.70;
/* How long the aim drift takes to forget where it was (seconds). Short enough
   to still be a mistake, long enough to never look like noise. */
const WANDER_TAU = 0.55;
/* The distance over which the mallet eases down onto its target (seconds of
   travel). Below this it is decelerating, above it is at full speed. */
const ARRIVE = 0.09;

/* Roughly normal, mean 0, sd 1 — three uniforms is plenty and needs no log. */
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 1.1547;
}

/* Per-skill behaviour. Everything a difficulty is allowed to change lives in
   this table, so "make it easier" is never a hunt through the logic. */
function profile(skill) {
  const s = clamp(skill, 0, 1);
  return {
    /* How long the bot sits on a stale plan before re-aiming (ms). */
    reactMs: 190 - 150 * s,
    /* Fraction of the engine's clamp speed it may use. */
    speed: 0.34 + 0.46 * s,
    /* Aim scatter in field units — the whole reason a beginner can score. */
    error: 15 - 12.5 * s,
    /* How far ahead it reads the puck (1 = perfect prediction). */
    read: 0.35 + 0.6 * s,
    /* Chance it simply does not commit to an attackable puck. */
    lazy: 0.36 - 0.34 * s,
    /* How quickly the hand eases onto a freshly made plan (1/s). */
    track: 6 + 8 * s,
    /* How quickly the hand can change the velocity it is already carrying
       (1/s). Low values read as a heavy, deliberate arm; high values as a
       sharp one. Nothing here is allowed to be instant. */
    accel: 8 + 13 * s,
  };
}

/* Fold a predicted x back inside the side walls, the way the puck itself
   will bounce on its way over. */
function reflectX(x) {
  const lo = PUCK_R, hi = W - PUCK_R;
  const span = hi - lo;
  if (span <= 0) return lo;
  let v = (x - lo) % (span * 2);
  if (v < 0) v += span * 2;
  return lo + (v > span ? span * 2 - v : v);
}

class Bot {
  /* `skill` 0..1. `adapt` lets the bot drift toward the player's level, which
     is what stops a first-timer being shut out and a good player being bored. */
  constructor(opts = {}) {
    this.baseSkill = clamp(opts.skill == null ? 0.34 : opts.skill, 0, 1);
    this.skill = this.baseSkill;
    this.adapt = opts.adapt !== false;
    this.p = profile(this.skill);
    this.waitMs = 0;
    /* The plan. */
    this.tx = W / 2;
    this.ty = HOME_Y;
    /* Where the hand is actually heading right now, easing toward the plan. */
    this.sx = W / 2;
    this.sy = HOME_Y;
    /* Carried momentum, field units per second. */
    this.vx = 0;
    this.vy = 0;
    /* The slow aim drift. */
    this.wx = 0;
    this.wy = 0;
    this.committed = false;
  }

  setSkill(v) {
    this.skill = clamp(v, 0, 1);
    this.p = profile(this.skill);
  }

  /* Called after every goal so the next rally is a fairer fight. Losing players
     get a gentler bot; a player running away with it gets a real one. */
  onGoal(botScored) {
    if (!this.adapt) return;
    // Down fast, up slow: frustration costs a player far more than boredom.
    // The band is deliberately narrow at the top — a bot good enough to shut
    // a rally down completely is not a better opponent, it is a wall, and a
    // wall is the least fun thing an air hockey table can be.
    this.setSkill(clamp(this.skill + (botScored ? -0.075 : 0.055), SKILL_MIN, SKILL_MAX));
  }

  reset() {
    this.waitMs = 0;
    this.committed = false;
    this.tx = this.sx = W / 2;
    this.ty = this.sy = HOME_Y;
    this.vx = this.vy = 0;
    this.wx = this.wy = 0;
  }

  /* One frame of thinking. Feeds the engine through the same door a finger
     uses, so nothing here can bend the rules. */
  think(game, dt) {
    const pad = game.padB;
    const k = game.puck;
    const r = pad.r;

    this.waitMs -= dt * 1000;
    if (this.waitMs <= 0) {
      this.waitMs = this.p.reactMs;
      this.plan(k, r);
    }

    // Aim error as a drift rather than a dice roll. An Ornstein-Uhlenbeck step
    // keeps the same long-run spread as the old per-plan scatter, but the
    // offset moves *between* frames instead of teleporting, so a wrong guess
    // looks like a misjudged reach and not like a twitch.
    const a = Math.exp(-dt / WANDER_TAU);
    const bleed = Math.sqrt(Math.max(0, 1 - a * a));
    this.wx = this.wx * a + gauss() * this.p.error * 0.55 * bleed;
    this.wy = this.wy * a + gauss() * this.p.error * 0.28 * bleed;

    // The hand eases onto a new plan instead of snapping to it.
    const g = 1 - Math.exp(-this.p.track * dt);
    this.sx += (this.tx - this.sx) * g;
    this.sy += (this.ty - this.sy) * g;

    const gx = clamp(this.sx + this.wx, r, W - r);
    const gy = clamp(this.sy + this.wy, r, H / 2 - r);

    // Steer toward that point: full speed while far, easing down over the last
    // stretch so the mallet arrives instead of slamming to a stop, and never
    // changing the velocity it already carries faster than `accel` allows.
    const vmax = PAD_MAX_SPEED * this.p.speed;
    const dx = gx - pad.x, dy = gy - pad.y;
    const d = Math.hypot(dx, dy);
    let wantX = 0, wantY = 0;
    if (d > 1e-4) {
      const want = Math.min(vmax, d / ARRIVE);
      wantX = (dx / d) * want;
      wantY = (dy / d) * want;
    }
    const b = 1 - Math.exp(-this.p.accel * dt);
    this.vx += (wantX - this.vx) * b;
    this.vy += (wantY - this.vy) * b;

    let nx = pad.x + this.vx * dt;
    let ny = pad.y + this.vy * dt;
    // A wall stops the arm; it does not store the push for later.
    const cx = clamp(nx, r, W - r), cy = clamp(ny, r, H / 2 - r);
    if (cx !== nx) this.vx = 0;
    if (cy !== ny) this.vy = 0;
    nx = cx; ny = cy;

    game.setInput('b', nx, ny);
  }

  /* Decide where the mallet wants to be, and remember it until the reaction
     delay is up. */
  plan(k, r) {
    const comingAtMe = k.vy < -2;
    const inMyHalf = k.y < H / 2;

    // A puck bearing down on the goal is the only thing that matters.
    if (comingAtMe && (inMyHalf || k.y < H * 0.62)) {
      const tt = (HOME_Y - k.y) / k.vy;              // vy is negative here
      const lead = clamp(tt, 0, 1.4) * this.p.read;
      const px = reflectX(k.x + k.vx * lead);
      // Deep in its own zone the bot stops trying to be clever and just gets
      // its body in the way.
      const depth = k.y < PANIC_Y * 2 ? clamp(k.y - r, r, H / 2 - r) : HOME_Y;
      this.tx = clamp(px, r, W - r);
      this.ty = clamp(depth, r, H / 2 - r);
      this.committed = true;
      return;
    }

    // A loose puck in reach is a chance to attack — sometimes.
    if (k.y > PANIC_Y && k.y < H / 2) {
      if (!this.committed && Math.random() < this.p.lazy) {
        this.idle(k, r);
        return;
      }
      // Line up behind the puck, on the axis that points at the far goal, so
      // the strike sends it down the rink rather than sideways.
      const gx = W / 2, gy = H;
      let ax = k.x - gx, ay = k.y - gy;
      const ad = Math.hypot(ax, ay) || 1;
      ax /= ad; ay /= ad;
      const back = r + PUCK_R * 0.85;
      this.tx = clamp(k.x + ax * back, r, W - r);
      this.ty = clamp(k.y + ay * back, r, H / 2 - r);
      this.committed = true;
      return;
    }

    this.idle(k, r);
  }

  /* Nothing to do: shadow the puck's column from the resting line. */
  idle(k, r) {
    this.committed = false;
    // Only half-follow, so the bot keeps the middle honest instead of hugging
    // a wall the puck happens to be near.
    const want = W / 2 + (k.x - W / 2) * 0.62;
    this.tx = clamp(want, r, W - r);
    this.ty = clamp(HOME_Y, r, H / 2 - r);
  }
}

return { Bot, profile };
}));
