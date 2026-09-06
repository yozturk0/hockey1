import SwiftUI

struct RootView: View {
    @StateObject private var m = GameModel()
    @ObservedObject private var prefs = Prefs.shared
    @ObservedObject private var lang = Lang.shared
    /// The very first launch asks which language to play in. Answering stores
    /// the choice, so the question never comes back; Settings is where it
    /// changes from then on.
    @State private var askLanguage = !Lang.shared.answered

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
        .overlay(alignment: .topTrailing) {
            // The rink has its own copy in the HUD, next to the close button.
            if m.screen != .game { ReconnectButton(m: m).padding(.trailing, 14) }
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
        // Every screen reads its text through S(...), which is a plain
        // function rather than a binding; re-keying the tree is what makes a
        // language switch show up everywhere at once.
        .id(lang.code)
        .onChange(of: lang.code) { _, _ in m.retranslateDefaults() }
        .sheet(isPresented: $m.showSettings) { SettingsView(m: m) }
        .fullScreenCover(isPresented: $askLanguage) {
            LanguageGate { askLanguage = false }
        }
        .onAppear { Sound.shared.start() }
        .onOpenURL { m.openDeepLink($0) }
    }
}

/// Sunucuya yeniden bağlan. Always in the same top-right spot, so a frozen
/// match is one tap from being live again instead of a wait.
struct ReconnectButton: View {
    @ObservedObject var m: GameModel
    @State private var spin = false

