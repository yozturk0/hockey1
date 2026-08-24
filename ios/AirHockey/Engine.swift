import Foundation

/// Air Hockey physics. This is a direct port of `web/engine.js` and must stay
/// behaviourally identical to it: the server runs the JS copy for online play,
/// this copy runs the on-device two-player mode.
enum Field {
    static let W: Double = 100
    static let H: Double = 200
    static let puckR: Double = 3.4
    static let padR: Double = 5.6             // default mallet radius; per-game overridable
    static let padRMin: Double = 3.4
    static let padRMax: Double = 8.2
    static let goalW: Double = 34
    static let gx0: Double = (W - goalW) / 2
    static let gx1: Double = (W + goalW) / 2
    static let postR: Double = 1.5

    static let puckMax: Double = 255          // a smash crosses the rink in ~0.8 s
    static let puckMinAfterHit: Double = 30
    static let padMaxSpeed: Double = 420
    static let friction: Double = 0.94
    static let wallRest: Double = 0.93
    static let padRest: Double = 0.88         // restitution of a *passive* mallet
    static let smashRef: Double = 150         // mallet speed where the bonus tops out
    static let smashBonus: Double = 0.45      // extra restitution on a full-force strike
    static let padTransfer: Double = 0.22     // mallet speed injected along the normal
    static let padDrag: Double = 0.12         // ...and sideways, so a brush curls the puck

    /// One countdown length for every restart - kickoff, goals and half time
    /// all run the same 3 - 2 - 1. 2.5 s is long enough to read all three
    /// digits and short enough that nobody drums their fingers.
    static let countdownMs: Double = 2500
    static let countdownSteps = 3
    static let stallLimit: Double = 5000
}

/// "Sansli" sprinkles small, short-lived twists over an otherwise normal
/// match. Everything here is deliberately mild: a twist should change how a
/// rally feels, never decide who wins it.
enum GameMode: String {
    case classic = "klasik"
    case lucky = "sansli"

    static func from(_ raw: String?) -> GameMode {
        GameMode(rawValue: raw ?? "") ?? .classic
    }
}

enum Lucky {
    static let firstMs: Double = 4500     // first twist of a rally
    static let gapMs: Double = 6500       // ...then one every 6.5 - 9 s
    static let jitterMs: Double = 2500
    static let durMs: Double = 6000       // how long one twist lasts
    static let grow: Double = 1.18        // +18 % mallet
    static let shrink: Double = 0.85      // -15 % mallet
    static let iceFast: Double = 0.972    // slick ice: the puck keeps rolling
    static let iceSlow: Double = 0.900    // sticky ice: it dies sooner
}

/// Effect codes carried by a type-3 event.
enum FX {
    static let grow = 0, shrink = 1, fast = 2, slow = 3
}

/// Which digit a countdown of `ms` should be showing. Always 3 -> 2 -> 1,
/// whatever the countdown's total length happens to be.
func countdownDigit(_ ms: Double, total: Double = Field.countdownMs) -> Int {
    let step = total / Double(Field.countdownSteps)
    return Int(clampd((ms / step).rounded(.up), 1, Double(Field.countdownSteps)))
}

enum GameState: Int {
    case lobby = 0, countdown = 1, playing = 2, paused = 3, over = 4, halftime = 5
}

/// 0 = paddle hit, 1 = wall/post, 2 = goal
struct GameEvent {
    let type: Int
    let x: Double
    let y: Double
    let intensity: Double
}

struct Vec { var x: Double; var y: Double }

final class Paddle {
    var x: Double, y: Double
    var tx: Double, ty: Double
    var vx: Double = 0, vy: Double = 0
    /// Live radius. In lucky mode it drifts away from the match's base size.
    var r: Double
    var scale: Double = 1
    var fxMs: Double = 0
    init(x: Double, y: Double, r: Double = Field.padR) {
        self.x = x; self.y = y; self.tx = x; self.ty = y; self.r = r
    }
}

@inline(__always) func clampd(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    v < lo ? lo : (v > hi ? hi : v)
}

final class Engine {
    /// Half time lands when the leader reaches half the winning score. Short
    /// matches (1-2 goals) are over before a break would make any sense.
    static func halftimeFor(_ target: Int) -> Int {
        target >= 3 ? Int((Double(target) / 2).rounded(.up)) : 0
    }

