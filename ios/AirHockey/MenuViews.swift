import SwiftUI

struct RootView: View {
    @StateObject private var m = GameModel()
    @ObservedObject private var prefs = Prefs.shared

    var body: some View {
        ZStack {
            Backdrop()
            switch m.screen {
            case .menu:   MenuView(m: m)
            case .online: OnlineView(m: m)
            case .lobby:  LobbyView(m: m)
            case .local:  LocalView(m: m)
            case .game:   GameView(m: m)
            }
        }
        .overlay(alignment: .bottom) {
            if let t = m.toast {
                Text(t)
                    .font(.system(size: sz(14), weight: .semibold))
                    .foregroundStyle(T.txt)
                    .padding(.horizontal, 20).padding(.vertical, 13)
                    .background(T.bg2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(T.line))
                    .shadow(color: .black.opacity(0.6), radius: 18, y: 10)
                    .padding(.bottom, 28)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.22), value: m.toast)
        .preferredColorScheme(PAL.glow ? .dark : .light)
        .sheet(isPresented: $m.showSettings) { SettingsView(m: m) }
        .onAppear { Sound.shared.start() }
        .onOpenURL { m.openDeepLink($0) }
    }
}

// MARK: - menu

struct MenuView: View {
    @ObservedObject var m: GameModel
    @State private var name = ""

    var body: some View {
        VStack(spacing: 18) {
            Spacer()

            VStack(spacing: -6) {
                Text("AIR")
                    .font(.system(size: sz(56), weight: .black, design: .rounded))
                    .foregroundStyle(T.me)
                    .shadow(color: T.me.opacity(PAL.glow ? 0.6 : 0), radius: 24)
                Text("HOCKEY")
                    .font(.system(size: sz(56), weight: .black, design: .rounded))
                    .foregroundStyle(T.txt)
            }

            Text("Oda kodunu paylaş, anında oyna.\nKayıt yok, indirme yok.")
                .font(.system(size: sz(14)))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            VStack(spacing: 11) {
                Button { m.startOnline() } label: {
                    row(icon: "globe", title: "Online Oyna", sub: "Arkadaşınla, uzaktan")
                }
                .buttonStyle(PrimaryButton())

                Button { m.go(.local) } label: {
                    row(icon: Device.isPad ? "ipad.gen2" : "iphone.gen3", title: Device.sameDevice, sub: "Tek ekran, çift dokunuş")
                }
                .buttonStyle(PlainButton())
            }
            .padding(.top, 6)

            HStack(spacing: 12) {
                Text("Adın").font(.system(size: sz(13), weight: .semibold)).foregroundStyle(T.dim)
                TextField("Oyuncu", text: $name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .font(.system(size: sz(15)))
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(T.card, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(T.line))
                    .onChange(of: name) { _, v in m.saveName(v) }
            }

            Spacer()

            Button { m.showSettings = true } label: {
                Text("Ayarlar")
                    .font(.system(size: sz(16), weight: .bold))
                    .foregroundStyle(T.txt)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .overlay(alignment: .leading) {
                        Image(systemName: "gearshape.fill")
                            .font(.system(size: sz(17)))
                            .foregroundStyle(T.dim)
                            .padding(.leading, 18)
                    }
                    .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(T.line))
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: statusColor, radius: 5)
                Text(statusText).font(.system(size: sz(12))).foregroundStyle(T.dim)
            }
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: Device.column)
        .onAppear { if name.isEmpty && m.myName != "Oyuncu" { name = m.myName } }
    }

    private func row(icon: String, title: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: sz(22)))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: sz(16), weight: .bold))
                Text(sub).font(.system(size: sz(12), weight: .medium)).opacity(0.7)
            }
            Spacer()
        }
        .padding(.horizontal, 18)
    }

    private var statusColor: Color {
        switch m.status {
        case .connected: return T.ok
        case .failed:    return T.foe
        default:         return T.dim
        }
    }

    private var statusText: String {
        switch m.status {
        case .connected:  return "Sunucuya bağlı"
        case .connecting: return "Bağlanıyor…"
        case .failed(let e): return e
        case .idle:       return "Çevrimdışı"
        }
    }
}

