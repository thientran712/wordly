import SwiftUI

// Cài đặt email nhắc học — giống web /profile/email: bật/tắt, tần suất, 1–10
// khung giờ (mốc :00/:30), múi giờ theo máy. Email chứa từ đã lưu để ôn tập.
struct EmailSettingsView: View {
    @StateObject private var vm = ReminderSettingsViewModel(channel: .email)

    var body: some View {
        Form {
            switch vm.state {
            case .idle, .loading:
                Section { LoadingStateView() }
            case .failed(let m):
                Section { ErrorStateView(message: m) { Task { await vm.load() } } }
            case .loaded:
                ReminderSettingsForm(vm: vm, toggleTitle: "Nhận email ôn từ vựng",
                                     toggleSubtitle: "Mỗi email nhắc lại vài từ bạn đã lưu")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Email nhắc học")
        .navigationBarTitleDisplayMode(.inline)
        .toast($vm.toast)
        .task { if case .idle = vm.state { await vm.load() } }
    }
}
