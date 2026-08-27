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
    this.tx = W / 2;
    this.ty = HOME_Y;
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
    this.tx = W / 2;
    this.ty = HOME_Y;
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

    // Move toward the current plan at this difficulty's own top speed, rather
    // than handing the engine a target it would cover in a single frame.
    const lim = PAD_MAX_SPEED * this.p.speed * dt;
    const dx = this.tx - pad.x, dy = this.ty - pad.y;
    const d = Math.hypot(dx, dy);
    let nx, ny;
    if (d <= lim || d === 0) { nx = this.tx; ny = this.ty; }
    else { nx = pad.x + (dx / d) * lim; ny = pad.y + (dy / d) * lim; }

    game.setInput('b', clamp(nx, r, W - r), clamp(ny, r, H / 2 - r));
  }

  /* Decide where the mallet wants to be, and remember it until the reaction
     delay is up. */
  plan(k, r) {
    const scatter = () => (Math.random() - 0.5) * 2 * this.p.error;
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
      this.tx = clamp(px + scatter(), r, W - r);
      this.ty = clamp(depth + scatter() * 0.3, r, H / 2 - r);
      this.committed = true;
      return;
    }

    // A loose puck in reach is a chance to attack — sometimes.
    if (k.y > PANIC_Y && k.y < H / 2) {
      if (!this.committed && Math.random() < this.p.lazy) {
        this.idle(k, r, scatter);
        return;
      }
      // Line up behind the puck, on the axis that points at the far goal, so
      // the strike sends it down the rink rather than sideways.
      const gx = W / 2, gy = H;
      let ax = k.x - gx, ay = k.y - gy;
      const ad = Math.hypot(ax, ay) || 1;
      ax /= ad; ay /= ad;
      const back = r + PUCK_R * 0.85;
      this.tx = clamp(k.x + ax * back + scatter() * 0.6, r, W - r);
      this.ty = clamp(k.y + ay * back + scatter() * 0.4, r, H / 2 - r);
      this.committed = true;
      return;
    }

    this.idle(k, r, scatter);
  }

  /* Nothing to do: shadow the puck's column from the resting line. */
  idle(k, r, scatter) {
    this.committed = false;
    // Only half-follow, so the bot keeps the middle honest instead of hugging
    // a wall the puck happens to be near.
    const want = W / 2 + (k.x - W / 2) * 0.62;
    this.tx = clamp(want + scatter() * 0.5, r, W - r);
    this.ty = clamp(HOME_Y, r, H / 2 - r);
  }
}

return { Bot, profile };
}));
