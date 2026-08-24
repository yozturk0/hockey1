// xcode: set sdk=iOS

import SwiftUI
import Combine

enum Screen { case menu, online, lobby, local, game }
enum Mode { case none, online, local }

/// Per-frame render state. Deliberately NOT @Published: it changes 60 times a
/// second and the Canvas reads it directly, so publishing would thrash SwiftUI.
final class World {
    var puck = Vec(x: Field.W / 2, y: Field.H / 2)
    var me   = Vec(x: Field.W / 2, y: Field.H * 0.78)
    var foe  = Vec(x: Field.W / 2, y: Field.H * 0.22)
    var trail: [Vec] = []
    /// The motion beam is tinted by the mallet that last struck the puck.
    var trailTint: Color?
    var shake: Double = 0

    /// My paddle, simulated locally so my own finger never feels laggy.
    var myPad = Paddle(x: Field.W / 2, y: Field.H * 0.78)
    /// Local mode only: the top player's paddle.
    var foePad = Paddle(x: Field.W / 2, y: Field.H * 0.22)

    func reset() {
        puck = Vec(x: Field.W / 2, y: Field.H / 2)
        me = Vec(x: Field.W / 2, y: Field.H * 0.78)
        foe = Vec(x: Field.W / 2, y: Field.H * 0.22)
        myPad = Paddle(x: Field.W / 2, y: Field.H * 0.78)
        foePad = Paddle(x: Field.W / 2, y: Field.H * 0.22)
        trail.removeAll(keepingCapacity: true)
        trailTint = nil
        shake = 0
    }
}

@MainActor
final class GameModel: ObservableObject, NetDelegate {

    // Navigation & lobby
    @Published var screen: Screen = .menu
    @Published var mode: Mode = .none
    @Published var code = "----"
    @Published var joinCode = ""
    @Published var target = 7
    @Published var pendingTarget = 7
    @Published var localTarget = 7
    @Published var mySide = "a"
    @Published var myName = UserDefaults.standard.string(forKey: "ah_name") ?? "Oyuncu"
    @Published var foeName = "Rakip"
    @Published var foePresent = false

    // Live match
    @Published var scoreMe = 0
    @Published var scoreFoe = 0
    @Published var centerText = ""
    @Published var centerIsGoal = false
    @Published var showOverlay = false
    /// Second half: the phone has been turned around on the table.
    @Published var flip = false
    @Published var showHalftime = false
    @Published var halfAt = 0
    /// Mallet radius the match in progress is actually using.
    @Published var padR = Prefs.shared.padR
    @Published var overlayWin = true
    @Published var overlayTitle = ""

    // Connection
    @Published var status: NetStatus = .idle
    @Published var ping: Int?
    @Published var toast: String?
    @Published var serverField = Net.defaultServer
    @Published var showSettings = false

    let net = Net()
    let world = World()
    var engine: Engine?

    private var snap: Snapshot?
    private var snapAt: CFTimeInterval = 0
    private var lastCountdown = -1
    private var lastState: GameState = .lobby
    private var lastSentX: Double = -1
    private var lastSentY: Double = -1
    private var centerClearAt: CFTimeInterval = 0
    private var toastClearAt: CFTimeInterval = 0

    init() {
        net.delegate = self
        net.myName = myName
        serverField = net.serverBase
    }

    // MARK: - navigation

    func go(_ s: Screen) { Sound.shared.ui(); screen = s }

    func saveName(_ n: String) {
        let clean = String(n.prefix(14)).trimmingCharacters(in: .whitespaces)
        myName = clean.isEmpty ? "Oyuncu" : clean
        net.myName = myName
        UserDefaults.standard.set(myName, forKey: "ah_name")
    }

    func saveServer() {
        let v = serverField.trimmingCharacters(in: .whitespaces)
        net.serverBase = v.isEmpty ? Net.defaultServer : v
        serverField = net.serverBase
        net.disconnect()
        net.connect()
    }

    func startOnline() {
        Sound.shared.ui()
        screen = .online
        net.connect()
    }