    var target: Int
    /// Base mallet radius for *this* match; the menu lets players pick it.
    let padR: Double
    private(set) var mode: GameMode
    /// Score at which the break happens, or 0 when there is no break.
    private(set) var halfAt: Int
    private(set) var halfDone = false
    var scoreA = 0
    var scoreB = 0
    var state: GameState = .lobby
    var countdown: Double = 0
    var winner: String?
    var events: [GameEvent] = []

    var puck = Vec(x: Field.W / 2, y: Field.H / 2)
    var puckV = Vec(x: 0, y: 0)
    var padA: Paddle
    var padB: Paddle

    private var stallMs: Double = 0
    private var luckyMs = Lucky.firstMs
    private var luckyBag: [(String, Int)] = []
    private var iceMs: Double = 0
    private var iceFriction = Field.friction

    init(target: Int, padR: Double = Field.padR, halftime: Bool = false,
         mode: GameMode = .classic) {
        self.target = target
        let r = clampd(padR, Field.padRMin, Field.padRMax)
        self.padR = r
        self.mode = mode
        self.halfAt = halftime ? Engine.halftimeFor(target) : 0
        padA = Paddle(x: Field.W / 2, y: Field.H * 0.78, r: r)
        padB = Paddle(x: Field.W / 2, y: Field.H * 0.22, r: r)
        resetPuck(dir: Bool.random() ? 1 : -1)
    }

    func resetPuck(dir: Double) {
        puck = Vec(x: Field.W / 2, y: Field.H / 2)
        // A wide face-off angle keeps the puck from flying straight into the
        // defender who just reset to centre.
        puckV = Vec(x: (Bool.random() ? -1 : 1) * (16 + Double.random(in: 0..<30)),
                    y: dir * (48 + Double.random(in: 0..<22)))
        stallMs = 0
    }

    func resetPaddles() {
        padA = Paddle(x: Field.W / 2, y: Field.H * 0.78, r: padR)
        padB = Paddle(x: Field.W / 2, y: Field.H * 0.22, r: padR)
    }

    /// Every rally starts from a clean slate, so a twist can never carry a
    /// scoring advantage over into the next face-off.
    func clearLucky() {
        iceMs = 0
        iceFriction = Field.friction
        luckyMs = Lucky.firstMs
        for p in [padA, padB] { p.scale = 1; p.r = padR; p.fxMs = 0 }
    }

    /// Called when both players are present, and after every goal.
    func startCountdown(_ ms: Double = Field.countdownMs) {
        state = .countdown
        countdown = ms
        resetPaddles()
        clearLucky()
    }

    /// Both players are back from the break; kick the second half off.
    func resumeHalftime() {
        if state == .halftime { startCountdown() }
    }

    func restart() {
        scoreA = 0; scoreB = 0; winner = nil
        halfDone = false
        resetPuck(dir: Bool.random() ? 1 : -1)
        startCountdown()
    }

    func setInput(side: String, x: Double, y: Double) {
        // Mallets are locked while the countdown runs; accepting input here
        // would let a player creep across the rink before the puck is live.
        guard state == .playing else { return }
        let p = side == "a" ? padA : padB
        let r = p.r
        p.tx = clampd(x, r, Field.W - r)
        p.ty = side == "a"
            ? clampd(y, Field.H / 2 + r, Field.H - r)
            : clampd(y, r, Field.H / 2 - r)
    }

    private func ev(_ t: Int, _ x: Double, _ y: Double, _ i: Double) {
        if events.count < 8 { events.append(GameEvent(type: t, x: x, y: y, intensity: i)) }
    }

    func clearEvents() { events.removeAll(keepingCapacity: true) }

    func step(dt: Double) {
        if state == .countdown {
            countdown -= dt * 1000
            // Both mallets are frozen on their spots. Letting them slide about
            // during "3 - 2 - 1" reads as lag, and a mallet already at full
            // tilt when the puck goes live is a free shot.
            holdPaddle(padA)
            holdPaddle(padB)
            if countdown <= 0 { countdown = 0; state = .playing }
            return
        }
        guard state == .playing else { return }
        if mode == .lucky { luckyStep(dt) }
        movePaddle(padA, dt)
        movePaddle(padB, dt)
        movePuck(dt)
    }

    private func holdPaddle(_ p: Paddle) {
        p.tx = p.x; p.ty = p.y
        p.vx = 0; p.vy = 0
    }

    // MARK: - lucky mode

