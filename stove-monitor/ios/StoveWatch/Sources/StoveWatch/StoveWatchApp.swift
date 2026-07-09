import SwiftUI

@main
struct StoveWatchApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if state.isPaired {
                StatusView()
            } else {
                PairingView()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                Task { await state.refresh() }
                state.startAutoRefresh()
            default:
                state.stopAutoRefresh()
            }
        }
    }
}
