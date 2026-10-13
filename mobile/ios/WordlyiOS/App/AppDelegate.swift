import UIKit

/// Chỉ để nhận APNs token + gắn delegate thông báo sớm (bấm thông báo khi app
/// đang tắt hẳn vẫn mở đúng từ).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if DEBUG
        if PreviewMode.isOn { return true } // UI test/chụp màn: không gọi Firebase
        #endif
        PushManager.shared.configure()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegister(apnsToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] Đăng ký APNs lỗi: \(error.localizedDescription)")
    }
}
