import SwiftUI
import UIKit

// MARK: - device

/// The same app runs on a phone you put down between you and on a tablet that
/// makes a genuinely table-sized rink. Only two things really differ: how wide
/// the menu column may grow, and what to call the thing in the middle.
enum Device {
    static let isPad = UIDevice.current.userInterfaceIdiom == .pad

    /// Menu column width. A phone-width strip marooned in the middle of a
    /// 13-inch screen reads as a broken layout, not as a clean one.
    static var column: CGFloat { isPad ? 560 : 430 }

    /// Menu type scale. The rink itself is laid out in field units and is
    /// unaffected.
    static var typeScale: CGFloat { isPad ? 1.16 : 1 }

    static var sameDevice: String { isPad ? "Aynı iPad'de 2 Kişi" : "Aynı Telefonda 2 Kişi" }
    /// accusative — "…yu aranıza koyun", "…yu 180° çevirin"
    static var itAcc: String { isPad ? "iPad'i" : "telefonu" }
    static var itAccCap: String { isPad ? "iPad'i" : "Telefonu" }
}

/// Menu font size, nudged up on a tablet. Never used for rink geometry.
@inline(__always) func sz(_ s: CGFloat) -> CGFloat { s * Device.typeScale }

// MARK: - palettes

/// Every colour the app draws with. Swapping a palette re-skins both the menus
/// and the rink; this is the Swift twin of `PALETTES` in `web/app.js` and the
/// CSS custom properties in `web/style.css` — keep the three in step.
struct Palette {
    let key: String
    let name: String

    // page chrome
    let bg: Color
    let bg2: Color
    let txt: Color
    let dim: Color
    let me: Color
    let me2: Color
    let foe: Color
    let gold: Color
    let onMe: Color
    let line: Color
    let card: Color

    // rink
    let ice: [Color]
    let ink: Color          // centre line, circles
    let inkSoft: Color      // goal creases
    let board: Color
    let padInner: Color
    let padRing: Color
    let shadow: Color?      // soft contact shadow; nil on the neon rink
    let glow: Bool          // neon bloom instead of a shadow

    var dark: Bool { glow }
}

private func rgb(_ r: Double, _ g: Double, _ b: Double) -> Color {
    Color(red: r / 255, green: g / 255, blue: b / 255)
}

enum Palettes {
    static let krem = Palette(
        key: "krem", name: "Krem",
        bg: rgb(239, 225, 194), bg2: rgb(229, 212, 172),
        txt: rgb(59, 45, 28), dim: rgb(125, 103, 70),
        me: rgb(23, 114, 107), me2: rgb(42, 157, 143),
        foe: rgb(192, 69, 44), gold: rgb(192, 124, 18),
        onMe: .white,
        line: rgb(122, 95, 55).opacity(0.26),
        card: .white.opacity(0.55),
        ice: [rgb(249, 240, 221), rgb(241, 227, 196), rgb(249, 240, 221)],
        ink: rgb(122, 95, 55).opacity(0.36),
        inkSoft: rgb(122, 95, 55).opacity(0.20),
        board: rgb(122, 95, 55).opacity(0.55),
        padInner: .white.opacity(0.62),
        padRing: .black.opacity(0.16),
        shadow: rgb(96, 74, 42).opacity(0.26),
        glow: false)

    static let buz = Palette(
        key: "buz", name: "Buz",
        bg: rgb(233, 241, 250), bg2: rgb(217, 231, 246),
        txt: rgb(22, 40, 63), dim: rgb(92, 116, 143),
        me: rgb(14, 116, 144), me2: rgb(14, 165, 183),
        foe: rgb(214, 69, 90), gold: rgb(184, 134, 11),
        onMe: .white,
        line: rgb(40, 80, 130).opacity(0.20),
        card: .white.opacity(0.62),
        ice: [.white, rgb(232, 241, 251), .white],
        ink: rgb(40, 80, 130).opacity(0.32),
        inkSoft: rgb(40, 80, 130).opacity(0.18),
        board: rgb(40, 80, 130).opacity(0.48),
        padInner: .white.opacity(0.70),
        padRing: .black.opacity(0.14),
        shadow: rgb(40, 70, 110).opacity(0.22),
        glow: false)

