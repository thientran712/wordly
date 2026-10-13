import Foundation
import UserNotifications

/// Logic thuần của thông báo đẩy — tách khỏi PushManager để test được.
enum PushLogic {
    static let resyncInterval: TimeInterval = 24 * 3600
    static let promptShownKey = "wordly.push.promptShown"

    /// Gửi lại token lên server: khi bị ép (token mới / đăng nhập) hoặc đã quá
    /// 24 giờ — giữ updated_at tươi cho việc dọn token 270 ngày, mà không gọi
    /// API mỗi lần mở app.
    static func shouldSync(lastSync: Date?, now: Date, force: Bool) -> Bool {
        guard !force, let lastSync else { return true }
        return now.timeIntervalSince(lastSync) >= resyncInterval
    }

    /// `userInfo["link"]` → URL chỉ khi đúng dạng link widget `wordly://word?...`.
    static func linkURL(from userInfo: [AnyHashable: Any]) -> URL? {
        guard let s = userInfo["link"] as? String, let url = URL(string: s), WidgetDeepLink(url: url) != nil else { return nil }
        return url
    }

    /// Thiếu GoogleService-Info.plist (máy dev chưa tải) → app vẫn chạy, chỉ không có push.
    static func hasFirebaseConfig(_ bundle: Bundle) -> Bool {
        bundle.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    static func appVersion(_ bundle: Bundle) -> String {
        let v = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    /// Sheet "Nhắc bạn ôn từ này lúc 20:00?" — chỉ một lần, chỉ khi chưa từng
    /// trả lời hộp thoại quyền của iOS.
    /// App đang mở: vẫn hiện banner (không mất lần nhắc) nhưng không kêu —
    /// người dùng đang nhìn màn hình rồi.
    static let foregroundPresentation: UNNotificationPresentationOptions = [.banner, .list]

    static func shouldOfferPrompt(alreadyShown: Bool, status: UNAuthorizationStatus, pushAvailable: Bool) -> Bool {
        pushAvailable && !alreadyShown && status == .notDetermined
    }
}
