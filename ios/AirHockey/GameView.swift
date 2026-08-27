import SwiftUI
import QuartzCore

/// Display-link driven clock. ProMotion devices get the full 120 Hz.
final class Ticker: NSObject {
    private var link: CADisplayLink?
    private var last: CFTimeInterval = 0
    var onTick: ((Double) -> Void)?

    func start() {
        stop()
        let l = CADisplayLink(target: self, selector: #selector(fire(_:)))
        l.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        l.add(to: .main, forMode: .common)
        link = l
    }

    func stop() {
        link?.invalidate()
        link = nil
        last = 0
    }

    @objc private func fire(_ l: CADisplayLink) {
        let dt = last == 0 ? 1.0 / 60.0 : l.timestamp - last
        last = l.timestamp
        onTick?(dt)
    }
}

struct GameView: View {
    @ObservedObject var m: GameModel
    @State private var ticker = Ticker()
    /// touchID -> owns the bottom paddle
    @State private var owners: [Int: Bool] = [:]

    var body: some View {
        GeometryReader { geo in
            let layout = RinkLayout(size: geo.size)

            ZStack {
                T.bg.ignoresSafeArea()

                TimelineView(.animation) { _ in
                    Canvas { ctx, size in
                        draw(ctx, RinkLayout(size: size), size: size)
                    }
                }

                TouchLayer { id, point, phase in
                    handleTouch(id: id, point: point, phase: phase, layout: layout)
                }

                hud.rotationEffect(.degrees(m.flip ? 180 : 0))
                centerMessage.rotationEffect(.degrees(m.flip ? 180 : 0))
                if m.showHalftime { halftime.transition(.opacity) }
                if m.showOverlay { overlay.transition(.opacity) }
            }
            .animation(.easeOut(duration: 0.2), value: m.showOverlay)
            .animation(.easeOut(duration: 0.2), value: m.showHalftime)
        }
        .statusBarHidden(true)
        .onAppear {
            ticker.onTick = { dt in m.tick(dt: dt) }
            ticker.start()
        }
        .onDisappear {
            ticker.stop()
            owners.removeAll()
        }
    }

    // MARK: - input

    private func handleTouch(id: Int, point: CGPoint, phase: Int, layout: RinkLayout) {
        guard !m.showHalftime else { return }
        var v = layout.field(point)
        // Second half: the rink is drawn a half turn round, so touches come
        // back through the same turn.
        if m.flip { v = Vec(x: Field.W - v.x, y: Field.H - v.y) }
        switch phase {
        case 0:
            // The half a finger lands in decides which paddle it owns for its
            // whole lifetime, so dragging across the centre line steals nothing.
            let mine = v.y >= Field.H / 2
            if !mine && m.mode != .local { return }
            owners[id] = mine
            apply(v, mine: mine)
        case 1:
            guard let mine = owners[id] else { return }
            apply(v, mine: mine)
        default:
            owners[id] = nil
        }
    }

    private func apply(_ v: Vec, mine: Bool) {
        if mine { m.touchMine(x: v.x, y: v.y) } else { m.touchTheirs(x: v.x, y: v.y) }
    }

    // MARK: - rink drawing