// MARK: - online

struct OnlineView: View {
    @ObservedObject var m: GameModel
    @FocusState private var codeFocused: Bool

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("Online Oyna")
                    .font(.system(size: sz(24), weight: .bold)).foregroundStyle(T.txt)
                    .padding(.top, 24)

                card {
                    Text("Oda Oluştur").font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
                    Text("Sen kur, kodu arkadaşına gönder.")
                        .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    ScorePicker(value: $m.pendingTarget)
                    ModePicker(value: $m.pendingMode)
                    OptionToggle(title: "Devre arası", blurb: "Yarı yolda kısa mola",
                                 isOn: $m.pendingHalf)
                    MatchPlan(target: m.pendingTarget, enabled: m.pendingHalf)
                    Button("Oda Oluştur") { m.createRoom() }.buttonStyle(PrimaryButton())
                }
                .onChange(of: m.pendingMode) { _, v in Prefs.shared.mode = v }
                .onChange(of: m.pendingHalf) { _, v in Prefs.shared.half = v }

                card {
                    Text("Odaya Katıl").font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
                    Text("Arkadaşının gönderdiği 4 haneli kodu gir.")
                        .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    TextField("ABCD", text: $m.joinCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .multilineTextAlignment(.center)
                        .font(.system(size: sz(34), weight: .black, design: .rounded))
                        .tracking(12)
                        .foregroundStyle(T.txt)
                        .focused($codeFocused)
                        .frame(minHeight: 70)
                        .background(T.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(T.line))
                        .onChange(of: m.joinCode) { _, v in
                            let clean = String(v.uppercased().filter { $0.isLetter || $0.isNumber }.prefix(4))
                            if clean != v { m.joinCode = clean }
                            if clean.count == 4 { codeFocused = false }
                        }
                    Button("Katıl") { m.joinRoom() }.buttonStyle(PrimaryButton())
                }

                Button("← Geri") { m.go(.menu) }.buttonStyle(GhostButton())
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: Device.column)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    @ViewBuilder
    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12, content: content)
            .padding(18)
            .background(T.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(T.line))
    }
}

// MARK: - lobby

struct LobbyView: View {
    @ObservedObject var m: GameModel
    @State private var showShare = false

    private var inviteText: String {
        "Air Hockey oynayalım! Oda kodum: \(m.code)"
    }

    var body: some View {
        CenteredScroll { lobby }
    }

