import SwiftUI

enum T {
    static let bg     = Color(red: 0.027, green: 0.043, blue: 0.078)
    static let txt    = Color(red: 0.910, green: 0.933, blue: 0.988)
    static let dim    = Color(red: 0.557, green: 0.627, blue: 0.769)
    static let me     = Color(red: 0.133, green: 0.827, blue: 0.933)
    static let foe    = Color(red: 1.000, green: 0.302, blue: 0.427)
    static let gold   = Color(red: 1.000, green: 0.820, blue: 0.400)
    static let line   = Color.white.opacity(0.14)
    static let card   = Color.white.opacity(0.045)
    static let ok     = Color(red: 0.204, green: 0.827, blue: 0.600)
}

/// The dark rink-lit background every screen sits on.
struct Backdrop: View {
    var body: some View {
        ZStack {
            T.bg
            RadialGradient(colors: [T.me.opacity(0.16), .clear],
                           center: .init(x: 0.5, y: -0.05), startRadius: 0, endRadius: 460)
            RadialGradient(colors: [T.foe.opacity(0.13), .clear],
                           center: .init(x: 0.5, y: 1.05), startRadius: 0, endRadius: 420)
        }
        .ignoresSafeArea()
    }
}

struct PrimaryButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 17, weight: .bold))
            .foregroundStyle(Color(red: 0.012, green: 0.063, blue: 0.094))
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(
                LinearGradient(colors: [T.me, Color(red: 0.231, green: 0.510, blue: 0.965)],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: T.me.opacity(0.45), radius: 16, y: 8)
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct PlainButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
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
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(T.dim)
            .frame(maxWidth: .infinity, minHeight: 44)
            .opacity(configuration.isPressed ? 0.6 : 1)
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(T.dim)
            HStack(spacing: 8) {
                ForEach(presets, id: \.self) { n in
                    Button {
                        guard editable else { return }
                        value = n
                        Sound.shared.ui()
                    } label: {
                        Text("\(n)")
                            .font(.system(size: 17, weight: .heavy))
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

private struct ChipStyle: ButtonStyle {
    let on: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(on ? Color(red: 0.016, green: 0.078, blue: 0.102) : T.txt)
            .background(on ? T.me : T.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(on ? T.me : T.line))
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
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
            .font(.system(size: 17, weight: .heavy))
            .foregroundStyle(isCustom ? Color(red: 0.016, green: 0.078, blue: 0.102) : T.txt)
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
