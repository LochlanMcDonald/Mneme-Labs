import Foundation
import UIKit

enum APIError: LocalizedError {
    case notPaired
    case badURL
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .notPaired: return "Not paired with a stove camera yet."
        case .badURL: return "The server address is invalid."
        case .server(let code, let message): return "Server error \(code): \(message)"
        }
    }
}

/// Thin async client for the StoveWatch backend.
final class APIClient {
    var pairing: Pairing?

    init(pairing: Pairing? = Pairing.load()) {
        self.pairing = pairing
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let value = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: value) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: value) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath, debugDescription: "Unparseable date \(value)"))
        }
        return decoder
    }()

    private func request(
        path: String,
        method: String = "GET",
        json: [String: Any]? = nil,
        authenticated: Bool = true
    ) async throws -> Data {
        guard let pairing else { throw APIError.notPaired }
        guard let url = URL(string: pairing.serverURL + path) else { throw APIError.badURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        if authenticated {
            req.setValue("Bearer \(pairing.deviceKey)", forHTTPHeaderField: "Authorization")
        }
        if let json {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: json)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.server(status, String(data: data, encoding: .utf8) ?? "")
        }
        return data
    }

    private var devicePath: String {
        "/api/devices/\(pairing?.deviceId ?? "")"
    }

    // MARK: - Status

    func status() async throws -> DeviceStatus {
        let data = try await request(path: "\(devicePath)/status")
        return try Self.decoder.decode(DeviceStatus.self, from: data)
    }

    func latestSnapshot() async throws -> UIImage? {
        let data = try await request(path: "\(devicePath)/snapshots/latest.jpg")
        return UIImage(data: data)
    }

    // MARK: - Actions

    func snooze(minutes: Int) async throws {
        _ = try await request(path: "\(devicePath)/snooze", method: "POST", json: ["minutes": minutes])
    }

    func clearSnooze() async throws {
        _ = try await request(path: "\(devicePath)/snooze", method: "DELETE")
    }

    /// The "you're incorrect" button: disputes the state the server currently reports.
    func reportIncorrect(currentState: String) async throws -> FeedbackResponse {
        let data = try await request(
            path: "\(devicePath)/feedback", method: "POST",
            json: ["disputed_state": currentState])
        return try Self.decoder.decode(FeedbackResponse.self, from: data)
    }

    func registerPushToken(_ token: String) async throws {
        _ = try await request(
            path: "\(devicePath)/push-token", method: "POST",
            json: ["token": token, "platform": "ios"])
    }

    // MARK: - Oven models

    func searchOvenModels(query: String) async throws -> [OvenModel] {
        var components = URLComponents(string: "/api/oven-models")!
        components.queryItems = [URLQueryItem(name: "query", value: query)]
        let data = try await request(path: components.string!, authenticated: false)
        return try Self.decoder.decode([OvenModel].self, from: data)
    }

    func createOvenModel(brand: String, model: String) async throws -> OvenModel {
        let data = try await request(
            path: "/api/oven-models", method: "POST",
            json: ["brand": brand, "model": model], authenticated: false)
        return try Self.decoder.decode(OvenModel.self, from: data)
    }

    func assignOvenModel(_ modelId: String) async throws {
        _ = try await request(
            path: "\(devicePath)/oven-model", method: "POST",
            json: ["oven_model_id": modelId])
    }

    func uploadModelReference(modelId: String, imageData: Data) async throws {
        guard let pairing,
              let url = URL(string: pairing.serverURL + "/api/oven-models/\(modelId)/references")
        else { throw APIError.notPaired }

        let boundary = "Boundary-\(UUID().uuidString)"
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append(
            "Content-Disposition: form-data; name=\"image\"; filename=\"ref.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        req.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            throw APIError.server(status, String(data: data, encoding: .utf8) ?? "")
        }
    }
}
