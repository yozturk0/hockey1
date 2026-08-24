import Foundation

/// One frame of authoritative state, already rotated into *this* player's
/// point of view by the server: you are always at the bottom of the rink.
struct Snapshot {
    var tick: Int = 0
    var state: GameState = .lobby
    var countdown: Double = 0
    var puck = Vec(x: Field.W / 2, y: Field.H / 2)
    var puckV = Vec(x: 0, y: 0)
    var me = Vec(x: Field.W / 2, y: Field.H * 0.78)
    var foe = Vec(x: Field.W / 2, y: Field.H * 0.22)
    /// The opponent's mallet velocity, so the client can carry it forward over
    /// the trip time instead of drawing it where it was a ping ago.
    var foeV = Vec(x: 0, y: 0)
    /// Live mallet radii — in lucky mode they change mid-rally.
    var rMe = Field.padR
    var rFoe = Field.padR
    var scoreMe = 0
    var scoreFoe = 0
    var iWon: Bool?
    var events: [GameEvent] = []
}

enum NetStatus: Equatable {
    case idle, connecting, connected, failed(String)
}

protocol NetDelegate: AnyObject {
    func netStatus(_ s: NetStatus)
    func netJoined(code: String, side: String, target: Int, pad: Double,
                   mode: GameMode, half: Int)
    func netRoom(target: Int, pad: Double, mode: GameMode, half: Int,
                 myName: String, foeName: String, foePresent: Bool)
    func netPeer(online: Bool)
    /// Half-time break: who has tapped "ready".
    func netHalfReady(mine: Bool, foe: Bool)
    func netError(_ message: String)
    func netSnapshot(_ s: Snapshot)
    func netPing(_ ms: Int)
}

final class Net: NSObject {
    weak var delegate: NetDelegate?
    private var task: URLSessionWebSocketTask?
    private var session: URLSession!
    private var pingTimer: Timer?
    private var retryCount = 0
    private var closedByUs = false
    private var mySide = "a"

    /// Set when we are in a room, so an unexpected drop can re-take our seat.
    var wantRoom: String?
    var myName = "Oyuncu"

    /// http(s)://host[:port] — the ws(s) URL is derived from it.
    var serverBase: String {
        get { UserDefaults.standard.string(forKey: "ah_server") ?? Net.defaultServer }
        set { UserDefaults.standard.set(newValue, forKey: "ah_server") }
    }
    static let defaultServer = "https://air-hockey-qa5w.onrender.com"

    override init() {
        super.init()
        session = URLSession(configuration: .default, delegate: self, delegateQueue: .main)
    }

    private var wsURL: URL? {
        var s = serverBase.trimmingCharacters(in: .whitespaces)
        if s.hasSuffix("/") { s.removeLast() }
        if s.hasPrefix("https://") { s = "wss://" + s.dropFirst(8) }
        else if s.hasPrefix("http://") { s = "ws://" + s.dropFirst(7) }
        else if !s.hasPrefix("ws://") && !s.hasPrefix("wss://") { s = "ws://" + s }
        return URL(string: s + "/ws")
    }

    // MARK: - lifecycle

    func connect() {
        guard task == nil || task?.state != .running else { return }
        guard let url = wsURL else {
            delegate?.netStatus(.failed("Sunucu adresi geçersiz"))
            return
        }
        closedByUs = false
        delegate?.netStatus(.connecting)
        let t = session.webSocketTask(with: url)
        task = t
        t.resume()
        receive()
    }

    func disconnect() {
        closedByUs = true
        pingTimer?.invalidate(); pingTimer = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        wantRoom = nil
        delegate?.netStatus(.idle)
    }