    static let cim = Palette(
        key: "cim", name: "Çim",
        bg: rgb(232, 240, 217), bg2: rgb(217, 230, 196),
        txt: rgb(37, 51, 26), dim: rgb(95, 122, 75),
        me: rgb(28, 107, 74), me2: rgb(47, 158, 106),
        foe: rgb(194, 65, 12), gold: rgb(161, 98, 7),
        onMe: .white,
        line: rgb(60, 90, 45).opacity(0.22),
        card: .white.opacity(0.55),
        ice: [rgb(242, 247, 232), rgb(228, 238, 211), rgb(242, 247, 232)],
        ink: rgb(60, 90, 45).opacity(0.34),
        inkSoft: rgb(60, 90, 45).opacity(0.18),
        board: rgb(60, 90, 45).opacity(0.50),
        padInner: .white.opacity(0.62),
        padRing: .black.opacity(0.15),
        shadow: rgb(60, 90, 45).opacity(0.24),
        glow: false)

    static let gece = Palette(
        key: "gece", name: "Gece",
        bg: rgb(7, 11, 20), bg2: rgb(13, 20, 36),
        txt: rgb(232, 238, 252), dim: rgb(142, 160, 196),
        me: rgb(34, 211, 238), me2: rgb(59, 130, 246),
        foe: rgb(255, 77, 109), gold: rgb(255, 209, 102),
        onMe: rgb(3, 16, 24),
        line: rgb(120, 160, 220).opacity(0.18),
        card: .white.opacity(0.05),
        ice: [rgb(19, 35, 71), rgb(12, 22, 49), rgb(19, 35, 71)],
        ink: rgb(150, 190, 240).opacity(0.30),
        inkSoft: rgb(150, 190, 240).opacity(0.22),
        board: rgb(120, 170, 230).opacity(0.34),
        padInner: rgb(8, 14, 26).opacity(0.62),
        padRing: .white.opacity(0.28),
        shadow: nil,
        glow: true)

    static let all = [krem, buz, cim, gece]
    static func named(_ key: String) -> Palette {
        all.first { $0.key == key } ?? krem
    }
}

// MARK: - puck colours

/// `stops` is the highlight -> body -> rim gradient. A nil `stops` means
/// "whatever the rink was designed around".
struct PuckSkin {
    let key: String
    let name: String
    let stops: [Color]?
}

enum PuckSkins {
    static let all: [PuckSkin] = [
        PuckSkin(key: "tema", name: "Tema", stops: nil),
        PuckSkin(key: "siyah", name: "Siyah",
                 stops: [rgb(110, 110, 110), rgb(35, 35, 35), rgb(8, 8, 8)]),
        PuckSkin(key: "kirmizi", name: "Kırmızı",
                 stops: [rgb(255, 168, 152), rgb(226, 59, 38), rgb(127, 26, 14)]),
        PuckSkin(key: "turuncu", name: "Turuncu",
                 stops: [rgb(255, 211, 154), rgb(240, 135, 30), rgb(143, 76, 8)]),
        PuckSkin(key: "sari", name: "Sarı",
                 stops: [rgb(255, 246, 216), rgb(255, 209, 102), rgb(184, 128, 26)]),
        PuckSkin(key: "yesil", name: "Yeşil",
                 stops: [rgb(168, 240, 200), rgb(32, 160, 94), rgb(12, 77, 44)]),
        PuckSkin(key: "mavi", name: "Mavi",
                 stops: [rgb(182, 220, 255), rgb(31, 122, 224), rgb(11, 60, 120)]),
        PuckSkin(key: "mor", name: "Mor",
                 stops: [rgb(220, 188, 255), rgb(139, 62, 224), rgb(67, 23, 117)]),
        PuckSkin(key: "beyaz", name: "Beyaz",
                 stops: [.white, rgb(238, 241, 246), rgb(154, 164, 178)]),
    ]
    static func named(_ key: String) -> PuckSkin {
        all.first { $0.key == key } ?? all[0]
    }
}

/// The rink's own puck, used when the player picked "Tema".
private let themePucks: [String: [Color]] = [
    "krem": [rgb(107, 89, 67), rgb(51, 38, 24), rgb(23, 16, 9)],
    "buz":  [rgb(92, 107, 122), rgb(34, 48, 63), rgb(16, 24, 32)],
    "cim":  [rgb(95, 107, 77), rgb(42, 51, 32), rgb(20, 26, 14)],
    "gece": [rgb(255, 246, 216), rgb(255, 209, 102), rgb(201, 143, 30)],
]

// MARK: - preferences