    private func luckyStep(_ dt: Double) {
        let ms = dt * 1000

        for p in [padA, padB] where p.fxMs > 0 {
            p.fxMs -= ms
            if p.fxMs <= 0 { p.fxMs = 0; scalePad(p, 1) }
        }
        if iceMs > 0 {
            iceMs -= ms
            if iceMs <= 0 { iceMs = 0; iceFriction = Field.friction }
        }

        luckyMs -= ms
        if luckyMs <= 0 {
            luckyMs = Lucky.gapMs + Double.random(in: 0..<Lucky.jitterMs)
            rollLucky()
        }
    }

    /// Roughly one twist in three re-surfaces the ice, which hits both players
    /// equally. The rest are personal and come out of a shuffled bag, so over
    /// every four of them each player gets one bigger and one smaller mallet.
    func rollLucky() {
        if Double.random(in: 0..<1) < 0.34 {
            let fast = Bool.random()
            iceFriction = fast ? Lucky.iceFast : Lucky.iceSlow
            iceMs = Lucky.durMs
            ev(3, puck.x, puck.y, Double(fast ? FX.fast : FX.slow))
            return
        }

        if luckyBag.isEmpty {
            luckyBag = [("a", FX.grow), ("a", FX.shrink),
                        ("b", FX.grow), ("b", FX.shrink)].shuffled()
        }
        let (side, kind) = luckyBag.removeLast()
        let p = side == "a" ? padA : padB
        scalePad(p, kind == FX.grow ? Lucky.grow : Lucky.shrink)
        p.fxMs = Lucky.durMs
        ev(3, p.x, p.y, Double(kind))
    }

    /// Resize a mallet and pull it back inside its own half, since the legal
    /// area shrinks and grows with the radius.
    func scalePad(_ p: Paddle, _ scale: Double) {
        p.scale = scale
        p.r = clampd(padR * scale, Field.padRMin, Field.padRMax)
        let isA = p === padA
        let r = p.r
        let lo = isA ? Field.H / 2 + r : r
        let hi = isA ? Field.H - r : Field.H / 2 - r
        p.x = clampd(p.x, r, Field.W - r)
        p.y = clampd(p.y, lo, hi)
        p.tx = clampd(p.tx, r, Field.W - r)
        p.ty = clampd(p.ty, lo, hi)
    }

    private func frictionNow() -> Double { iceMs > 0 ? iceFriction : Field.friction }

    private func movePaddle(_ p: Paddle, _ dt: Double) {
        let dx = p.tx - p.x, dy = p.ty - p.y
        let d = (dx * dx + dy * dy).squareRoot()
        let maxStep = Field.padMaxSpeed * dt
        var nx = p.tx, ny = p.ty
        if d > maxStep && d != 0 {
            nx = p.x + (dx / d) * maxStep
            ny = p.y + (dy / d) * maxStep
        }
        p.vx = (nx - p.x) / dt
        p.vy = (ny - p.y) / dt
        p.x = nx; p.y = ny
    }

    private func movePuck(_ dt: Double) {
        let speed = (puckV.x * puckV.x + puckV.y * puckV.y).squareRoot()
        let steps = Int(clampd((speed * dt / (Field.puckR * 0.7)).rounded(.up), 1, 12))
        let sdt = dt / Double(steps)

        for _ in 0..<steps {
            puck.x += puckV.x * sdt
            puck.y += puckV.y * sdt

            collidePaddle(padA)
            collidePaddle(padB)

            if puck.x < Field.puckR {
                puck.x = Field.puckR
                puckV.x = abs(puckV.x) * Field.wallRest
                ev(1, puck.x, puck.y, abs(puckV.x))
            } else if puck.x > Field.W - Field.puckR {
                puck.x = Field.W - Field.puckR
                puckV.x = -abs(puckV.x) * Field.wallRest
                ev(1, puck.x, puck.y, abs(puckV.x))
            }

            let inMouth = puck.x > Field.gx0 && puck.x < Field.gx1

            if puck.y < Field.puckR && !inMouth {
                puck.y = Field.puckR
                puckV.y = abs(puckV.y) * Field.wallRest
                ev(1, puck.x, puck.y, abs(puckV.y))
            }
            if puck.y > Field.H - Field.puckR && !inMouth {
                puck.y = Field.H - Field.puckR
                puckV.y = -abs(puckV.y) * Field.wallRest
                ev(1, puck.x, puck.y, abs(puckV.y))
            }

            collidePost(Field.gx0, 0)
            collidePost(Field.gx1, 0)
            collidePost(Field.gx0, Field.H)
            collidePost(Field.gx1, Field.H)

            if puck.y < 0 { score("a"); return }
            if puck.y > Field.H { score("b"); return }
        }

        let f = pow(frictionNow(), dt)
        puckV.x *= f; puckV.y *= f
        let sp = (puckV.x * puckV.x + puckV.y * puckV.y).squareRoot()
        if sp > Field.puckMax {
            puckV.x = puckV.x / sp * Field.puckMax
            puckV.y = puckV.y / sp * Field.puckMax
        }

        // Anti-stall: a puck parked in a corner would deadlock the match.
        if sp < 7 {
            stallMs += dt * 1000
            if stallMs > Field.stallLimit {
                stallMs = 0
                let dir: Double = puck.y < Field.H / 2 ? 1 : -1
                puckV.x = Double.random(in: -20...20)
                puckV.y = dir * 55
            }
        } else {
            stallMs = 0
        }
    }

