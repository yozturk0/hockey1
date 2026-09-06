import SwiftUI

@main
struct AirHockeyApp: App {
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .onChange(of: phase) { _, new in
            switch new {
            case .active:
                Sound.shared.start()
            case .background:
                Sound.shared.stop()
            default: break
            }
        }
    }
}
