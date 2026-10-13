import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

/// Thông báo đẩy nhắc ôn từ (spec 2026-10-13): Firebase lấy FCM token → đăng
/// ký lên server; bấm thông báo → `pendingURL` (wordly://word?...) → AppRouter.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    /// Link từ thông báo vừa bấm — WordlyApp mở bằng AppRouter rồi xoá.
    @Published var pendingURL: URL?
    /// Có GoogleService-Info.plist + đã configure Firebase.
    private(set) var isAvailable = false
    private var fcmToken: String?
    private let defaults = UserDefaults.standard
    private enum Key {
        static let lastSync = "wordly.push.lastSync"
        static let syncedToken = "wordly.push.syncedToken"
    }

    /// Gọi một lần lúc khởi động (AppDelegate).
    func configure() {
        UNUserNotificationCenter.current().delegate = self
        guard PushLogic.hasFirebaseConfig(Bundle.main) else { return }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        isAvailable = true
        Task {
            if await authorizationStatus() == .authorized {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Hộp thoại quyền của iOS; đồng ý → đăng ký APNs.
    func requestPermission() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    func didRegister(apnsToken: Data) {
        guard isAvailable else { return }
        Messaging.messaging().apnsToken = apnsToken
    }

    /// Đăng ký token lên server (khi đăng nhập, token đổi, hoặc quá 24 giờ).
    func syncIfNeeded(force: Bool = false) async {
        guard isAvailable, AuthManager.shared.isAuthenticated else { return }
        if fcmToken == nil { fcmToken = try? await Messaging.messaging().token() }
        guard let token = fcmToken else { return }
        let changed = defaults.string(forKey: Key.syncedToken) != token
        let last = defaults.object(forKey: Key.lastSync) as? Date
        guard PushLogic.shouldSync(lastSync: last, now: Date(), force: force || changed) else { return }
        do {
            try await APIClient.shared.registerPushDevice(token: token, appVersion: PushLogic.appVersion(Bundle.main))
            defaults.set(Date(), forKey: Key.lastSync)
            defaults.set(token, forKey: Key.syncedToken)
        } catch {
            // Lần mở app sau thử lại (lastSync không đổi)
        }
    }

    /// Gọi TRƯỚC khi đăng xuất (cần Bearer còn sống): xoá token trên server rồi
    /// huỷ token trên máy. Lỗi bỏ qua — người đăng nhập sau sẽ chiếm token.
    func unregister() async {
        guard isAvailable else { return }
        if let token = fcmToken ?? defaults.string(forKey: Key.syncedToken) {
            try? await APIClient.shared.unregisterPushDevice(token: token)
        }
        await forgetLocally()
    }

    /// Sau khi xoá tài khoản (server đã xoá dữ liệu) — chỉ dọn trên máy.
    func forgetLocally() async {
        guard isAvailable else { return }
        try? await Messaging.messaging().deleteToken()
        fcmToken = nil
        defaults.removeObject(forKey: Key.lastSync)
        defaults.removeObject(forKey: Key.syncedToken)
    }

    /// "Bật" trong sheet hỏi một lần: xin quyền → bật push mỗi ngày (server tạo 20:00).
    func enableDailyDefault() async -> Bool {
        guard await requestPermission() else { return false }
        let prefs = EmailPreferences(enabled: true, frequency: "daily", customDays: [1, 2, 3, 4, 5])
        do {
            try await APIClient.shared.savePushPreferences(prefs)
            await syncIfNeeded(force: true)
            return true
        } catch {
            return false
        }
    }
}

extension PushManager: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in
            self.fcmToken = fcmToken
            await self.syncIfNeeded(force: true)
        }
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    /// App đang mở vẫn hiện banner, nhưng không kêu.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        PushLogic.foregroundPresentation
    }

    /// Bấm thông báo → mở đúng từ (cùng đường với bấm widget).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        guard let url = PushLogic.linkURL(from: response.notification.request.content.userInfo) else { return }
        await MainActor.run { self.pendingURL = url }
    }
}
