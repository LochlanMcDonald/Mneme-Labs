import SwiftUI

/// Main screen: live stove state, the latest camera frame, snooze controls,
/// and the "you're incorrect" feedback button.
struct StatusView: View {
    @EnvironmentObject var state: AppState
    @State private var showSettings = false
    @State private var confirmIncorrect = false
    @State private var showCustomSnooze = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    stateBadge
                    snapshotCard
                    if let status = state.status {
                        snoozeSection(status: status)
                        incorrectButton(status: status)
                    }
                    if let error = state.lastError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding()
            }
            .navigationTitle(state.status?.name ?? "StoveWatch")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                }
            }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .refreshable { await state.refresh() }
            .task {
                await state.refresh()
                state.startAutoRefresh()
            }
        }
    }

    private var stateBadge: some View {
        let (label, color, icon): (String, Color, String) = {
            switch state.status?.state {
            case "on": return ("STOVE IS ON", .orange, "flame.fill")
            case "off": return ("Stove is off", .green, "checkmark.circle.fill")
            case "changed": return ("Something's on the stove — no heat", .blue, "frying.pan")
            default: return ("Waiting for camera…", .gray, "clock")
            }
        }()
        return VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 56))
                .foregroundStyle(color)
                .symbolEffect(.pulse, isActive: state.status?.isOn == true)
            Text(label)
                .font(.title2.bold())
                .foregroundStyle(color)
            if let changed = state.status?.stateChangedAt {
                Text("since \(changed.formatted(date: .omitted, time: .shortened))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let seen = state.status?.lastSeenAt {
                Text("last checked \(seen.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(color.opacity(0.1), in: RoundedRectangle(cornerRadius: 20))
    }

    private var snapshotCard: some View {
        Group {
            if let image = state.snapshot {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Latest snapshot")
                        .font(.headline)
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    private func snoozeSection(status: DeviceStatus) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Snooze alerts")
                .font(.headline)
            if status.snoozed, let until = status.snoozeUntil {
                HStack {
                    Label(
                        "Snoozed until \(until.formatted(date: .omitted, time: .shortened))",
                        systemImage: "moon.zzz.fill")
                    Spacer()
                    Button("Resume") {
                        Task { await state.clearSnooze() }
                    }
                    .buttonStyle(.borderedProminent)
                }
            } else {
                HStack(spacing: 10) {
                    ForEach([30, 60, 120], id: \.self) { minutes in
                        Button(minutes < 60 ? "\(minutes)m" : "\(minutes / 60)h") {
                            Task { await state.snooze(minutes: minutes) }
                        }
                        .buttonStyle(.bordered)
                        .frame(maxWidth: .infinity)
                    }
                    Button {
                        showCustomSnooze = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .accessibilityLabel("Custom snooze duration")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 16))
        .sheet(isPresented: $showCustomSnooze) {
            CustomSnoozeSheet { minutes in
                Task { await state.snooze(minutes: minutes) }
            }
            .presentationDetents([.height(340)])
        }
    }

    private func incorrectButton(status: DeviceStatus) -> some View {
        Button(role: .destructive) {
            confirmIncorrect = true
        } label: {
            Label("You're incorrect", systemImage: "hand.thumbsdown")
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(status.state == "unknown")
        .confirmationDialog(
            status.isOn
                ? "The stove is actually OFF? StoveWatch will learn this scene and stop alerting on it."
                : "The stove is actually ON? StoveWatch will become more sensitive.",
            isPresented: $confirmIncorrect,
            titleVisibility: .visible
        ) {
            Button("Yes, it's wrong", role: .destructive) {
                Task { await state.reportIncorrect() }
            }
        }
    }
}

/// Wheel picker for an arbitrary snooze duration (up to 24 hours).
struct CustomSnoozeSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var hours = 1
    @State private var minutes = 0
    let onSnooze: (Int) -> Void

    private var totalMinutes: Int { hours * 60 + minutes }

    var body: some View {
        NavigationStack {
            VStack(spacing: 8) {
                HStack(spacing: 0) {
                    Picker("Hours", selection: $hours) {
                        ForEach(0..<24, id: \.self) { Text("\($0) hr").tag($0) }
                    }
                    .pickerStyle(.wheel)
                    Picker("Minutes", selection: $minutes) {
                        ForEach(Array(stride(from: 0, through: 55, by: 5)), id: \.self) {
                            Text("\($0) min").tag($0)
                        }
                    }
                    .pickerStyle(.wheel)
                }
                .frame(height: 160)

                Button {
                    onSnooze(totalMinutes)
                    dismiss()
                } label: {
                    Text(totalMinutes == 0
                        ? "Pick a duration"
                        : "Snooze for \(hours > 0 ? "\(hours)h " : "")\(minutes > 0 ? "\(minutes)m" : "")"
                            .trimmingCharacters(in: .whitespaces))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(totalMinutes == 0)
                .padding(.horizontal)
            }
            .navigationTitle("Custom snooze")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