    private func scheduleRetry() {
        guard !closedByUs else { return }
        retryCount += 1
        let wait = min(8.0, 0.6 * pow(1.7, Double(retryCount)))
        DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
            guard let self, !self.closedByUs else { return }
            self.task = nil
            self.connect()
        }
    }

    private func startPings() {
        pingTimer?.invalidate()
        pingTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            self?.send(["t": "p", "c": Int(Date().timeIntervalSince1970 * 1000)])
        }
        send(["t": "p", "c": Int(Date().timeIntervalSince1970 * 1000)])
    }

    // MARK: - send

    func send(_ obj: [String: Any]) {
        guard let t = task, t.state == .running,
              let data = try? JSONSerialization.data(withJSONObject: obj),
              let s = String(data: data, encoding: .utf8) else { return }
        t.send(.string(s)) { _ in /* the receive loop notices a dead socket */ }
    }

    /// The host's mallet-size preference becomes the room's; the server clamps
    /// it and tells both clients what it ended up as.
    func create(target: Int, pad: Double, mode: GameMode, half: Bool) {
        send(["t": "create", "target": target, "pad": pad,
              "mode": mode.rawValue, "half": half, "name": myName])
    }

    func join(code: String) {
        wantRoom = code
        send(["t": "join", "code": code, "name": myName])
    }

    func setTarget(_ v: Int) { send(["t": "target", "v": v]) }
    /// Mode and the half-time break; host-only, and only before kickoff.
    func setOpts(mode: GameMode, half: Bool) {
        send(["t": "opts", "mode": mode.rawValue, "half": half])
    }
    func ready() { send(["t": "ready"]) }
    func restart() { send(["t": "restart"]) }
    func leave() { wantRoom = nil; send(["t": "leave"]) }
    func input(x: Double, y: Double) {
        send(["t": "i", "x": (x * 100).rounded() / 100, "y": (y * 100).rounded() / 100])
    }

    // MARK: - receive

    private func receive() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.pingTimer?.invalidate()
                if !self.closedByUs {
                    self.delegate?.netStatus(.failed("Bağlantı koptu"))
                    self.scheduleRetry()
                }
            case .success(let msg):
                switch msg {
                case .string(let s): self.handle(s)
                case .data(let d): self.handle(String(data: d, encoding: .utf8) ?? "")
                @unknown default: break
                }
                self.receive()
            }
        }
    }

    private func handle(_ raw: String) {
        guard let data = raw.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = obj["t"] as? String else { return }

        switch t {
        case "hello":
            retryCount = 0
            delegate?.netStatus(.connected)
            startPings()
            if let code = wantRoom { join(code: code) }

        case "q":
            if let c = obj["c"] as? Double {
                let rtt = Int(Date().timeIntervalSince1970 * 1000 - c)
                delegate?.netPing(max(0, rtt))
            }

        case "joined":
            let code = obj["code"] as? String ?? ""
            mySide = obj["side"] as? String ?? "a"
            wantRoom = code
            delegate?.netJoined(code: code, side: mySide,
                                target: obj["target"] as? Int ?? 7,
                                pad: obj["pad"] as? Double ?? 0,
                                mode: GameMode.from(obj["mode"] as? String),
                                half: obj["half"] as? Int ?? 0)

        case "room":
            let names = obj["names"] as? [String: Any] ?? [:]
            let aHere = obj["a"] as? Bool ?? false
            let bHere = obj["b"] as? Bool ?? false
            let mine = (names[mySide] as? String) ?? "Oyuncu"
            let other = (names[mySide == "a" ? "b" : "a"] as? String) ?? "Rakip"
            let foeHere = mySide == "a" ? bHere : aHere
            delegate?.netRoom(target: obj["target"] as? Int ?? 7,
                              pad: obj["pad"] as? Double ?? 0,
                              mode: GameMode.from(obj["mode"] as? String),
                              half: obj["half"] as? Int ?? 0,
                              myName: mine,
                              foeName: foeHere ? other : "Rakip",
                              foePresent: foeHere)

        case "peer":
            delegate?.netPeer(online: obj["on"] as? Bool ?? false)

        case "hr":
            let a = obj["a"] as? Bool ?? false
            let b = obj["b"] as? Bool ?? false
            delegate?.netHalfReady(mine: mySide == "a" ? a : b,
                                   foe: mySide == "a" ? b : a)

        case "err":
            delegate?.netError(obj["m"] as? String ?? "Bilinmeyen hata")

        case "s":
            delegate?.netSnapshot(parseSnapshot(obj))

        default: break
        }
    }

    private func parseSnapshot(_ o: [String: Any]) -> Snapshot {
        var s = Snapshot()
        s.tick = o["k"] as? Int ?? 0
        s.state = GameState(rawValue: o["st"] as? Int ?? 0) ?? .lobby
        s.countdown = o["cd"] as? Double ?? 0
        if let p = o["p"] as? [Double], p.count >= 4 {
            s.puck = Vec(x: p[0], y: p[1]); s.puckV = Vec(x: p[2], y: p[3])
        }
        if let m = o["m"] as? [Double], m.count >= 2 { s.me = Vec(x: m[0], y: m[1]) }
        if let f = o["o"] as? [Double], f.count >= 2 { s.foe = Vec(x: f[0], y: f[1]) }
        if let v = o["ov"] as? [Double], v.count >= 2 { s.foeV = Vec(x: v[0], y: v[1]) }
        if let r = o["rm"] as? Double, r > 0 { s.rMe = r }
        if let r = o["ro"] as? Double, r > 0 { s.rFoe = r }
        s.scoreMe = o["sm"] as? Int ?? 0
        s.scoreFoe = o["so"] as? Int ?? 0
        if let w = o["w"] as? Int { s.iWon = (w == 1) }
        if let evs = o["e"] as? [[Double]] {
            s.events = evs.compactMap {
                $0.count >= 4 ? GameEvent(type: Int($0[0]), x: $0[1], y: $0[2], intensity: $0[3]) : nil
            }
        }
        return s
    }
}

extension Net: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol proto: String?) {
        retryCount = 0
        delegate?.netStatus(.connected)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        pingTimer?.invalidate()
        if !closedByUs {
            delegate?.netStatus(.failed("Bağlantı kapandı"))
            scheduleRetry()
        }
    }
}