    private var lobby: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 0)
            Text("Oda Kodu").font(.system(size: sz(24), weight: .bold)).foregroundStyle(T.txt)

            Text(m.code)
                .font(.system(size: sz(68), weight: .black, design: .rounded))
                .tracking(10)
                .foregroundStyle(T.me)
                .shadow(color: T.me.opacity(0.5), radius: 30)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(T.me.opacity(0.05), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(T.me.opacity(0.32), style: StrokeStyle(lineWidth: 1, dash: [6, 5])))

            HStack(spacing: 11) {
                Button {
                    UIPasteboard.general.string = m.code
                    Sound.shared.ui()
                    m.flash("Kod kopyalandı: \(m.code)")
                } label: {
                    Text("Kodu Kopyala").frame(maxWidth: .infinity)
                }
                .buttonStyle(PlainButton())

                ShareLink(item: inviteText) {
                    Text("Paylaş").frame(maxWidth: .infinity)
                        .font(.system(size: sz(16), weight: .semibold))
                        .foregroundStyle(T.txt)
                        .frame(minHeight: 58)
                        .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(T.line))
                }
            }

            HStack(spacing: 12) {
                slot(name: m.myName, sub: "Sen", color: T.me, waiting: false)
                Text("VS").font(.system(size: sz(12), weight: .heavy)).foregroundStyle(T.dim)
                slot(name: m.foePresent ? m.foeName : "Bekleniyor…",
                     sub: m.foePresent ? "Hazır" : "Kodu paylaş",
                     color: T.foe, waiting: !m.foePresent)
            }

            VStack(alignment: .leading, spacing: 12) {
                ScorePicker(value: Binding(get: { m.target }, set: { m.changeTarget($0) }),
                            editable: m.isHost)
                ModePicker(value: Binding(get: { m.gameMode }, set: { m.changeMode($0) }),
                           editable: m.isHost)
                OptionToggle(title: "Devre arası", blurb: "Yarı yolda kısa mola",
                             isOn: Binding(get: { m.halfAt > 0 }, set: { m.changeHalftime($0) }),
                             editable: m.isHost)
                MatchPlan(target: m.target, enabled: m.halfAt > 0)
                Text(m.isHost
                     ? "Kuralları sen belirliyorsun. Rakip katılınca oyun başlar."
                     : "Oda sahibi kuralları belirledi.")
                    .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)
            Button("← Odadan Çık") { m.leaveLobby() }.buttonStyle(GhostButton())
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: Device.column)
        .frame(maxWidth: .infinity)
    }

    private func slot(name: String, sub: String, color: Color, waiting: Bool) -> some View {
        VStack(spacing: 5) {
            Circle()
                .fill(waiting ? Color(red: 0.227, green: 0.271, blue: 0.376) : color)
                .frame(width: 26, height: 26)
                .shadow(color: waiting ? .clear : color, radius: 10)
            Text(name).font(.system(size: sz(14), weight: .bold)).foregroundStyle(T.txt).lineLimit(1)
            Text(sub).font(.system(size: sz(11))).foregroundStyle(T.dim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16).padding(.horizontal, 10)
        .background(T.card.opacity(0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(T.line, style: StrokeStyle(lineWidth: 1, dash: waiting ? [5, 4] : [])))
        .opacity(waiting ? 0.6 : 1)
    }
}

// MARK: - local setup

struct LocalView: View {
    @ObservedObject var m: GameModel

    var body: some View {
        CenteredScroll { setup }
    }

    private var setup: some View {
        VStack(spacing: 18) {
            Spacer(minLength: 0)
            Text(Device.sameDevice)
                .font(.system(size: sz(24), weight: .bold)).foregroundStyle(T.txt)

            (Text("\(Device.itAccCap) aranıza koyun.\n")
             + Text("Alt yarı").foregroundColor(T.me)
             + Text(" bir oyuncunun, ")
             + Text("üst yarı").foregroundColor(T.foe)
             + Text(" diğerinin."))
                .font(.system(size: sz(14)))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            ScorePicker(value: $m.localTarget)
            ModePicker(value: $m.localMode)
            OptionToggle(title: "Devre arası", blurb: "Yarı yolda \(Device.itAcc) çevirin",
                         isOn: $m.localHalf)
            MatchPlan(target: m.localTarget, enabled: m.localHalf)
            if m.localHalf {
                Text("Devrede \(Device.itAcc) 180° çevirirsiniz — herkes bir yarıyı da diğer taraftan oynar.")
                    .font(.system(size: sz(13)))
                    .foregroundStyle(T.dim)
                    .multilineTextAlignment(.center)
            }
            Button("Başlat") { m.startLocal() }.buttonStyle(PrimaryButton())
            Spacer(minLength: 0)
            Button("← Geri") { m.go(.menu) }.buttonStyle(GhostButton())
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: Device.column)
        .frame(maxWidth: .infinity)
        .onChange(of: m.localMode) { _, v in Prefs.shared.mode = v }
        .onChange(of: m.localHalf) { _, v in Prefs.shared.half = v }
    }
}

// MARK: - settings

struct SettingsView: View {
    @ObservedObject var m: GameModel
    @ObservedObject private var prefs = Prefs.shared
    @Environment(\.dismiss) private var dismiss
    /// Where the demo fingertip sits in the preview, in field units.
    @State private var finger = Vec(x: Field.W / 2, y: Field.H - 16)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    card("Zemin", "Çocuklar için açık ve sade zeminler daha rahat görünür.") {
                        OptionGrid(columns: 2, items: Palettes.all.map { ($0.key, $0.name) },
                                   selection: prefs.theme,
                                   swatch: { key in AnyView(
                                       RoundedRectangle(cornerRadius: 5, style: .continuous)
                                           .fill(Palettes.named(key).bg)
                                           .frame(width: 16, height: 16)
                                           .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous)
                                               .stroke(.black.opacity(0.18)))) },
                                   pick: { prefs.theme = $0 })
                    }

                    card("Top Rengi", "Tema, sahaya uygun olanı seçer.") {
                        OptionGrid(columns: 3, items: PuckSkins.all.map { ($0.key, $0.name) },
                                   selection: prefs.puck,
                                   swatch: { key in AnyView(PuckDot(key: key)) },
                                   pick: { prefs.puck = $0 })
                    }

                    card("Sopa Boyutu", "Parmağın sopayı kapatıyorsa küçült.") {
                        OptionGrid(columns: 4,
                                   items: padSizeNames.enumerated().map { (String($0.offset), $0.element) },
                                   selection: String(prefs.padIndex),
                                   swatch: { _ in AnyView(EmptyView()) },
                                   pick: { prefs.padIndex = Int($0) ?? 1 })

                        Text("Parmak Boşluğu")
                            .font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
                            .padding(.top, 4)
                        Text("Sopa parmağının biraz ilerisinde durur; böylece topu ve sopayı görürsün.")
                            .font(.system(size: sz(13))).foregroundStyle(T.dim)
                        OptionGrid(columns: 4,
                                   items: gripNames.enumerated().map { (String($0.offset), $0.element) },
                                   selection: String(prefs.gripIndex),
                                   swatch: { _ in AnyView(EmptyView()) },
                                   pick: { prefs.gripIndex = Int($0) ?? 2 })

                        MalletPreview(finger: $finger)
                            .frame(height: 170)
                        Text("\(padSizeNames[prefs.padIndex]) sopa · parmak boşluğu \(gripNames[prefs.gripIndex].lowercased()) — kesikli daire parmağın.")
                            .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    }

                    card("Sunucu", "Oyunun çalıştığı adres. Aynı Wi-Fi'da test için http://192.168.1.20:8080") {
                        TextField("https://sunucu-adresin", text: $m.serverField)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .font(.system(size: sz(15)))
                            .padding(.horizontal, 14).frame(minHeight: 44)
                            .background(T.card, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(T.line))

                        Toggle("Ses ve titreşim", isOn: Binding(
                            get: { Sound.shared.enabled },
                            set: { Sound.shared.enabled = $0 }))
                            .font(.system(size: sz(15), weight: .semibold))
                            .foregroundStyle(T.txt)
                            .tint(T.me)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(maxWidth: Device.isPad ? 620 : 460)
                .frame(maxWidth: .infinity)
            }
            .background(Backdrop())
            .navigationTitle("Ayarlar")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Kaydet") { m.saveServer(); dismiss() }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Kapat") { dismiss() }
                }
            }
        }
        .preferredColorScheme(PAL.glow ? .dark : .light)
    }

    @ViewBuilder
    private func card<C: View>(_ title: String, _ hint: String,
                               @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
            Text(hint).font(.system(size: sz(13))).foregroundStyle(T.dim)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(T.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(T.line))
    }
}

