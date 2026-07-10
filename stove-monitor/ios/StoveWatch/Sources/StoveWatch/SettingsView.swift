import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var confirmUnpair = false
    @State private var stoveType: StoveType = .gas

    var body: some View {
        NavigationStack {
            Form {
                Section("Stove type") {
                    Picker("Stove type", selection: $stoveType) {
                        ForEach(StoveType.allCases) { type in
                            Text(type.label).tag(type)
                        }
                    }
                    .pickerStyle(.menu)
                    .onChange(of: stoveType) { _, newType in
                        guard newType.rawValue != state.status?.stoveType else { return }
                        Task { await state.setStoveType(newType) }
                    }
                } footer: {
                    Text(stoveType.detectionSummary)
                }

                Section("Oven") {
                    NavigationLink {
                        OvenModelView()
                    } label: {
                        Label("Oven model & reference photos", systemImage: "oven")
                    }
                }

                Section("Notifications") {
                    Button {
                        PushManager.shared.registerForPushNotifications()
                    } label: {
                        Label("Re-register for notifications", systemImage: "bell.badge")
                    }
                }

                if let status = state.status {
                    Section("Detection") {
                        LabeledContent("Sensitivity threshold",
                                       value: String(format: "%.3f", status.threshold))
                        LabeledContent("Device ID", value: String(status.deviceId.prefix(12)) + "…")
                    } footer: {
                        Text("Lower threshold = more sensitive. It tightens automatically when you report a missed detection.")
                    }
                }

                Section {
                    Button("Unpair camera", role: .destructive) {
                        confirmUnpair = true
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                if let current = state.status.flatMap({ StoveType(rawValue: $0.stoveType) }) {
                    stoveType = current
                }
            }
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .confirmationDialog("Unpair this camera?", isPresented: $confirmUnpair, titleVisibility: .visible) {
                Button("Unpair", role: .destructive) {
                    state.unpair()
                    dismiss()
                }
            }
        }
    }
}