/// Mallet radius in field units. The rink is 100 wide, so "Mini" is an
/// 8 %-wide disc — small enough that a fingertip never hides it completely.
let padSizes: [Double] = [4.0, 4.8, 5.6, 6.8]
let padSizeNames = ["Mini", "Küçük", "Orta", "Büyük"]
/// How far ahead of the fingertip the mallet sits, in field units.
let gripLeads: [Double] = [0, 6, 10, 15]
let gripNames = ["Kapalı", "Az", "Orta", "Çok"]

/// The palette every view and the rink renderer read from. Changed only by
/// `Prefs.apply()`, which also nudges SwiftUI to redraw.
var PAL: Palette = Palettes.krem

final class Prefs: ObservableObject {
    static let shared = Prefs()

    @Published var theme: String { didSet { PAL = Palettes.named(theme); save() } }
    @Published var puck: String { didSet { save() } }
    @Published var padIndex: Int { didSet { save() } }
    @Published var gripIndex: Int { didSet { save() } }
    /// Last match rules, so the same two people do not re-pick them every time.
    @Published var mode: GameMode { didSet { save() } }
    @Published var half: Bool { didSet { save() } }

    private init() {
        let d = UserDefaults.standard
        theme = d.string(forKey: "ah_theme") ?? "krem"
        puck = d.string(forKey: "ah_puck") ?? "tema"
        padIndex = d.object(forKey: "ah_pad") as? Int ?? 1
        gripIndex = d.object(forKey: "ah_grip") as? Int ?? 2
        mode = GameMode.from(d.string(forKey: "ah_mode"))
        half = d.object(forKey: "ah_half") as? Bool ?? true
        PAL = Palettes.named(theme)
    }

    private func save() {
        let d = UserDefaults.standard
        d.set(theme, forKey: "ah_theme")
        d.set(puck, forKey: "ah_puck")
        d.set(padIndex, forKey: "ah_pad")
        d.set(gripIndex, forKey: "ah_grip")
        d.set(mode.rawValue, forKey: "ah_mode")
        d.set(half, forKey: "ah_half")
    }

    var padR: Double { padSizes[min(padIndex, padSizes.count - 1)] }
    var lead: Double { gripLeads[min(gripIndex, gripLeads.count - 1)] }

    /// Gradient stops for the puck as currently configured.
    var puckStops: [Color] {
        PuckSkins.named(puck).stops ?? themePucks[theme] ?? themePucks["krem"]!
    }
}

// MARK: - shorthand used across the views

enum T {
    static var bg: Color   { PAL.bg }
    static var bg2: Color  { PAL.bg2 }
    static var txt: Color  { PAL.txt }
    static var dim: Color  { PAL.dim }
    static var me: Color   { PAL.me }
    static var me2: Color  { PAL.me2 }
    static var foe: Color  { PAL.foe }
    static var gold: Color { PAL.gold }
    static var onMe: Color { PAL.onMe }
    static var line: Color { PAL.line }
    static var card: Color { PAL.card }
    static var ok: Color   { rgb(34, 160, 107) }
}

/// The rink-lit background every screen sits on.
struct Backdrop: View {
    @ObservedObject private var prefs = Prefs.shared

    var body: some View {
        ZStack {
            T.bg
            RadialGradient(colors: [T.me.opacity(PAL.glow ? 0.16 : 0.13), .clear],
                           center: .init(x: 0.5, y: -0.05), startRadius: 0, endRadius: 460)
            RadialGradient(colors: [T.foe.opacity(PAL.glow ? 0.13 : 0.10), .clear],
                           center: .init(x: 0.5, y: 1.05), startRadius: 0, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}

struct PrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: sz(17), weight: .bold))
            .foregroundStyle(T.onMe)
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(
                LinearGradient(colors: [T.me, T.me2],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: T.me.opacity(0.35), radius: 16, y: 8)
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct PlainButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: sz(16), weight: .semibold))
            .foregroundStyle(T.txt)
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(T.line))
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct GhostButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: sz(15), weight: .semibold))
            .foregroundStyle(T.dim)
            .frame(maxWidth: .infinity, minHeight: 44)
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}

struct ChipStyle: ButtonStyle {
    let on: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(on ? T.onMe : T.txt)
            .background(on ? T.me : T.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(on ? T.me : T.line))
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// "Kaç golde biter?" — presets plus a free-form field.
struct ScorePicker: View {
    @Binding var value: Int
    var editable: Bool = true
    private let presets = [5, 6, 7, 8]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Kaç golde biter?")
                .font(.system(size: sz(13), weight: .semibold))
                .foregroundStyle(T.dim)
            HStack(spacing: 8) {
                ForEach(presets, id: \.self) { n in
                    Button {
                        guard editable else { return }
                        value = n
                        Sound.shared.ui()
                    } label: {
                        Text("\(n)")
                            .font(.system(size: sz(17), weight: .heavy))
                            .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(ChipStyle(on: value == n))
                }
                CustomScoreField(value: $value, editable: editable,
                                 isCustom: !presets.contains(value))
            }
        }
        .opacity(editable ? 1 : 0.55)
    }
}