/// A wrapping row of chips, each optionally preceded by a colour swatch.
private struct OptionGrid: View {
    let columns: Int
    let items: [(String, String)]
    let selection: String
    let swatch: (String) -> AnyView
    let pick: (String) -> Void

    var body: some View {
        let rows = stride(from: 0, to: items.count, by: columns).map {
            Array(items[$0..<min($0 + columns, items.count)])
        }
        VStack(spacing: 8) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.0) { key, label in
                        Button {
                            Sound.shared.ui()
                            pick(key)
                        } label: {
                            HStack(spacing: 7) {
                                swatch(key)
                                Text(label)
                                    .font(.system(size: sz(14), weight: .heavy))
                                    .lineLimit(1).minimumScaleFactor(0.8)
                            }
                            .frame(maxWidth: .infinity, minHeight: 50)
                        }
                        .buttonStyle(ChipStyle(on: key == selection))
                    }
                    // keep the last row's chips the same width as the others
                    if row.count < columns {
                        ForEach(0..<(columns - row.count), id: \.self) { _ in
                            Color.clear.frame(maxWidth: .infinity, minHeight: 50)
                        }
                    }
                }
            }
        }
    }
}

private struct PuckDot: View {
    let key: String
    var body: some View {
        let stops = PuckSkins.named(key).stops
        Circle()
            .fill(stops.map {
                AnyShapeStyle(LinearGradient(colors: [$0[0], $0[2]],
                                             startPoint: .topLeading, endPoint: .bottomTrailing))
            } ?? AnyShapeStyle(AngularGradient(
                colors: [.red, .yellow, .blue, .black, .red], center: .center)))
            .frame(width: 15, height: 15)
            .overlay(Circle().stroke(.black.opacity(0.22)))
    }
}