    private func collidePost(_ px: Double, _ py: Double) {
        let dx = puck.x - px, dy = puck.y - py
        let dist = (dx * dx + dy * dy).squareRoot()
        let minD = Field.puckR + Field.postR
        guard dist < minD, dist != 0 else { return }
        let nx = dx / dist, ny = dy / dist
        puck.x = px + nx * minD
        puck.y = py + ny * minD
        let vn = puckV.x * nx + puckV.y * ny
        if vn < 0 {
            puckV.x -= nx * vn * (1 + Field.wallRest)
            puckV.y -= ny * vn * (1 + Field.wallRest)
        }
        ev(1, puck.x, puck.y, abs(vn))
    }

    private func collidePaddle(_ p: Paddle) {
        let dx = puck.x - p.x, dy = puck.y - p.y
        var dist = (dx * dx + dy * dy).squareRoot()
        let minD = Field.puckR + p.r
        guard dist < minD else { return }
        if dist == 0 { dist = 0.0001 }

        let nx = dx / dist, ny = dy / dist
        puck.x = p.x + nx * (minD + 0.05)
        puck.y = p.y + ny * (minD + 0.05)

        // How hard the mallet is driving *into* the puck along the contact normal.
        // Only a real swing earns the bonus - parking the mallet in front of a
        // fast puck must stay a block, not a free rocket.
        let swing = max(0, p.vx * nx + p.vy * ny)
        let punch = clampd(swing / Field.smashRef, 0, 1)

        let rvx = puckV.x - p.vx, rvy = puckV.y - p.vy
        let vn = rvx * nx + rvy * ny
        if vn < 0 {
            let rest = Field.padRest + Field.smashBonus * punch
            puckV.x -= nx * vn * (1 + rest)
            puckV.y -= ny * vn * (1 + rest)
        }

        // Inject the paddle's own motion - this is what makes a smash feel like a
        // smash. Straight-on drive counts far more than a sideways brush.
        puckV.x += nx * swing * Field.padTransfer + (p.vx - nx * swing) * Field.padDrag
        puckV.y += ny * swing * Field.padTransfer + (p.vy - ny * swing) * Field.padDrag

        var sp = (puckV.x * puckV.x + puckV.y * puckV.y).squareRoot()
        if sp < Field.puckMinAfterHit {
            let s = Field.puckMinAfterHit / (sp == 0 ? 1 : sp)
            puckV.x = (puckV.x == 0 ? nx : puckV.x) * s
            puckV.y = (puckV.y == 0 ? ny : puckV.y) * s
            sp = Field.puckMinAfterHit
        }
        if sp > Field.puckMax {
            puckV.x = puckV.x / sp * Field.puckMax
            puckV.y = puckV.y / sp * Field.puckMax
            sp = Field.puckMax
        }

        stallMs = 0
        ev(0, puck.x, puck.y, sp)
    }

    private func score(_ side: String) {
        if side == "a" { scoreA += 1 } else { scoreB += 1 }
        ev(2, Field.W / 2, side == "a" ? 0 : Field.H, side == "a" ? 0 : 1)

        if scoreA >= target || scoreB >= target {
            winner = scoreA > scoreB ? "a" : "b"
            state = .over
            resetPaddles()
            clearLucky()
            puck = Vec(x: Field.W / 2, y: Field.H / 2)
            puckV = Vec(x: 0, y: 0)
            return
        }
        // Conceding side gets the puck: A defends y=H, B defends y=0.
        resetPuck(dir: side == "a" ? -1 : 1)

        // Half time: freeze here until both players say they are ready.
        if halfAt > 0 && !halfDone && max(scoreA, scoreB) >= halfAt {
            halfDone = true
            state = .halftime
            resetPaddles()
            clearLucky()
            return
        }

        startCountdown()
    }
}