/// "Klasik" / "Şanslı" — the two ways a match can be played.
struct ModePicker: View {
    @Binding var value: GameMode
    var editable: Bool = true

    private let items: [(GameMode, String, String)] = [
        (.classic, "Klasik", "Kurallar sabit"),
        (.lucky, "Şanslı", "Sopalar büyür, buz değişir"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Oyun modu")
                .font(.system(size: sz(13), weight: .semibold))
                .foregroundStyle(T.dim)
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { mode, name, blurb in
                    Button {
                        guard editable else { return }
                        Sound.shared.ui()
                        value = mode
                    } label: {
                        VStack(spacing: 2) {
                            Text(name).font(.system(size: sz(16), weight: .black))
                            Text(blurb)
                                .font(.system(size: sz(11), weight: .semibold))
                                .opacity(0.75)
                                .multilineTextAlignment(.center)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                        }
                        .frame(maxWidth: .infinity, minHeight: 62)
                        .padding(.horizontal, 6)
                    }
                    .buttonStyle(ChipStyle(on: value == mode))
                }
            }
        }
        .opacity(editable ? 1 : 0.55)
    }
}

/// A labelled on/off row, e.g. the half-time break.
struct OptionToggle: View {
    let title: String
    let blurb: String
    @Binding var isOn: Bool
    var editable: Bool = true

    var body: some View {
        Button {
            guard editable else { return }
            Sound.shared.ui()
            isOn.toggle()
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: sz(15), weight: .heavy)).foregroundStyle(T.txt)
                    Text(blurb).font(.system(size: sz(12))).foregroundStyle(T.dim)
                }
                Spacer(minLength: 8)
                Capsule()
                    .fill(isOn ? T.me : T.line)
                    .frame(width: 46, height: 28)
                    .overlay(alignment: isOn ? .trailing : .leading) {
                        Circle().fill(.white)
                            .frame(width: 22, height: 22)
                            .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                            .padding(.horizontal, 3)
                    }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .frame(minHeight: 58)
            .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(isOn ? T.me : T.line))
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.16), value: isOn)
        .opacity(editable ? 1 : 0.55)
    }
}

/// "4 golde devre → 7 golde biter" — what the match will actually look like.
struct MatchPlan: View {
    let target: Int
    var enabled: Bool = true
    private var half: Int { enabled ? Engine.halftimeFor(target) : 0 }

    var body: some View {
        Group {
            if half > 0 {
                HStack(spacing: 10) {
                    part(half, "golde", "devre", T.gold)
                    Text("→").font(.system(size: sz(15), weight: .heavy)).foregroundStyle(T.dim.opacity(0.6))
                    part(target, "golde", "biter", T.me)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(T.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(T.line))
            }
        }
    }

    private func part(_ n: Int, _ mid: String, _ tail: String, _ tint: Color) -> some View {
        HStack(spacing: 4) {
            Text("\(n)").font(.system(size: sz(22), weight: .black, design: .rounded))
                .monospacedDigit().foregroundStyle(T.txt)
            Text(mid).font(.system(size: sz(14), weight: .semibold)).foregroundStyle(T.dim)
            Text(tail).font(.system(size: sz(14), weight: .heavy)).foregroundStyle(tint)
        }
    }
}

private struct CustomScoreField: View {
    @Binding var value: Int
    let editable: Bool
    let isCustom: Bool
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        TextField("…", text: $text)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .font(.system(size: sz(17), weight: .heavy))
            .foregroundStyle(isCustom ? T.onMe : T.txt)
            .focused($focused)
            .disabled(!editable)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(isCustom ? T.me : T.card,
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(isCustom ? T.me : T.line))
            .onChange(of: text) { _, new in
                let digits = new.filter(\.isNumber).prefix(2)
                if digits != new { text = String(digits) }
                if let v = Int(digits), (1...15).contains(v) { value = v }
            }
            .onChange(of: value) { _, new in
                if !isCustom { text = "" } else if text.isEmpty { text = "\(new)" }
            }
            .toolbar {
                if focused {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button("Tamam") { focused = false }
                    }
                }
            }
    }
}