    private func draw(_ base: GraphicsContext, _ L: RinkLayout, size: CGSize) {
        var ctx = base
        // Second half: the whole rink is drawn upside down, because the phone
        // itself has been turned around on the table.
        if m.flip {
            ctx.translateBy(x: size.width / 2, y: size.height / 2)
            ctx.rotate(by: .radians(.pi))
            ctx.translateBy(x: -size.width / 2, y: -size.height / 2)
        }
        if m.world.shake > 0.01 {
            let s = m.world.shake * Double(L.len(1.4))
            ctx.translateBy(x: CGFloat.random(in: -1...1) * s, y: CGFloat.random(in: -1...1) * s)
        }

        let rect = CGRect(x: L.px(0), y: L.py(0), width: L.len(Field.W), height: L.len(Field.H))
        let rink = Path(roundedRect: rect, cornerRadius: L.len(9), style: .continuous)

        ctx.fill(rink, with: .linearGradient(
            Gradient(colors: PAL.ice),
            startPoint: CGPoint(x: rect.midX, y: rect.minY),
            endPoint: CGPoint(x: rect.midX, y: rect.maxY)))

        ctx.drawLayer { c in
            c.clip(to: rink)

            c.fill(Path(CGRect(x: rect.minX, y: rect.midY, width: rect.width, height: rect.height / 2)),
                   with: .color(T.me.opacity(0.06)))
            c.fill(Path(CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height / 2)),
                   with: .color(T.foe.opacity(0.06)))

            let ink = PAL.ink
            let lw = max(1, L.len(0.5))

            var mid = Path()
            mid.move(to: CGPoint(x: rect.minX, y: L.py(Field.H / 2)))
            mid.addLine(to: CGPoint(x: rect.maxX, y: L.py(Field.H / 2)))
            c.stroke(mid, with: .color(ink),
                     style: StrokeStyle(lineWidth: lw, dash: [L.len(3), L.len(3)]))

            let cx = L.px(Field.W / 2), cy = L.py(Field.H / 2)
            c.stroke(circle(cx, cy, L.len(16)), with: .color(ink), lineWidth: lw)
            c.fill(circle(cx, cy, L.len(2.2)), with: .color(ink))

            // goal creases
            let crease = PAL.inkSoft
            var top = Path()
            top.addArc(center: CGPoint(x: cx, y: L.py(0)), radius: L.len(26),
                       startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
            c.stroke(top, with: .color(crease), lineWidth: lw)
            var bot = Path()
            bot.addArc(center: CGPoint(x: cx, y: L.py(Field.H)), radius: L.len(26),
                       startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
            c.stroke(bot, with: .color(crease), lineWidth: lw)
        }

        drawGoal(ctx, L, y: L.py(0), color: T.foe)
        drawGoal(ctx, L, y: L.py(Field.H), color: T.me)

        ctx.stroke(rink, with: .color(PAL.board), lineWidth: max(1.5, L.len(0.7)))

        // Motion beam, in the striker's colour and lighter than the puck itself.
        let beam = m.world.trailTint ?? Prefs.shared.puckStops[1]
        let trail = m.world.trail
        for (i, t) in trail.enumerated() {
            let f = Double(i) / Double(max(1, trail.count))
            let r = L.len(Field.puckR) * CGFloat(0.35 + 0.6 * f)
            ctx.fill(circle(L.px(t.x), L.py(t.y), r), with: .color(beam.opacity(f * 0.24)))
        }

        drawPaddle(ctx, L, at: m.world.foe, r: m.rFoe, color: T.foe,
                   dim: m.mode == .online && !m.foePresent)
        drawPaddle(ctx, L, at: m.world.me, r: m.rMe, color: T.me, dim: false)
        drawPuck(ctx, L, at: m.world.puck)
    }

    private func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    /// A soft contact shadow reads as depth on the light rinks, where a neon
    /// glow would just look muddy.
    private func drawShadow(_ ctx: GraphicsContext, _ p: CGPoint, _ r: CGFloat) {
        guard let sh = PAL.shadow else { return }
        ctx.fill(Path(ellipseIn: CGRect(x: p.x + r * 0.16 - r, y: p.y + r * 0.30 - r * 0.94,
                                        width: r * 2, height: r * 1.88)),
                 with: .color(sh))
    }

    private func drawGoal(_ ctx: GraphicsContext, _ L: RinkLayout, y: CGFloat, color: Color) {
        ctx.drawLayer { c in
            if PAL.glow { c.addFilter(.shadow(color: color, radius: L.len(4))) }
            var p = Path()
            p.move(to: CGPoint(x: L.px(Field.gx0), y: y))
            p.addLine(to: CGPoint(x: L.px(Field.gx1), y: y))
            c.stroke(p, with: .color(color),
                     style: StrokeStyle(lineWidth: max(3, L.len(1.6)), lineCap: .round))
        }
    }

    private func drawPuck(_ ctx: GraphicsContext, _ L: RinkLayout, at v: Vec) {
        let p = L.point(v)
        let r = L.len(Field.puckR)
        let stops = Prefs.shared.puckStops
        drawShadow(ctx, p, r)
        ctx.drawLayer { c in
            if PAL.glow { c.addFilter(.shadow(color: stops[1].opacity(0.9), radius: L.len(5))) }
            c.fill(circle(p.x, p.y, r), with: .radialGradient(
                Gradient(colors: stops),
                center: CGPoint(x: p.x - r * 0.3, y: p.y - r * 0.4),
                startRadius: 0, endRadius: r * 1.4))
        }
        // A hairline in the opposite direction to the rink keeps a black puck on
        // a dark rink (or a white one on ice) from disappearing.
        ctx.stroke(circle(p.x, p.y, r - max(0.4, L.len(0.12))),
                   with: .color(PAL.glow ? .white.opacity(0.5) : .black.opacity(0.22)),
                   lineWidth: max(1, L.len(0.3)))
    }

    private func drawPaddle(_ ctx: GraphicsContext, _ L: RinkLayout,
                            at v: Vec, r radius: Double, color: Color, dim: Bool) {
        let p = L.point(v)
        let r = L.len(radius)
        var c = ctx
        c.opacity = dim ? 0.55 : 1
        drawShadow(c, p, r)

        c.drawLayer { g in
            if PAL.glow { g.addFilter(.shadow(color: color, radius: L.len(4))) }
            g.fill(circle(p.x, p.y, r), with: .radialGradient(
                Gradient(stops: [.init(color: Color.white.opacity(0.30), location: 0),
                                 .init(color: color, location: 0.62),
                                 .init(color: color, location: 1)]),
                center: p, startRadius: r * 0.25, endRadius: r))
        }
        c.fill(circle(p.x, p.y, r * 0.52), with: .color(PAL.padInner))
        c.stroke(circle(p.x, p.y, r * 0.52), with: .color(PAL.padRing),
                 lineWidth: max(1, L.len(0.35)))
    }

    // MARK: - HUD

    private var hud: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(m.mode == .local ? S("game.p2") : m.foeName.uppercased())
                    .font(.system(size: sz(12), weight: .bold)).tracking(1)
                    .foregroundStyle(T.dim)
                Text("\(m.scoreFoe)")
                    .font(.system(size: sz(34), weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.foe)
            }
            .rotationEffect(.degrees(180))
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer()

            HStack(alignment: .lastTextBaseline, spacing: 12) {
                Text("\(m.scoreMe)")
                    .font(.system(size: sz(34), weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.me)
                Text(m.mode == .local ? S("game.p1") : S("game.me"))
                    .font(.system(size: sz(12), weight: .bold)).tracking(1)
                    .foregroundStyle(T.dim)
                    .lineLimit(1)
                Spacer(minLength: 12)
                meta.layoutPriority(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .allowsHitTesting(false)
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 8) {
                if m.mode == .online { ReconnectButton(m: m) }
                Button { m.exitGame() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: sz(15), weight: .bold))
                        .foregroundStyle(T.dim)
                        .frame(width: 40, height: 40)
                        .background(T.bg.opacity(0.6), in: Circle())
                        .overlay(Circle().stroke(T.line))
                }
            }
            .padding(.trailing, 12)
        }
    }

