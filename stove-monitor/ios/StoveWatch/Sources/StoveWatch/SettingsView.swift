import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var state: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var confirmUnpair = false

    var body: some View {
        NavigationStack {
            Form {
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
