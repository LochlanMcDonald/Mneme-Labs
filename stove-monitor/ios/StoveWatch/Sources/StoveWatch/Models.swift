import Foundation

struct DeviceStatus: Codable {
    let deviceId: String
    let name: String
    let state: String // "unknown" | "off" | "on"
    let stateChangedAt: Date?
    let lastSeenAt: Date?
    let snoozed: Bool
    let snoozeUntil: Date?
    let threshold: Double
    let ovenModelId: String?
    let lastSnapshot: SnapshotSummary?

    var isOn: Bool { state == "on" }

    enum CodingKeys: String, CodingKey {
        case deviceId = "device_id"
        case name, state, snoozed, threshold
        case stateChangedAt = "state_changed_at"
        case lastSeenAt = "last_seen_at"
        case snoozeUntil = "snooze_until"
        case ovenModelId = "oven_model_id"
        case lastSnapshot = "last_snapshot"
    }
}

struct SnapshotSummary: Codable {
    let id: String
    let state: String
    let score: Double
    let createdAt: Date?

    enum CodingKeys: String, CodingKey {
        case id, state, score
        case createdAt = "created_at"
    }
}

struct OvenModel: Codable, Identifiable, Hashable {
    let id: String
    let brand: String
    let model: String

    var displayName: String { "\(brand) \(model)" }
}

struct FeedbackResponse: Codable {
    let ok: Bool
    let state: String
}

/// Pairing details for the stove camera, persisted in UserDefaults.
struct Pairing: Codable {
    var serverURL: String
    var deviceId: String
    var deviceKey: String

    private static let key = "stovewatch.pairing"

    static func load() -> Pairing? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(Pairing.self, from: data)
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
