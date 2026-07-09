import Foundation
import SwiftUI

@MainActor
final class AppState: ObservableObject {
    @Published var pairing: Pairing? = Pairing.load()
    @Published var status: DeviceStatus?
    @Published var snapshot: UIImage?
    @Published var lastError: String?
    @Published var isRefreshing = false

    let api = APIClient()
    private var refreshTimer: Timer?

    var isPaired: Bool { pairing != nil }

    func pair(serverURL: String, deviceId: String, deviceKey: String) {
        var url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        while url.hasSuffix("/") { url.removeLast() }
        let pairing = Pairing(serverURL: url, deviceId: deviceId, deviceKey: deviceKey)
        pairing.save()
        self.pairing = pairing
        api.pairing = pairing
        Task { await refresh() }
        PushManager.shared.registerForPushNotifications()
    }

    func unpair() {
        Pairing.clear()
        pairing = nil
        status = nil
        snapshot = nil
    }

    func refresh() async {
        guard isPaired else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            status = try await api.status()
            snapshot = try await api.latestSnapshot()
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    func startAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            Task { await self?.refresh() }
        }
    }

    func stopAutoRefresh() {
        refreshTimer?.invalidate()
        refreshTimer = nil
    }

    func snooze(minutes: Int) async {
        do {
            try await api.snooze(minutes: minutes)
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func clearSnooze() async {
        do {
            try await api.clearSnooze()
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }

    /// "You're incorrect" — dispute whatever the server currently believes.
    func reportIncorrect() async {
        guard let current = status?.state, current == "on" || current == "off" else { return }
        do {
            _ = try await api.reportIncorrect(currentState: current)
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }
}
