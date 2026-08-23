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
                        draw(ctx, RinkLayout(size: size))
                    }
                }

                TouchLayer { id, point, phase in
                    handleTouch(id: id, point: point, phase: phase, layout: layout)
                }

                hud
                centerMessage
                if m.showOverlay { overlay.transition(.opacity) }
            }
            .animation(.easeOut(duration: 0.2), value: m.showOverlay)
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
        let v = layout.field(point)
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

    private func draw(_ base: GraphicsContext, _ L: RinkLayout) {
        var ctx = base
        if m.world.shake > 0.01 {
            let s = m.world.shake * Double(L.len(1.4))
            ctx.translateBy(x: CGFloat.random(in: -1...1) * s, y: CGFloat.random(in: -1...1) * s)
        }

        let rect = CGRect(x: L.px(0), y: L.py(0), width: L.len(Field.W), height: L.len(Field.H))
        let rink = Path(roundedRect: rect, cornerRadius: L.len(9), style: .continuous)

        ctx.fill(rink, with: .linearGradient(
            Gradient(colors: [Color(red: 0.075, green: 0.137, blue: 0.278),
                              Color(red: 0.047, green: 0.086, blue: 0.192),
                              Color(red: 0.075, green: 0.137, blue: 0.278)]),
            startPoint: CGPoint(x: rect.midX, y: rect.minY),
            endPoint: CGPoint(x: rect.midX, y: rect.maxY)))

        ctx.drawLayer { c in
            c.clip(to: rink)

            c.fill(Path(CGRect(x: rect.minX, y: rect.midY, width: rect.width, height: rect.height / 2)),
                   with: .color(T.me.opacity(0.06)))
            c.fill(Path(CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height / 2)),
                   with: .color(T.foe.opacity(0.06)))

            let ink = Color(red: 0.588, green: 0.745, blue: 0.941).opacity(0.30)
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
            let crease = ink.opacity(0.72)
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

        ctx.stroke(rink, with: .color(Color(red: 0.471, green: 0.667, blue: 0.902).opacity(0.34)),
                   lineWidth: max(1.5, L.len(0.7)))

        // trail
        let trail = m.world.trail
        for (i, t) in trail.enumerated() {
            let f = Double(i) / Double(max(1, trail.count))
            let r = L.len(Field.puckR) * CGFloat(0.35 + 0.6 * f)
            ctx.fill(circle(L.px(t.x), L.py(t.y), r),
                     with: .color(T.gold.opacity(f * 0.30)))
        }

        drawPaddle(ctx, L, at: m.world.foe, color: T.foe,
                   dim: m.mode == .online && !m.foePresent)
        drawPaddle(ctx, L, at: m.world.me, color: T.me, dim: false)
        drawPuck(ctx, L, at: m.world.puck)
    }

    private func circle(_ x: CGFloat, _ y: CGFloat, _ r: CGFloat) -> Path {
        Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
    }

    private func drawGoal(_ ctx: GraphicsContext, _ L: RinkLayout, y: CGFloat, color: Color) {
        ctx.drawLayer { c in
            c.addFilter(.shadow(color: color, radius: L.len(4)))
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
        ctx.drawLayer { c in
            c.addFilter(.shadow(color: T.gold.opacity(0.9), radius: L.len(5)))
            c.fill(circle(p.x, p.y, r), with: .radialGradient(
                Gradient(colors: [Color(red: 1, green: 0.965, blue: 0.847), T.gold,
                                  Color(red: 0.788, green: 0.561, blue: 0.118)]),
                center: CGPoint(x: p.x - r * 0.3, y: p.y - r * 0.4),
                startRadius: 0, endRadius: r * 1.4))
        }
    }

    private func drawPaddle(_ ctx: GraphicsContext, _ L: RinkLayout,
                            at v: Vec, color: Color, dim: Bool) {
        let p = L.point(v)
        let r = L.len(Field.padR)
        var c = ctx
        c.opacity = dim ? 0.55 : 1

        c.drawLayer { g in
            g.addFilter(.shadow(color: color, radius: L.len(4)))
            g.fill(circle(p.x, p.y, r), with: .radialGradient(
                Gradient(stops: [.init(color: Color.white.opacity(0.30), location: 0),
                                 .init(color: color, location: 0.62),
                                 .init(color: color, location: 1)]),
                center: p, startRadius: r * 0.25, endRadius: r))
        }
        c.fill(circle(p.x, p.y, r * 0.52),
               with: .color(Color(red: 0.031, green: 0.055, blue: 0.102).opacity(0.62)))
        c.stroke(circle(p.x, p.y, r * 0.52), with: .color(Color.white.opacity(0.28)),
                 lineWidth: max(1, L.len(0.35)))
    }

    // MARK: - HUD

    private var hud: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Text(m.mode == .local ? "OYUNCU 2" : m.foeName.uppercased())
                    .font(.system(size: 12, weight: .bold)).tracking(1)
                    .foregroundStyle(T.dim)
                Text("\(m.scoreFoe)")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.foe)
            }
            .rotationEffect(.degrees(180))
            .frame(maxWidth: .infinity, alignment: .leading)

            Spacer()

            HStack {
                Text("\(m.target) GOL")
                    .font(.system(size: 11, weight: .heavy)).tracking(2)
                    .foregroundStyle(T.dim)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(T.bg.opacity(0.5), in: Capsule())
                    .overlay(Capsule().stroke(T.line))
                Spacer()
                if m.mode == .online {
                    Text(m.ping.map { "\($0) ms" } ?? "—")
                        .font(.system(size: 11, weight: .bold)).monospacedDigit()
                        .foregroundStyle((m.ping ?? 0) > 140 ? T.foe : T.dim)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(T.bg.opacity(0.5), in: Capsule())
                        .overlay(Capsule().stroke(T.line))
                }
            }

            Spacer()

            HStack(spacing: 12) {
                Text("\(m.scoreMe)")
                    .font(.system(size: 34, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.me)
                Text(m.mode == .local ? "OYUNCU 1" : "SEN")
                    .font(.system(size: 12, weight: .bold)).tracking(1)
                    .foregroundStyle(T.dim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .allowsHitTesting(false)
        .overlay(alignment: .topTrailing) {
            Button { m.exitGame() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(T.dim)
                    .frame(width: 40, height: 40)
                    .background(T.bg.opacity(0.6), in: Circle())
                    .overlay(Circle().stroke(T.line))
            }
            .padding(.trailing, 12)
        }
    }

    private var centerMessage: some View {
        Text(m.centerText)
            .font(.system(size: m.centerIsGoal ? 44 : 72, weight: .black, design: .rounded))
            .foregroundStyle(m.centerIsGoal ? T.gold : .white)
            .shadow(color: (m.centerIsGoal ? T.gold : T.me).opacity(0.7), radius: 22)
            .opacity(m.centerText.isEmpty ? 0 : 1)
            .animation(.easeOut(duration: 0.18), value: m.centerText)
            .allowsHitTesting(false)
    }

    private var overlay: some View {
        ZStack {
            Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
            Rectangle().fill(T.bg.opacity(0.7)).ignoresSafeArea()
            VStack(spacing: 14) {
                Text(m.overlayTitle)
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(m.overlayWin ? T.me : T.foe)
                    .multilineTextAlignment(.center)
                Text("\(m.scoreMe) – \(m.scoreFoe)")
                    .font(.system(size: 52, weight: .black, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(T.txt)
                Button("Tekrar Oyna") { m.playAgain() }.buttonStyle(PrimaryButton())
                Button("Ana Menü") { m.exitGame() }.buttonStyle(GhostButton())
            }
            .padding(28)
            .frame(maxWidth: 360)
        }
    }
}
