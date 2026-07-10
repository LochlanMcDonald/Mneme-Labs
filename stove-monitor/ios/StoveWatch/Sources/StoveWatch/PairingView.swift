import SwiftUI

/// First-run setup: point the app at the backend and the camera device.
/// The device id + key are printed by `stovecam register` on the Pi.
struct PairingView: View {
    @EnvironmentObject var state: AppState
    @State private var serverURL = "https://"
    @State private var deviceId = ""
    @State private var deviceKey = ""

    private var canPair: Bool {
        URL(string: serverURL)?.host != nil && !deviceId.isEmpty && !deviceKey.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 12) {
                        Image(systemName: "flame.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(.orange)
                        Text("StoveWatch")
                            .font(.largeTitle.bold())
                        Text("Pair with your stove camera to get alerts whenever the stove or oven is in use.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                Section("Server") {
                    TextField("https://stove.example.com", text: $serverURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                Section("Camera device") {
                    TextField("Device ID", text: $deviceId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Device key", text: $deviceKey)
                } footer: {
                    Text("Run `stovecam register` on the camera, then copy the device ID and key from ~/.config/stovecam/credentials.json. Capture the off-state baseline with `stovecam baseline` while the stove is off.")
                }

                Section {
                    Button {
                        state.pair(
                            serverURL: serverURL,
                            deviceId: deviceId.trimmingCharacters(in: .whitespaces),
                            deviceKey: deviceKey.trimmingCharacters(in: .whitespaces))
                    } label: {
                        Text("Pair")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canPair)
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Setup")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
