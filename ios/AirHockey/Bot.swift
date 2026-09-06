import Foundation

/// Air Hockey — computer opponent. This is the Swift twin of `web/bot.js` and
/// must stay behaviourally identical to it: the same numbers, the same three
/// decisions, the same adaptive band.
///
/// The bot drives paddle B (the top half) of an ordinary `Engine`. It never
/// touches the physics: it only ever says "I want my mallet here", exactly like
/// a finger does, so a rally against it is governed by the same rules as a
/// rally against a person.
///
/// Three things keep it feeling human rather than mechanical:
///
///   * it reacts on a delay, and only re-aims when that delay is up;
///   * it aims at where it *believes* the puck will be, and that belief is
///     deliberately imperfect;
///   * it cannot move its mallet at the engine's full clamp speed.
///
/// The mallet itself is driven like an arm, not like a cursor: it eases onto a
/// new plan (`track`), it carries momentum so it cannot reverse inside one
/// frame (`accel`), and the aim error drifts continuously instead of being
/// re-rolled at every re-plan. The re-roll was what made the old bot judder
/// pixel by pixel.
///
/// Difficulty is one number, `skill` (0..1), which drives all three.
final class Bot {

    /// Where the bot idles when the puck is not its problem: far enough
    /// forward to look willing, far enough back to cover the goal mouth.
    private static let homeY: Double = 30
    /// Above this the bot is committed to defending rather than attacking.
    private static let panicY: Double = 16
    /// The adaptive band. The ceiling matters more than the floor: past roughly
    /// 0.7 the bot stops conceding at all and the match stops being a match.
    static let skillMin: Double = 0.12
    static let skillMax: Double = 0.70
    /// How long the aim drift takes to forget where it was (seconds).
    private static let wanderTau: Double = 0.55
    /// The stretch over which the mallet eases down onto its target (seconds
    /// of travel).
    private static let arrive: Double = 0.09

    /// Roughly normal, mean 0, sd 1.
    private static func gauss() -> Double {
        (Double.random(in: 0..<1) + Double.random(in: 0..<1)
            + Double.random(in: 0..<1) - 1.5) * 1.1547
    }

    /// Everything a difficulty is allowed to change lives here, so "make it
    /// easier" is never a hunt through the logic.
    struct Profile {
        /// How long the bot sits on a stale plan before re-aiming (ms).
        let reactMs: Double
        /// Fraction of the engine's clamp speed it may use.
        let speed: Double
        /// Aim scatter in field units — the whole reason a beginner can score.
        let error: Double
        /// How far ahead it reads the puck (1 = perfect prediction).
        let read: Double
        /// Chance it simply does not commit to an attackable puck.
        let lazy: Double
        /// How quickly the hand eases onto a freshly made plan (1/s).
        let track: Double
        /// How quickly the hand can change the velocity it already carries
        /// (1/s). Nothing here is allowed to be instant.
        let accel: Double

        init(skill: Double) {
            let s = clampd(skill, 0, 1)
            reactMs = 190 - 150 * s
            speed = 0.34 + 0.46 * s
            error = 15 - 12.5 * s
            read = 0.35 + 0.6 * s
            lazy = 0.36 - 0.34 * s
            track = 6 + 8 * s
            accel = 8 + 13 * s
        }
    }

    private(set) var skill: Double
    private var p: Profile
    private let adapt: Bool
    private var waitMs: Double = 0
    /// The plan.
    private var tx: Double = Field.W / 2
    private var ty: Double = Bot.homeY
    /// Where the hand is actually heading right now, easing toward the plan.
    private var sx: Double = Field.W / 2
    private var sy: Double = Bot.homeY
    /// Carried momentum, field units per second.
    private var vx: Double = 0
    private var vy: Double = 0
    /// The slow aim drift.
    private var wx: Double = 0
    private var wy: Double = 0
    private var committed = false

    /// `skill` 0..1. `adapt` lets the bot drift toward the player's level,
    /// which is what stops a first-timer being shut out and a good player
    /// being bored.
    init(skill: Double = 0.34, adapt: Bool = true) {
        self.skill = clampd(skill, 0, 1)
        self.p = Profile(skill: self.skill)
        self.adapt = adapt
    }

    func setSkill(_ v: Double) {
        skill = clampd(v, 0, 1)
        p = Profile(skill: skill)
    }

    /// Called after every goal so the next rally is a fairer fight. Losing
    /// players get a gentler bot; a player running away with it gets a real
    /// one. Down fast, up slow: frustration costs a player far more than
    /// boredom. The band is deliberately narrow at the top — a bot good enough
    /// to shut a rally down completely is not a better opponent, it is a wall,
    /// and a wall is the least fun thing an air hockey table can be.
    func onGoal(botScored: Bool) {
        guard adapt else { return }
        setSkill(clampd(skill + (botScored ? -0.075 : 0.055), Bot.skillMin, Bot.skillMax))
    }

    func reset() {
        waitMs = 0
        committed = false
        tx = Field.W / 2; sx = tx
        ty = Bot.homeY;   sy = ty
        vx = 0; vy = 0
        wx = 0; wy = 0
    }

