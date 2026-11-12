import SwiftUI

/// Sửa tên, trình độ, mục tiêu học. Tự lưu như màn Thông báo nhắc ôn (review UI
/// 11/11, P4): đổi picker là lưu ngay; tên lưu khi bấm Xong trên bàn phím hoặc rời màn.
struct EditProfileView: View {
    @ObservedObject var vm: ProfileViewModel
    @State private var name = ""
    @State private var skillLevel = "B1"
    @State private var learningGoal = "daily"
    @State private var loaded = false
    @State private var errorMsg: String?
    @State private var justSaved = false

    private var hasChanges: Bool {
        name.trimmingCharacters(in: .whitespaces) != vm.name || skillLevel != vm.skillLevel || learningGoal != vm.learningGoal
    }

    var body: some View {
        Form {
            Section("Tên hiển thị") {
                TextField("Tên của bạn", text: $name)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .onSubmit { Task { await save() } }
            }
            Section {
                Picker("Trình độ", selection: $skillLevel) {
                    ForEach(ProfileViewModel.levels, id: \.self) { Text(VocabCatalog.levelLabels[$0] ?? $0).tag($0) }
                }
                Picker("Mục tiêu", selection: $learningGoal) {
                    ForEach(ProfileViewModel.goals, id: \.0) { Text($0.1).tag($0.0) }
                }
            } header: {
                Text("Học tập")
            } footer: {
                Text("Wordly dùng trình độ để chọn từ mới phù hợp xen vào widget của bạn.")
            }
            if let errorMsg {
                Section { Text(errorMsg).foregroundStyle(WordlyColors.error) }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Hồ sơ học tập")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if vm.isSaving {
                    ProgressView()
                } else if justSaved {
                    Label("Đã lưu", systemImage: "checkmark")
                        .labelStyle(.titleAndIcon)
                        .font(WordlyFonts.body(13, weight: .semibold))
                        .foregroundStyle(WordlyColors.electric)
                }
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            name = vm.name
            skillLevel = vm.skillLevel
            learningGoal = vm.learningGoal
        }
        .onChange(of: skillLevel) { if loaded { Task { await save() } } }
        .onChange(of: learningGoal) { if loaded { Task { await save() } } }
        // Rời màn khi đang sửa tên dở → vẫn lưu
        .onDisappear { if hasChanges { Task { await save() } } }
    }

    private func save() async {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard hasChanges, !trimmed.isEmpty else { return }   // tên rỗng: giữ tên cũ, không lưu
        errorMsg = nil
        if await vm.save(name: trimmed, skillLevel: skillLevel, learningGoal: learningGoal) {
            justSaved = true
            try? await Task.sleep(for: .seconds(2))
            justSaved = false
        } else {
            errorMsg = "Không lưu được, kiểm tra kết nối rồi thử lại."
        }
    }
}
