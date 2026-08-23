import SwiftUI

struct RootView: View {
    @StateObject private var m = GameModel()

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
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(T.txt)
                    .padding(.horizontal, 20).padding(.vertical, 13)
                    .background(Color(red: 0.106, green: 0.153, blue: 0.251),
                                in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(T.line))
                    .shadow(color: .black.opacity(0.6), radius: 18, y: 10)
                    .padding(.bottom, 28)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.22), value: m.toast)
        .preferredColorScheme(.dark)
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
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .foregroundStyle(T.me)
                    .shadow(color: T.me.opacity(0.6), radius: 24)
                Text("HOCKEY")
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .foregroundStyle(T.txt)
            }

            Text("Oda kodunu paylaş, anında oyna.\nKayıt yok, indirme yok.")
                .font(.system(size: 14))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            VStack(spacing: 11) {
                Button { m.startOnline() } label: {
                    row(icon: "globe", title: "Online Oyna", sub: "Arkadaşınla, uzaktan")
                }
                .buttonStyle(PrimaryButton())

                Button { m.go(.local) } label: {
                    row(icon: "iphone.gen3", title: "Aynı Telefonda 2 Kişi", sub: "Tek ekran, çift dokunuş")
                }
                .buttonStyle(PlainButton())
            }
            .padding(.top, 6)

            HStack(spacing: 12) {
                Text("Adın").font(.system(size: 13, weight: .semibold)).foregroundStyle(T.dim)
                TextField("Oyuncu", text: $name)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .font(.system(size: 15))
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(T.card, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(T.line))
                    .onChange(of: name) { _, v in m.saveName(v) }
            }

            Spacer()

            Button { m.showSettings = true } label: {
                HStack(spacing: 8) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)
                        .shadow(color: statusColor, radius: 5)
                    Text(statusText).font(.system(size: 12)).foregroundStyle(T.dim)
                    Image(systemName: "gearshape.fill").font(.system(size: 11)).foregroundStyle(T.dim)
                }
            }
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 430)
        .onAppear { if name.isEmpty && m.myName != "Oyuncu" { name = m.myName } }
    }

    private func row(icon: String, title: String, sub: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 16, weight: .bold))
                Text(sub).font(.system(size: 12, weight: .medium)).opacity(0.7)
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
                    .font(.system(size: 24, weight: .bold)).foregroundStyle(T.txt)
                    .padding(.top, 24)

                card {
                    Text("Oda Oluştur").font(.system(size: 17, weight: .bold)).foregroundStyle(T.txt)
                    Text("Sen kur, kodu arkadaşına gönder.")
                        .font(.system(size: 13)).foregroundStyle(T.dim)
                    ScorePicker(value: $m.pendingTarget)
                    Button("Oda Oluştur") { m.createRoom() }.buttonStyle(PrimaryButton())
                }

                card {
                    Text("Odaya Katıl").font(.system(size: 17, weight: .bold)).foregroundStyle(T.txt)
                    Text("Arkadaşının gönderdiği 4 haneli kodu gir.")
                        .font(.system(size: 13)).foregroundStyle(T.dim)
                    TextField("ABCD", text: $m.joinCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                        .multilineTextAlignment(.center)
                        .font(.system(size: 34, weight: .black, design: .rounded))
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
            .frame(maxWidth: 430)
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
        VStack(spacing: 16) {
            Spacer()
            Text("Oda Kodu").font(.system(size: 24, weight: .bold)).foregroundStyle(T.txt)

            Text(m.code)
                .font(.system(size: 68, weight: .black, design: .rounded))
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
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(T.txt)
                        .frame(minHeight: 58)
                        .background(T.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(T.line))
                }
            }

            HStack(spacing: 12) {
                slot(name: m.myName, sub: "Sen", color: T.me, waiting: false)
                Text("VS").font(.system(size: 12, weight: .heavy)).foregroundStyle(T.dim)
                slot(name: m.foePresent ? m.foeName : "Bekleniyor…",
                     sub: m.foePresent ? "Hazır" : "Kodu paylaş",
                     color: T.foe, waiting: !m.foePresent)
            }

            if m.mySide == "a" {
                ScorePicker(value: Binding(get: { m.target }, set: { m.changeTarget($0) }))
                Text("Skoru sen belirliyorsun. Rakip katılınca oyun başlar.")
                    .font(.system(size: 13)).foregroundStyle(T.dim)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("Oda sahibi \(m.target) golde bitecek şekilde ayarladı.")
                    .font(.system(size: 13)).foregroundStyle(T.dim)
            }

            Spacer()
            Button("← Odadan Çık") { m.leaveLobby() }.buttonStyle(GhostButton())
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 430)
    }

    private func slot(name: String, sub: String, color: Color, waiting: Bool) -> some View {
        VStack(spacing: 5) {
            Circle()
                .fill(waiting ? Color(red: 0.227, green: 0.271, blue: 0.376) : color)
                .frame(width: 26, height: 26)
                .shadow(color: waiting ? .clear : color, radius: 10)
            Text(name).font(.system(size: 14, weight: .bold)).foregroundStyle(T.txt).lineLimit(1)
            Text(sub).font(.system(size: 11)).foregroundStyle(T.dim)
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
        VStack(spacing: 18) {
            Spacer()
            Text("Aynı Telefonda 2 Kişi")
                .font(.system(size: 24, weight: .bold)).foregroundStyle(T.txt)

            (Text("Telefonu aranıza koyun.\n")
             + Text("Alt yarı").foregroundColor(T.me)
             + Text(" bir oyuncunun, ")
             + Text("üst yarı").foregroundColor(T.foe)
             + Text(" diğerinin."))
                .font(.system(size: 14))
                .foregroundStyle(T.dim)
                .multilineTextAlignment(.center)

            ScorePicker(value: $m.localTarget)
            Button("Başlat") { m.startLocal() }.buttonStyle(PrimaryButton())
            Spacer()
            Button("← Geri") { m.go(.menu) }.buttonStyle(GhostButton())
        }
        .padding(.horizontal, 20)
        .frame(maxWidth: 430)
    }
}

// MARK: - settings

struct SettingsView: View {
    @ObservedObject var m: GameModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("http://sunucu-adresin", text: $m.serverField)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                } header: {
                    Text("Sunucu adresi")
                } footer: {
                    Text("Oyunun çalıştığı adres. Örnek: https://hockey.example.com — aynı Wi-Fi'da test için http://192.168.1.20:8080")
                }

                Section {
                    Toggle("Ses ve titreşim", isOn: Binding(
                        get: { Sound.shared.enabled },
                        set: { Sound.shared.enabled = $0 }))
                }
            }
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
        .preferredColorScheme(.dark)
    }
}