    var body: some View {
        Button {
            spin.toggle()
            m.reconnectNow()
        } label: {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: sz(15), weight: .bold))
                .foregroundStyle(tint)
                .rotationEffect(.degrees(spin ? 360 : 0))
                .animation(.easeOut(duration: 0.5), value: spin)
                .frame(width: 40, height: 40)
                .background(T.bg.opacity(0.6), in: Circle())
                .overlay(Circle().stroke(T.line))
        }
        .buttonStyle(.plain)
        .disabled(!m.canReconnect)
        .opacity(m.canReconnect ? 1 : 0.4)
    }

    /// The button doubles as the connection lamp: red once the socket is gone.
    private var tint: Color {
        if case .failed = m.status { return T.foe }
        return m.status == .connected ? T.dim : T.gold
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

            Text(S("menu.tagline"))
                .font(.system(size: sz(14)))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            /* "Play" comes first and needs no setup screen at all: somebody
               who has never seen this game is holding a mallet one tap after
               opening it. The two-player and online routes keep their setup,
               because those genuinely have something to agree on. */
            VStack(spacing: 11) {
                Button { m.startSolo() } label: {
                    row(icon: "bolt.fill", title: S("menu.play"), sub: S("menu.playSub"))
                }
                .buttonStyle(PrimaryButton())

                Button { m.go(.local) } label: {
                    row(icon: Device.isPad ? "ipad.gen2" : "iphone.gen3", title: Device.sameDevice, sub: S("menu.localSub"))
                }
                .buttonStyle(PlainButton())

                Button { m.startOnline() } label: {
                    row(icon: "globe", title: S("menu.online"), sub: S("menu.onlineSub"))
                }
                .buttonStyle(PlainButton())
            }
            .padding(.top, 6)

            HStack(spacing: 12) {
                Text(S("menu.name")).font(.system(size: sz(13), weight: .semibold)).foregroundStyle(T.dim)
                TextField(S("menu.namePh"), text: $name)
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
                Text(S("menu.settings"))
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
        .onAppear { if name.isEmpty && m.myName != S("menu.namePh") { name = m.myName } }
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
        case .connected:  return S("net.ok")
        case .connecting: return S("net.connecting")
        case .failed(let e): return e
        case .idle:       return S("net.idle")
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
                Text(S("on.title"))
                    .font(.system(size: sz(24), weight: .bold)).foregroundStyle(T.txt)
                    .padding(.top, 24)

                card {
                    Text(S("on.create")).font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
                    Text(S("on.createHint"))
                        .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    ScorePicker(value: $m.pendingTarget)
                    ModePicker(value: $m.pendingMode)
                    OptionToggle(title: S("com.half"), blurb: S("com.halfSub"),
                                 isOn: $m.pendingHalf)
                    MatchPlan(target: m.pendingTarget, enabled: m.pendingHalf)
                    Button(S("on.create")) { m.createRoom() }.buttonStyle(PrimaryButton())
                }
                .onChange(of: m.pendingMode) { _, v in Prefs.shared.mode = v }
                .onChange(of: m.pendingHalf) { _, v in Prefs.shared.half = v }

                card {
                    Text(S("on.join")).font(.system(size: sz(17), weight: .bold)).foregroundStyle(T.txt)
                    Text(S("on.joinHint"))
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
                    Button(S("on.joinBtn")) { m.joinRoom() }.buttonStyle(PrimaryButton())
                }

                Button(S("com.back")) { m.go(.menu) }.buttonStyle(GhostButton())
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
        S("lob.invite", m.code)
    }

    var body: some View {
        CenteredScroll { lobby }
    }

    private var lobby: some View {
        VStack(spacing: 16) {
            Spacer(minLength: 0)
            Text(S("lob.title")).font(.system(size: sz(24), weight: .bold)).foregroundStyle(T.txt)

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
                    m.flash(S("lob.copied", m.code))
                } label: {
                    Text(S("lob.copy")).frame(maxWidth: .infinity)
                }
                .buttonStyle(PlainButton())

                ShareLink(item: inviteText) {
                    Text(S("lob.share")).frame(maxWidth: .infinity)
                        .font(.system(size: sz(16), weight: .semibold))
                        .foregroundStyle(T.txt)
                        .frame(minHeight: 58)
                        .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(T.line))
                }
            }

            HStack(spacing: 12) {
                slot(name: m.myName, sub: S("lob.you"), color: T.me, waiting: false)
                Text("VS").font(.system(size: sz(12), weight: .heavy)).foregroundStyle(T.dim)
                slot(name: m.foePresent ? m.foeName : S("lob.waiting"),
                     sub: S(m.foePresent ? "lob.ready" : "lob.shareCode"),
                     color: T.foe, waiting: !m.foePresent)
            }

            VStack(alignment: .leading, spacing: 12) {
                ScorePicker(value: Binding(get: { m.target }, set: { m.changeTarget($0) }),
                            editable: m.isHost)
                ModePicker(value: Binding(get: { m.gameMode }, set: { m.changeMode($0) }),
                           editable: m.isHost)
                OptionToggle(title: S("com.half"), blurb: S("com.halfSub"),
                             isOn: Binding(get: { m.halfAt > 0 }, set: { m.changeHalftime($0) }),
                             editable: m.isHost)
                MatchPlan(target: m.target, enabled: m.halfAt > 0)
                Text(S(m.isHost ? "lob.hostNote" : "lob.guestNote"))
                    .font(.system(size: sz(13))).foregroundStyle(T.dim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Spacer(minLength: 0)
            Button(S("lob.leave")) { m.leaveLobby() }.buttonStyle(GhostButton())
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

            (Text(S("loc.put"))
             + Text(S("loc.bottom")).foregroundColor(T.me)
             + Text(S("loc.mid"))
             + Text(S("loc.top")).foregroundColor(T.foe)
             + Text(S("loc.tail")))
                .font(.system(size: sz(14)))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            ScorePicker(value: $m.localTarget)
            ModePicker(value: $m.localMode)
            OptionToggle(title: S("com.half"), blurb: S("loc.halfSub"),
                         isOn: $m.localHalf)
            MatchPlan(target: m.localTarget, enabled: m.localHalf)
            if m.localHalf {
                Text(S("loc.halfHint"))
                    .font(.system(size: sz(13)))
                    .foregroundStyle(T.dim)
                    .multilineTextAlignment(.center)
            }
            Button(S("loc.start")) { m.startLocal() }.buttonStyle(PrimaryButton())
            Spacer(minLength: 0)
            Button(S("com.back")) { m.go(.menu) }.buttonStyle(GhostButton())
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
    @ObservedObject private var lang = Lang.shared
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    card(S("lang.title"), S("lang.hint")) {
                        OptionGrid(columns: 2,
                                   items: Lang.codes.map { ($0, Lang.names[$0] ?? $0) },
                                   selection: lang.code,
                                   swatch: { _ in AnyView(EmptyView()) },
                                   pick: { lang.set($0) })
                    }

                    // A match against the computer has no setup screen, by
                    // design - "Play" starts one instantly. Its rules live
                    // here instead, so instant is the default rather than the
                    // only option, and solo is as adjustable as the other two.
                    card(S("set.solo"), S("set.soloHint")) {
                        ScorePicker(value: $prefs.soloTarget)
                        ModePicker(value: $prefs.soloMode)
                        OptionToggle(title: S("com.half"), blurb: S("set.soloHalf"),
                                     isOn: $prefs.soloHalf)
                        MatchPlan(target: prefs.soloTarget, enabled: prefs.soloHalf)
                    }

                    card(S("set.floor"), S("set.floorHint")) {
                        OptionGrid(columns: 2,
                                   items: Palettes.all.map { ($0.key, S("theme." + $0.key)) },
                                   selection: prefs.theme,
                                   swatch: { key in AnyView(
                                       RoundedRectangle(cornerRadius: 5, style: .continuous)
                                           .fill(Palettes.named(key).bg)
                                           .frame(width: 16, height: 16)
                                           .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous)
                                               .stroke(.black.opacity(0.18)))) },
                                   pick: { prefs.theme = $0 })
                    }

                    card(S("set.puck"), S("set.puckHint")) {
                        OptionGrid(columns: 3,
                                   items: PuckSkins.all.map { ($0.key, S("puck." + $0.key)) },
                                   selection: prefs.puck,
                                   swatch: { key in AnyView(PuckDot(key: key)) },
                                   pick: { prefs.puck = $0 })
                    }

                    card(S("set.server"), S("set.serverHint")) {
                        TextField(S("set.serverPh"), text: $m.serverField)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                            .font(.system(size: sz(15)))
                            .padding(.horizontal, 14).frame(minHeight: 44)
                            .background(T.card, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(T.line))

                        Toggle(S("set.sound"), isOn: Binding(
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
            .navigationTitle(S("set.title"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(S("set.save")) { m.saveServer(); dismiss() }
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button(S("set.close")) { dismiss() }
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

// MARK: - first launch: language

/// Shown once, on the very first launch, with English already ticked. The
/// choice is only written down when the player taps through, so tapping a
/// language just previews it. After that this never appears again — Settings
/// carries the same picker.
struct LanguageGate: View {
    @ObservedObject private var lang = Lang.shared
    /// What is ticked right now, before the player commits.
    @State private var picked = Lang.shared.code
    let done: () -> Void

    var body: some View {
        ZStack {
            Backdrop()
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "globe")
                    .font(.system(size: sz(44), weight: .regular))
                    .foregroundStyle(T.me)
                Text(S("lang.pick"))
                    .font(.system(size: sz(28), weight: .black, design: .rounded))
                    .foregroundStyle(T.txt)
                Text(S("lang.sub"))
                    .font(.system(size: sz(14)))
                    .foregroundStyle(T.dim)
                    .multilineTextAlignment(.center)

                HStack(spacing: 8) {
                    ForEach(Lang.codes, id: \.self) { c in
                        Button {
                            Sound.shared.ui()
                            picked = c
                            lang.set(c, remember: false)   // preview only
                        } label: {
                            Text(Lang.names[c] ?? c)
                                .font(.system(size: sz(16), weight: .heavy))
                                .frame(maxWidth: .infinity, minHeight: 54)
                        }
                        .buttonStyle(ChipStyle(on: c == picked))
                    }
                }
                .padding(.top, 4)

                Button(S("lang.go")) {
                    Sound.shared.ui()
                    lang.set(picked)                       // now it is remembered
                    done()
                }
                .buttonStyle(PrimaryButton())

                Spacer()
            }
            .padding(.horizontal, 24)
            .frame(maxWidth: Device.column)
            .frame(maxWidth: .infinity)
        }
        .preferredColorScheme(PAL.glow ? .dark : .light)
        .interactiveDismissDisabled()
    }
}