/// Drag the dashed circle — it is roughly a real fingertip — to see whether it
/// swallows the mallet at the current size and grip.
private struct MalletPreview: View {
    @Binding var finger: Vec
    @ObservedObject private var prefs = Prefs.shared
    /// The preview shows the bottom 55 units of the rink.
    private let top = Field.H - 55

    var body: some View {
        Canvas { ctx, size in
            let s = size.width / Field.W
            func X(_ x: Double) -> CGFloat { CGFloat(x) * s }
            func Y(_ y: Double) -> CGFloat { CGFloat(y - top) * s }
            func dot(_ x: Double, _ y: Double, _ r: Double) -> Path {
                Path(ellipseIn: CGRect(x: X(x) - CGFloat(r) * s, y: Y(y) - CGFloat(r) * s,
                                       width: CGFloat(r) * 2 * s, height: CGFloat(r) * 2 * s))
            }

            ctx.fill(Path(CGRect(origin: .zero, size: size)),
                     with: .linearGradient(Gradient(colors: [PAL.ice[1], PAL.ice[0]]),
                                           startPoint: .zero,
                                           endPoint: CGPoint(x: 0, y: size.height)))
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(T.me.opacity(0.06)))

            var goal = Path()
            goal.move(to: CGPoint(x: X(Field.gx0), y: size.height - 4))
            goal.addLine(to: CGPoint(x: X(Field.gx1), y: size.height - 4))
            ctx.stroke(goal, with: .color(T.me),
                       style: StrokeStyle(lineWidth: 7, lineCap: .round))

            ctx.fill(dot(Field.W / 2, top + 9, Field.puckR),
                     with: .radialGradient(Gradient(colors: prefs.puckStops),
                                           center: CGPoint(x: X(Field.W / 2), y: Y(top + 9)),
                                           startRadius: 0, endRadius: CGFloat(Field.puckR) * s * 1.4))

            let r = prefs.padR
            let px = clampd(finger.x, r, Field.W - r)
            let py = clampd(finger.y - prefs.lead, top + r, Field.H - r)
            ctx.fill(dot(px, py, r), with: .color(T.me))
            ctx.fill(dot(px, py, r * 0.52), with: .color(PAL.padInner))

            // a real fingertip is roughly 12 field units across on a phone
            ctx.fill(dot(finger.x, finger.y, 6), with: .color(.black.opacity(0.18)))
            ctx.stroke(dot(finger.x, finger.y, 6), with: .color(.black.opacity(0.45)),
                       style: StrokeStyle(lineWidth: 2.5, dash: [5, 4]))
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(T.line))
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0).onChanged { g in
            // The canvas is Field.W units wide, so one point is 1/s units.
            finger = Vec(x: clampd(Double(g.location.x) / scale(), 0, Field.W),
                         y: clampd(Double(g.location.y) / scale() + top, top, Field.H))
        })
        .background(GeometryReader { geo in
            Color.clear.onAppear { width = geo.size.width }
                .onChange(of: geo.size.width) { _, w in width = w }
        })
    }

    @State private var width: CGFloat = 320
    private func scale() -> Double { Double(width) / Field.W }
}


/// Scrolls when the content is taller than the screen and centres it when it
/// is not — a phone-height form marooned at the top of an iPad reads as broken.
struct CenteredScroll<C: View>: View {
    @ViewBuilder let content: C

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                content
                    .padding(.vertical, 12)
                    .frame(minHeight: geo.size.height - 24)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}