    /// Match rules and ping: reference you glance at between rallies, not
    /// something that should compete with the puck. Tucked into the far corner
    /// of your own side and kept faint — no pill, no border.
    private var meta: some View {
        HStack(alignment: .lastTextBaseline, spacing: 10) {
            Group {
                if m.gameMode == .lucky && m.halfAt > 0 {
                    (Text(S("hud.lucky")) + Text("\(m.halfAt)").foregroundColor(T.gold)
                     + Text(S("hud.half") + "\(m.target)" + S("hud.goals")))
                } else if m.gameMode == .lucky {
                    Text(S("hud.lucky") + "\(m.target)" + S("hud.goals"))
                } else if m.halfAt > 0 {
                    (Text("\(m.halfAt)").foregroundColor(T.gold)
                     + Text(S("hud.half") + "\(m.target)" + S("hud.goals")))
                } else {
                    Text("\(m.target)" + S("hud.goals"))
                }
            }
            .font(.system(size: sz(10), weight: .bold)).tracking(1.4)
            .foregroundStyle(T.dim)
            .opacity(0.34)

            if m.mode == .online {
                let slow = (m.ping ?? 0) > 140
                Text(m.ping.map { "\($0) ms" } ?? "—")
                    .font(.system(size: sz(10), weight: .bold)).monospacedDigit()
                    .foregroundStyle(slow ? T.foe : T.dim)
                    // The fade sits on each item, not on the row: a child cannot
                    // out-shine a translucent parent, and a bad ping still has
                    // to be readable.
                    .opacity(slow ? 0.8 : 0.34)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.85)
    }

    private var centerMessage: some View {
        Text(m.centerText)
            .font(.system(size: sz(m.centerIsGoal ? 44 : 72), weight: .black, design: .rounded))
            .foregroundStyle(m.centerIsGoal ? T.gold : T.txt)
            // A halo in the rink's own colour keeps the countdown readable even
            // when the puck happens to sit right behind it.
            .shadow(color: T.bg, radius: 14)
            .opacity(m.centerText.isEmpty ? 0 : 1)
            .animation(.easeOut(duration: 0.18), value: m.centerText)
            .allowsHitTesting(false)
    }

    /// On one shared phone both players sit on opposite sides of the table, so
    /// the notice is printed twice — once the right way up for each of them.
    /// Online there is no phone to turn, so one upright notice is all it needs.
    private var halftime: some View {
        let turnPhone = m.mode == .local
        return ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            Rectangle().fill(T.bg.opacity(0.86)).ignoresSafeArea()

            VStack(spacing: 0) {
                if turnPhone {
                    halfNotice.rotationEffect(.degrees(180))
                    Spacer(minLength: 12)
                }

                VStack(spacing: 12) {
                    if turnPhone {
                        TurnPhoneIcon().frame(width: 112, height: 112)
                    } else {
                        Text(S("half.word"))
                            .font(.system(size: sz(26), weight: .black, design: .rounded))
                            .tracking(6)
                            .foregroundStyle(T.gold)
                    }
                    Text("\(m.scoreMe) – \(m.scoreFoe)")
                        .font(.system(size: sz(42), weight: .black, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(T.txt)
                    Text(S(turnPhone ? "half.noteTurn" : "half.noteWait"))
                        .font(.system(size: sz(13)))
                        .foregroundStyle(T.dim)
                        .multilineTextAlignment(.center)
                    Button(S(turnPhone ? "half.btnTurn" : "half.btnReady")) { m.continueHalftime() }
                        .buttonStyle(PrimaryButton())
                        .disabled(!turnPhone && m.halfReady)
                        .opacity(!turnPhone && m.halfReady ? 0.5 : 1)
                        .padding(.top, 4)
                    if !turnPhone && m.halfReady && !m.foeReady {
                        Text(S("half.waitFoe"))
                            .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    }
                }
                .frame(maxWidth: Device.isPad ? 400 : 330)

                if turnPhone {
                    Spacer(minLength: 12)
                    halfNotice
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
        }
    }

    private var halfNotice: some View {
        VStack(spacing: 4) {
            Text(S("half.word"))
                .font(.system(size: sz(26), weight: .black, design: .rounded)).tracking(6)
                .foregroundStyle(T.gold)
            Text(S("half.turn"))
                .font(.system(size: sz(15), weight: .bold))
                .foregroundStyle(T.txt)
        }
    }

    private var overlay: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            Rectangle().fill(T.bg.opacity(0.86)).ignoresSafeArea()
            VStack(spacing: 14) {
                Text(m.overlayTitle)
                    .font(.system(size: sz(30), weight: .black, design: .rounded))
                    .foregroundStyle(m.overlayWin ? T.me : T.foe)
                    .multilineTextAlignment(.center)
                Text("\(m.scoreMe) – \(m.scoreFoe)")
                    .font(.system(size: sz(52), weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.txt)
                Button(S("over.again")) { m.playAgain() }.buttonStyle(PrimaryButton())
                Button(S("over.menu")) { m.exitGame() }.buttonStyle(GhostButton())
            }
            .padding(28)
            .frame(maxWidth: Device.isPad ? 430 : 360)
        }
    }
}


/// A phone turning end over end, drawn with two arcs and a rounded body.
struct TurnPhoneIcon: View {
    @State private var turned = false

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 120
            func P(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * s, y: y * s) }

            var body = Path(roundedRect: CGRect(x: 42 * s, y: 26 * s, width: 36 * s, height: 68 * s),
                            cornerRadius: 8 * s, style: .continuous)
            ctx.stroke(body, with: .color(T.txt), lineWidth: 4 * s)
            body = Path { p in
                p.move(to: P(53, 35)); p.addLine(to: P(67, 35))
            }
            ctx.stroke(body, with: .color(T.txt),
                       style: StrokeStyle(lineWidth: 3 * s, lineCap: .round))
            ctx.fill(Path(ellipseIn: CGRect(x: 57 * s, y: 83 * s, width: 6 * s, height: 6 * s)),
                     with: .color(T.txt))

            var arcs = Path()
            arcs.addArc(center: P(60, 60), radius: 38 * s,
                        startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
            arcs.move(to: P(98, 60))
            arcs.addArc(center: P(60, 60), radius: 38 * s,
                        startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
            ctx.stroke(arcs, with: .color(T.gold),
                       style: StrokeStyle(lineWidth: 4 * s, lineCap: .round))

            var tips = Path()
            tips.move(to: P(51, 15)); tips.addLine(to: P(60, 22)); tips.addLine(to: P(51, 29))
            tips.move(to: P(69, 105)); tips.addLine(to: P(60, 98)); tips.addLine(to: P(69, 91))
            ctx.stroke(tips, with: .color(T.gold),
                       style: StrokeStyle(lineWidth: 4 * s, lineCap: .round, lineJoin: .round))
        }
        .rotationEffect(.degrees(turned ? 180 : 0))
        .animation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true), value: turned)
        .onAppear { turned = true }
    }
}
