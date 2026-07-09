import PhotosUI
import SwiftUI

/// Optional context feature: tell StoveWatch which oven you have and add
/// extra photos of it (in the OFF state). Those photos become additional
/// known-off references for every camera watching that model.
struct OvenModelView: View {
    @EnvironmentObject var state: AppState

    @State private var query = ""
    @State private var results: [OvenModel] = []
    @State private var brand = ""
    @State private var model = ""
    @State private var assignedModel: OvenModel?
    @State private var photoItems: [PhotosPickerItem] = []
    @State private var uploadMessage: String?
    @State private var errorMessage: String?
    @State private var isWorking = false

    var body: some View {
        Form {
            if let assigned = assignedModel {
                Section("Your oven") {
                    LabeledContent("Model", value: assigned.displayName)

                    PhotosPicker(selection: $photoItems, maxSelectionCount: 5, matching: .images) {
                        Label("Add photos of this oven (off)", systemImage: "photo.badge.plus")
                    }
                    .onChange(of: photoItems) { _, items in
                        Task { await uploadPhotos(items, to: assigned) }
                    }

                    if isWorking { ProgressView() }
                    if let uploadMessage {
                        Text(uploadMessage).font(.footnote).foregroundStyle(.green)
                    }
                } footer: {
                    Text("Photos must show the oven while it's OFF. They give the detector more examples of what \"off\" looks like, cutting false alarms.")
                }
            }

            Section("Find your oven model") {
                TextField("Search brand or model…", text: $query)
                    .onChange(of: query) { _, q in
                        Task { await search(q) }
                    }
                ForEach(results) { result in
                    Button {
                        Task { await assign(result) }
                    } label: {
                        HStack {
                            Text(result.displayName)
                            Spacer()
                            if result.id == assignedModel?.id {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }

            Section("Not listed? Add it") {
                TextField("Brand (e.g. GE)", text: $brand)
                TextField("Model (e.g. JB645RKSS)", text: $model)
                Button("Add & select") {
                    Task { await createAndAssign() }
                }
                .disabled(brand.trimmingCharacters(in: .whitespaces).isEmpty
                    || model.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if let errorMessage {
                Text(errorMessage).font(.footnote).foregroundStyle(.red)
            }
        }
        .navigationTitle("Oven model")
        .task { await search("") }
    }

    private func search(_ q: String) async {
        do {
            results = try await state.api.searchOvenModels(query: q)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func assign(_ ovenModel: OvenModel) async {
        do {
            try await state.api.assignOvenModel(ovenModel.id)
            assignedModel = ovenModel
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createAndAssign() async {
        do {
            let created = try await state.api.createOvenModel(
                brand: brand.trimmingCharacters(in: .whitespaces),
                model: model.trimmingCharacters(in: .whitespaces))
            try await state.api.assignOvenModel(created.id)
            assignedModel = created
            brand = ""
            model = ""
            await search(query)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func uploadPhotos(_ items: [PhotosPickerItem], to ovenModel: OvenModel) async {
        guard !items.isEmpty else { return }
        isWorking = true
        defer {
            isWorking = false
            photoItems = []
        }
        var uploaded = 0
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let jpeg = image.jpegData(compressionQuality: 0.8)
            else { continue }
            do {
                try await state.api.uploadModelReference(modelId: ovenModel.id, imageData: jpeg)
                uploaded += 1
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        uploadMessage = uploaded > 0 ? "Uploaded \(uploaded) reference photo\(uploaded == 1 ? "" : "s")." : nil
    }
}
