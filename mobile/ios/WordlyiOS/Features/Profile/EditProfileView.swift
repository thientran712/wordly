import SwiftUI

/// Sửa tên, trình độ, mục tiêu học. Sửa trên bản nháp — chỉ ghi vào hồ sơ khi
/// bấm Lưu, thoát ra giữa chừng thì không đổi gì.
struct EditProfileView: View {
    @ObservedObject var vm: ProfileViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var skillLevel = "B1"
    @State private var learningGoal = "daily"
    @State private var loaded = false
    @State private var errorMsg: String?

    private var hasChanges: Bool {
        name.trimmingCharacters(in: .whitespaces) != vm.name || skillLevel != vm.skillLevel || learningGoal != vm.learningGoal
    }

    var body: some View {
        Form {
            Section("Tên hiển thị") {
                TextField("Tên của bạn", text: $name)
                    .textInputAutocapitalization(.words)
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
                } else {
                    Button("Lưu") { Task { await save() } }
                        .fontWeight(.bold)
                        .disabled(!hasChanges)
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
    }

    private func save() async {
        errorMsg = nil
        if await vm.save(name: name.trimmingCharacters(in: .whitespaces), skillLevel: skillLevel, learningGoal: learningGoal) {
            dismiss()
        } else {
            errorMsg = "Không lưu được, kiểm tra kết nối rồi thử lại."
        }
    }
}
