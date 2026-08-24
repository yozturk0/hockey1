import Foundation

/// Air Hockey physics. This is a direct port of `web/engine.js` and must stay
/// behaviourally identical to it: the server runs the JS copy for online play,
/// this copy runs the on-device two-player mode.
enum Field {
    static let W: Double = 100
    static let H: Double = 200
    static let puckR: Double = 3.4
    static let padR: Double = 5.6
    static let goalW: Double = 34
    static let gx0: Double = (W - goalW) / 2
    static let gx1: Double = (W + goalW) / 2
    static let postR: Double = 1.5

    static let puckMax: Double = 340          // a smash crosses the rink in ~0.6 s
    static let puckMinAfterHit: Double = 40
    static let padMaxSpeed: Double = 420
    static let friction: Double = 0.94
    static let wallRest: Double = 0.93
    static let padRest: Double = 0.96         // restitution of a *passive* mallet
    static let smashRef: Double = 190         // mallet speed where the bonus tops out
    static let smashBonus: Double = 0.62      // extra restitution on a full-force strike
    static let padTransfer: Double = 0.30     // mallet speed injected along the normal
    static let padDrag: Double = 0.16         // ...and sideways, so a brush curls the puck

    static let countdownStart: Double = 3000
    static let countdownGoal: Double = 1600
    static let stallLimit: Double = 5000
}

enum GameState: Int {
    case lobby = 0, countdown = 1, playing = 2, paused = 3, over = 4
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
    init(x: Double, y: Double) { self.x = x; self.y = y; self.tx = x; self.ty = y }
}

@inline(__always) func clampd(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    v < lo ? lo : (v > hi ? hi : v)
}

final class Engine {
    var target: Int
    var scoreA = 0
    var scoreB = 0
    var state: GameState = .lobby
    var countdown: Double = 0
    var winner: String?
    var events: [GameEvent] = []

    var puck = Vec(x: Field.W / 2, y: Field.H / 2)
    var puckV = Vec(x: 0, y: 0)
    var padA = Paddle(x: Field.W / 2, y: Field.H * 0.78)
    var padB = Paddle(x: Field.W / 2, y: Field.H * 0.22)

    private var stallMs: Double = 0

    init(target: Int) {
        self.target = target
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
        padA = Paddle(x: Field.W / 2, y: Field.H * 0.78)
        padB = Paddle(x: Field.W / 2, y: Field.H * 0.22)
    }

    func startCountdown(_ ms: Double = Field.countdownStart) {
        state = .countdown
        countdown = ms
    }

    func restart() {
        scoreA = 0; scoreB = 0; winner = nil
        resetPaddles()
        resetPuck(dir: Bool.random() ? 1 : -1)
        startCountdown()
    }

    func setInput(side: String, x: Double, y: Double) {
        let p = side == "a" ? padA : padB
        p.tx = clampd(x, Field.padR, Field.W - Field.padR)
        p.ty = side == "a"
            ? clampd(y, Field.H / 2 + Field.padR, Field.H - Field.padR)
            : clampd(y, Field.padR, Field.H / 2 - Field.padR)
    }

    private func ev(_ t: Int, _ x: Double, _ y: Double, _ i: Double) {
        if events.count < 8 { events.append(GameEvent(type: t, x: x, y: y, intensity: i)) }
    }

    func clearEvents() { events.removeAll(keepingCapacity: true) }

    func step(dt: Double) {
        if state == .countdown {
            countdown -= dt * 1000
            movePaddle(padA, dt)
            movePaddle(padB, dt)
            if countdown <= 0 { countdown = 0; state = .playing }
            return
        }
        guard state == .playing else { return }
        movePaddle(padA, dt)
        movePaddle(padB, dt)
        movePuck(dt)
    }

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

        let f = pow(Field.friction, dt)
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
        let minD = Field.puckR + Field.padR
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
        resetPaddles()

        if scoreA >= target || scoreB >= target {
            winner = scoreA > scoreB ? "a" : "b"
            state = .over
            puck = Vec(x: Field.W / 2, y: Field.H / 2)
            puckV = Vec(x: 0, y: 0)
            return
        }
        // Conceding side gets the puck: A defends y=H, B defends y=0.
        resetPuck(dir: side == "a" ? -1 : 1)
        startCountdown(Field.countdownGoal)
    }
}