    func createRoom() {
        Sound.shared.ui()
        guard status == .connected else {
            flash("Sunucuya bağlanılıyor…")
            net.connect()
            return
        }
        lastState = .lobby
        net.create(target: pendingTarget, pad: Prefs.shared.padR)
    }

    func joinRoom() {
        Sound.shared.ui()
        let c = joinCode.uppercased().filter { $0.isLetter || $0.isNumber }
        guard c.count == 4 else { return flash("4 haneli oda kodunu gir.") }
        guard status == .connected else {
            flash("Sunucuya bağlanılıyor…")
            net.connect()
            return
        }
        lastState = .lobby
        net.join(code: c)
    }

    func changeTarget(_ v: Int) {
        Sound.shared.ui()
        guard mySide == "a" else { return }
        target = v
        net.setTarget(v)
    }

    func leaveLobby() {
        Sound.shared.ui()
        net.leave()
        mode = .none
        screen = .online
    }

    /// airhockey://oda/ABCD (or ?oda=ABCD) — tapping a shared invite jumps
    /// straight into that room.
    func openDeepLink(_ url: URL) {
        var raw = url.lastPathComponent
        if raw.isEmpty || raw == "/" { raw = url.host ?? "" }
        if let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "oda" })?.value {
            raw = q
        }
        let code = String(raw.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(4))
        guard code.count == 4 else { return }
        joinCode = code
        screen = .online
        net.connect()
        // The socket may still be opening; Net re-sends the join once it is up.
        net.wantRoom = code
        net.join(code: code)
    }

    func startLocal() {
        Sound.shared.ui()
        mode = .local
        target = localTarget
        padR = Prefs.shared.padR
        let e = Engine(target: localTarget, padR: padR, halftime: true)
        e.startCountdown()
        engine = e
        halfAt = e.halfAt
        scoreMe = 0; scoreFoe = 0
        lastCountdown = -1
        lastState = .lobby
        flip = false
        showHalftime = false
        world.reset()
        showOverlay = false
        screen = .game
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func enterGame() {
        flip = false
        showHalftime = false
        world.reset()
        lastSentX = -1; lastSentY = -1
        lastCountdown = -1
        showOverlay = false
        screen = .game
        UIApplication.shared.isIdleTimerDisabled = true
    }

    func exitGame() {
        Sound.shared.ui()
        UIApplication.shared.isIdleTimerDisabled = false
        if mode == .online { net.leave() }
        mode = .none
        engine = nil
        snap = nil
        showOverlay = false
        showHalftime = false
        flip = false
        centerText = ""
        screen = .menu
    }

    func playAgain() {
        Sound.shared.ui()
        showOverlay = false
        if mode == .local {
            engine?.restart()
            lastCountdown = -1
            flip = false
            showHalftime = false
        } else {
            net.restart()
        }
    }

    /// The players say they have turned the phone; swing the rink and the HUD
    /// round to match and start the second half.
    func continueHalftime() {
        Sound.shared.ui()
        showHalftime = false
        lastCountdown = -1
        engine?.resumeHalftime()
    }

    private func enterHalftime(_ g: Engine) {
        Sound.shared.half()
        centerText = ""
        showHalftime = true
        withAnimation(.easeInOut(duration: 0.45)) { flip.toggle() }
        world.myPad = Paddle(x: Field.W / 2, y: Field.H * 0.78)
        world.foePad = Paddle(x: Field.W / 2, y: Field.H * 0.22)
    }

    func flash(_ msg: String) {
        toast = msg
        toastClearAt = CACurrentMediaTime() + 2.8
    }

    private func setCenter(_ txt: String, goal: Bool, seconds: Double) {
        centerText = txt
        centerIsGoal = goal
        centerClearAt = seconds > 0 ? CACurrentMediaTime() + seconds : .greatestFiniteMagnitude
    }

    // MARK: - per-frame tick, driven by GameView

    func tick(dt raw: Double) {
        let dt = min(raw, 0.1)
        let now = CACurrentMediaTime()
        if !centerText.isEmpty && now > centerClearAt { centerText = "" }
        if toast != nil && now > toastClearAt { toast = nil }

        switch mode {
        case .local:  stepLocal(dt)
        case .online: stepOnline(dt)
        case .none:   break
        }

        if world.shake > 0.01 { world.shake *= pow(0.0015, dt) } else { world.shake = 0 }
        world.trail.append(world.puck)
        if world.trail.count > 7 { world.trail.removeFirst() }
    }

    private func stepPad(_ p: Paddle, _ dt: Double) {
        let dx = p.tx - p.x, dy = p.ty - p.y
        let d = (dx * dx + dy * dy).squareRoot()
        let m = Field.padMaxSpeed * dt
        if d <= m || d == 0 { p.x = p.tx; p.y = p.ty }
        else { p.x += dx / d * m; p.y += dy / d * m }
    }

    private func stepOnline(_ dt: Double) {
        stepPad(world.myPad, dt)

        if world.myPad.tx != lastSentX || world.myPad.ty != lastSentY {
            net.input(x: world.myPad.tx, y: world.myPad.ty)
            lastSentX = world.myPad.tx
            lastSentY = world.myPad.ty
        }

        guard let s = snap else { return }
        // Extrapolate the puck over the packet's age, then smooth out jitter.
        let age = min(CACurrentMediaTime() - snapAt, 0.14)
        let live = s.state == .playing
        let tpx = clampd(s.puck.x + (live ? s.puckV.x * age : 0), -6, Field.W + 6)
        let tpy = clampd(s.puck.y + (live ? s.puckV.y * age : 0), -6, Field.H + 6)

        let a = 1 - exp(-42 * dt)
        world.puck.x += (tpx - world.puck.x) * a
        world.puck.y += (tpy - world.puck.y) * a
        world.foe.x += (s.foe.x - world.foe.x) * a
        world.foe.y += (s.foe.y - world.foe.y) * a

        // Gently reconcile my paddle with the server's authoritative copy.
        let b = 1 - exp(-6 * dt)
        world.myPad.x += (s.me.x - world.myPad.x) * b
        world.myPad.y += (s.me.y - world.myPad.y) * b
        world.me = Vec(x: world.myPad.x, y: world.myPad.y)
    }

    private func stepLocal(_ dt: Double) {
        guard let g = engine else { return }
        g.setInput(side: "a", x: world.myPad.tx, y: world.myPad.ty)
        g.setInput(side: "b", x: world.foePad.tx, y: world.foePad.ty)

        let prev = g.state
        g.step(dt: dt)

        for e in g.events {
            switch e.type {
            case 0:
                Sound.shared.hit(e.intensity)
                world.shake = min(1, e.intensity / Field.puckMax) * 0.6
                world.trailTint = e.y >= Field.H / 2 ? T.me : T.foe
            case 1:
                Sound.shared.wall(e.intensity)
            default:
                let bottomScored = e.y < Field.H / 2
                Sound.shared.goal(mine: true)
                world.shake = 1
                setCenter(bottomScored ? "OYUNCU 1" : "OYUNCU 2", goal: true, seconds: 1.2)
            }
        }
        g.clearEvents()

        if g.state == .halftime && prev != .halftime {
            enterHalftime(g)
        } else if g.state == .countdown {
            let n = Int(ceil(g.countdown / 1000))
            if n != lastCountdown && n > 0 {
                lastCountdown = n
                Sound.shared.count(n)
                setCenter("\(n)", goal: false, seconds: 0)
            }
        } else if prev == .countdown && g.state == .playing {
            lastCountdown = -1
            setCenter("BAŞLA!", goal: false, seconds: 0.55)
        }

        if g.state == .over && prev != .over {
            overlayWin = g.winner == "a"
            overlayTitle = overlayWin ? "Oyuncu 1 Kazandı!" : "Oyuncu 2 Kazandı!"
            showOverlay = true
            Sound.shared.over(win: true)
        }

        if scoreMe != g.scoreA { scoreMe = g.scoreA }
        if scoreFoe != g.scoreB { scoreFoe = g.scoreB }

        world.puck = g.puck
        world.me = Vec(x: g.padA.x, y: g.padA.y)
        world.foe = Vec(x: g.padB.x, y: g.padB.y)
    }

    // MARK: - input from the touch layer

    /// The mallet sits a little way *up-field* of the fingertip, so the finger
    /// never parks on top of the thing you are trying to aim with.
    func touchMine(x: Double, y: Double) {
        let r = padR, lead = Prefs.shared.lead
        world.myPad.tx = clampd(x, r, Field.W - r)
        world.myPad.ty = clampd(y - lead, Field.H / 2 + r, Field.H - r)
    }

    func touchTheirs(x: Double, y: Double) {
        guard mode == .local else { return }
        let r = padR, lead = Prefs.shared.lead
        world.foePad.tx = clampd(x, r, Field.W - r)
        world.foePad.ty = clampd(y + lead, r, Field.H / 2 - r)
    }

    // MARK: - NetDelegate

    nonisolated func netStatus(_ s: NetStatus) {
        Task { @MainActor in self.status = s }
    }

    nonisolated func netPing(_ ms: Int) {
        Task { @MainActor in
            self.ping = self.ping == nil ? ms : Int(Double(self.ping!) * 0.7 + Double(ms) * 0.3)
        }
    }

    nonisolated func netJoined(code: String, side: String, target: Int, pad: Double) {
        Task { @MainActor in
            self.mode = .online
            self.code = code
            self.mySide = side
            self.target = target
            if pad > 0 { self.padR = pad }
            self.halfAt = 0            // online matches never break for half time
            self.lastState = .lobby
            if self.screen != .game { self.screen = .lobby }
        }
    }

    nonisolated func netRoom(target: Int, pad: Double, myName: String, foeName: String, foePresent: Bool) {
        Task { @MainActor in
            self.target = target
            if pad > 0 { self.padR = pad }
            self.myName = myName
            self.foeName = foeName
            self.foePresent = foePresent
        }
    }

    nonisolated func netPeer(online: Bool) {
        Task { @MainActor in
            if online { Sound.shared.join(); self.flash("Rakip bağlandı!") }
            else { self.flash("Rakip ayrıldı — bekleniyor…") }
        }
    }

    nonisolated func netError(_ message: String) {
        Task { @MainActor in
            self.flash(message)
            if self.screen == .lobby || self.screen == .game {
                self.net.wantRoom = nil
                self.mode = .none
                self.screen = .online
            }
        }
    }

    nonisolated func netSnapshot(_ s: Snapshot) {
        Task { @MainActor in self.apply(s) }
    }

    private func apply(_ s: Snapshot) {
        snap = s
        snapAt = CACurrentMediaTime()

        if screen != .game && s.state != .lobby { enterGame() }
        if scoreMe != s.scoreMe { scoreMe = s.scoreMe }
        if scoreFoe != s.scoreFoe { scoreFoe = s.scoreFoe }

        for e in s.events {
            switch e.type {
            case 0:
                Sound.shared.hit(e.intensity)
                world.shake = min(1, e.intensity / Field.puckMax) * 0.6
                world.trailTint = e.y >= Field.H / 2 ? T.me : T.foe
            case 1:
                Sound.shared.wall(e.intensity)
            default:
                let mine = e.y < Field.H / 2     // the puck went into THEIR net
                Sound.shared.goal(mine: mine)
                world.shake = 1
                setCenter(mine ? "GOL!" : "Rakip Attı", goal: true, seconds: 1.2)
            }
        }

        if s.state == .countdown {
            let n = Int(ceil(s.countdown / 1000))
            if n != lastCountdown && n > 0 {
                lastCountdown = n
                Sound.shared.count(n)
            }
            if s.countdown > 0 && centerText.isEmpty {
                setCenter("\(max(1, n))", goal: false, seconds: 0)
            }
        } else if lastState == .countdown && s.state == .playing {
            lastCountdown = -1
            setCenter("BAŞLA!", goal: false, seconds: 0.55)
        } else if s.state == .paused {
            setCenter("Rakip bekleniyor…", goal: true, seconds: 0)
        }

        if s.state == .over && lastState != .over {
            overlayWin = s.iWon ?? false
            overlayTitle = overlayWin ? "Kazandın!" : "Kaybettin"
            showOverlay = true
            Sound.shared.over(win: overlayWin)
        }
        if s.state != .over && lastState == .over { showOverlay = false }

        lastState = s.state
    }
}
