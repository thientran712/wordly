import SwiftUI
import UserNotifications

/// Thông báo đẩy nhắc ôn từ — cùng form lịch với Email; bật công tắc thì xin
/// quyền iOS, bị từ chối thì công tắc về tắt + nút mở Cài đặt.
struct PushSettingsView: View {
    @StateObject private var vm = ReminderSettingsViewModel(channel: .push)
    @State private var status: UNAuthorizationStatus = .notDetermined
    @Environment(\.openURL) private var openURL

    /// Có Firebase (GoogleService-Info.plist) — màn xem trước Debug coi như có.
    private var available: Bool {
        #if DEBUG
        if PreviewMode.isOn { return true }
        #endif
        return PushManager.shared.isAvailable
    }

    var body: some View {
        Form {
            if !available {
                Section { Text("Bản cài này chưa hỗ trợ thông báo.").foregroundStyle(WordlyColors.inkSoft) }
            } else {
                if status == .denied {
                    Section {
                        Text("Thông báo đang bị tắt trong Cài đặt iOS").font(WordlyFonts.body(14, weight: .semibold))
                        Button("Mở Cài đặt") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                        .foregroundStyle(WordlyColors.electric)
                    }
                }
                switch vm.state {
                case .idle, .loading:
                    Section { LoadingStateView() }
                case .failed(let m):
                    Section { ErrorStateView(message: m) { Task { await vm.load() } } }
                case .loaded:
                    ReminderSettingsForm(vm: vm, toggleTitle: "Nhận thông báo ôn từ",
                                         toggleSubtitle: "Mỗi thông báo nhắc một từ, bấm vào để xem ngay",
                                         onToggle: { on in if on { Task { await askPermission() } } })
                }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Thông báo nhắc ôn")
        .navigationBarTitleDisplayMode(.inline)
        .toast($vm.toast)
        .task {
            status = await PushManager.shared.authorizationStatus()
            if case .idle = vm.state { await vm.load() }
        }
    }

    /// Người dùng vừa bật công tắc → hộp thoại quyền iOS; từ chối → công tắc về tắt.
    private func askPermission() async {
        guard status != .authorized, available else { return }
        let granted = await PushManager.shared.requestPermission()
        status = await PushManager.shared.authorizationStatus()
        if !granted { vm.prefs.enabled = false }
    }
}