    /// One frame of thinking. Feeds the engine through the same door a finger
    /// uses, so nothing here can bend the rules.
    func think(_ game: Engine, dt: Double) {
        let pad = game.padB
        let k = game.puck
        let r = pad.r

        waitMs -= dt * 1000
        if waitMs <= 0 {
            waitMs = p.reactMs
            plan(k, game.puckV, r)
        }

        // Aim error as a drift rather than a dice roll. The long-run spread
        // is the old scatter's, but the offset moves *between* frames instead
        // of teleporting, so a wrong guess reads as a misjudged reach.
        let a = exp(-dt / Bot.wanderTau)
        let bleed = max(0, 1 - a * a).squareRoot()
        wx = wx * a + Bot.gauss() * p.error * 0.55 * bleed
        wy = wy * a + Bot.gauss() * p.error * 0.28 * bleed

        // The hand eases onto a new plan instead of snapping to it.
        let g = 1 - exp(-p.track * dt)
        sx += (tx - sx) * g
        sy += (ty - sy) * g

        let gx = clampd(sx + wx, r, Field.W - r)
        let gy = clampd(sy + wy, r, Field.H / 2 - r)

        // Steer toward that point: full speed while far, easing down over the
        // last stretch, and never changing the velocity it already carries
        // faster than `accel` allows.
        let vmax = Field.padMaxSpeed * p.speed
        let dx = gx - pad.x, dy = gy - pad.y
        let d = (dx * dx + dy * dy).squareRoot()
        var wantX = 0.0, wantY = 0.0
        if d > 1e-4 {
            let want = min(vmax, d / Bot.arrive)
            wantX = dx / d * want
            wantY = dy / d * want
        }
        let b = 1 - exp(-p.accel * dt)
        vx += (wantX - vx) * b
        vy += (wantY - vy) * b

        // A wall stops the arm; it does not store the push for later.
        let rawX = pad.x + vx * dt, rawY = pad.y + vy * dt
        let nx = clampd(rawX, r, Field.W - r)
        let ny = clampd(rawY, r, Field.H / 2 - r)
        if nx != rawX { vx = 0 }
        if ny != rawY { vy = 0 }

        game.setInput(side: "b", x: nx, y: ny)
    }

    /// Fold a predicted x back inside the side walls, the way the puck itself
    /// will bounce on its way over.
    private func reflectX(_ x: Double) -> Double {
        let lo = Field.puckR, hi = Field.W - Field.puckR
        let span = hi - lo
        guard span > 0 else { return lo }
        var v = (x - lo).truncatingRemainder(dividingBy: span * 2)
        if v < 0 { v += span * 2 }
        return lo + (v > span ? span * 2 - v : v)
    }

    /// Decide where the mallet wants to be, and remember it until the reaction
    /// delay is up.
    private func plan(_ k: Vec, _ kv: Vec, _ r: Double) {
        let comingAtMe = kv.y < -2
        let inMyHalf = k.y < Field.H / 2

        // A puck bearing down on the goal is the only thing that matters.
        if comingAtMe && (inMyHalf || k.y < Field.H * 0.62) {
            let tt = (Bot.homeY - k.y) / kv.y          // vy is negative here
            let lead = clampd(tt, 0, 1.4) * p.read
            let px = reflectX(k.x + kv.x * lead)
            // Deep in its own zone the bot stops trying to be clever and just
            // gets its body in the way.
            let depth = k.y < Bot.panicY * 2 ? clampd(k.y - r, r, Field.H / 2 - r) : Bot.homeY
            tx = clampd(px, r, Field.W - r)
            ty = clampd(depth, r, Field.H / 2 - r)
            committed = true
            return
        }

        // A loose puck in reach is a chance to attack — sometimes.
        if k.y > Bot.panicY && k.y < Field.H / 2 {
            if !committed && Double.random(in: 0..<1) < p.lazy {
                idle(k, r)
                return
            }
            // Line up behind the puck, on the axis that points at the far
            // goal, so the strike sends it down the rink rather than sideways.
            var ax = k.x - Field.W / 2, ay = k.y - Field.H
            let ad = (ax * ax + ay * ay).squareRoot()
            let n = ad == 0 ? 1 : ad
            ax /= n; ay /= n
            let back = r + Field.puckR * 0.85
            tx = clampd(k.x + ax * back, r, Field.W - r)
            ty = clampd(k.y + ay * back, r, Field.H / 2 - r)
            committed = true
            return
        }

        idle(k, r)
    }

    /// Nothing to do: shadow the puck's column from the resting line. Only
    /// half-follow, so the bot keeps the middle honest instead of hugging a
    /// wall the puck happens to be near.
    private func idle(_ k: Vec, _ r: Double) {
        committed = false
        let want = Field.W / 2 + (k.x - Field.W / 2) * 0.62
        tx = clampd(want, r, Field.W - r)
        ty = clampd(Bot.homeY, r, Field.H / 2 - r)
    }
}
