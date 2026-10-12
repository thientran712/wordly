import Foundation

/// Logic thuần của đăng ký / đăng nhập / quên mật khẩu bằng mã OTP 6 số.
enum AuthFlow {
    enum ErrorKind: Equatable {
        case emailNotConfirmed, rateLimited, codeInvalid, userExists
        case invalidCredentials, weakPassword, network, other
    }

    /// GoTrue chặn gửi email cùng địa chỉ dày hơn 60 giây (SMTP_MAX_FREQUENCY mặc định).
    static let resendCooldown: TimeInterval = 60

    /// Phân loại theo `error_code` của GoTrue; server cũ không có mã thì đoán theo message.
    static func kind(errorCode: String?, message: String) -> ErrorKind {
        switch errorCode ?? "" {
        case "email_not_confirmed": return .emailNotConfirmed
        case "over_email_send_rate_limit", "over_request_rate_limit": return .rateLimited
        case "otp_expired": return .codeInvalid
        case "user_already_exists", "email_exists": return .userExists
        case "invalid_credentials": return .invalidCredentials
        case "weak_password": return .weakPassword
        default: break
        }
        let m = message.lowercased()
        if m.contains("email not confirmed") { return .emailNotConfirmed }
        if m.contains("rate limit") || m.contains("security purposes") { return .rateLimited }
        if m.contains("token has expired") || m.contains("otp") && m.contains("invalid") { return .codeInvalid }
        if m.contains("already registered") { return .userExists }
        if m.contains("invalid login") || m.contains("invalid email or password") { return .invalidCredentials }
        if m.contains("network") || m.contains("internet") || m.contains("offline") { return .network }
        return .other
    }

    static func message(for kind: ErrorKind) -> String {
        switch kind {
        case .emailNotConfirmed: return "Email chưa được xác nhận. Nhập mã 6 số trong email để hoàn tất."
        case .rateLimited: return "Bạn gửi mã hơi nhanh, chờ khoảng 1 phút rồi thử lại."
        case .codeInvalid: return "Mã không đúng hoặc đã hết hạn. Bấm \"Gửi lại mã\" để nhận mã mới."
        case .userExists: return "Email này đã có tài khoản. Đăng nhập hoặc dùng \"Quên mật khẩu\"."
        case .invalidCredentials: return "Email hoặc mật khẩu không đúng"
        case .weakPassword: return "Mật khẩu quá yếu, thử mật khẩu dài hơn."
        case .network: return "Lỗi kết nối mạng. Kiểm tra internet và thử lại."
        case .other: return "Có lỗi xảy ra, thử lại sau ít phút."
        }
    }

    /// Số giây còn phải chờ trước khi được gửi lại mã (làm tròn lên).
    static func secondsUntilResend(lastSent: Date?, now: Date) -> Int {
        guard let lastSent else { return 0 }
        return max(0, Int((resendCooldown - now.timeIntervalSince(lastSent)).rounded(.up)))
    }
}

/// Email đã đăng ký nhưng chưa nhập mã xác nhận — giữ qua các lần thoát/mở
/// app để màn đăng nhập nhắc người dùng hoàn tất, không bị kẹt.
struct PendingSignupStore {
    private static let key = "wordly.pendingSignupEmail"
    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    var email: String? {
        get { defaults.string(forKey: Self.key) }
        nonmutating set {
            let clean = newValue?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            if let clean, !clean.isEmpty { defaults.set(clean, forKey: Self.key) } else { defaults.removeObject(forKey: Self.key) }
        }
    }
}

/// Thông báo lỗi trên màn đăng nhập / đăng ký / quên mật khẩu / nhập mã.
/// Không ẩn nhanh quá: phải hiện đủ `minVisible` thì sửa ô mới làm tắt (bàn
/// phím, autofill bắn sự kiện sửa ngay khi lỗi vừa hiện). Không hiện mãi: tự
/// ẩn sau `autoHide`, riêng lỗi gửi mã quá nhanh giữ tới khi gửi lại được.
struct AuthErrorBanner: Equatable {
    static let minVisible: TimeInterval = 1.5
    static let autoHide: TimeInterval = 8

    private(set) var message: String?
    private(set) var shownAt: Date?
    private(set) var hideAfter: TimeInterval = autoHide

    static func hideAfter(kind: AuthFlow.ErrorKind, resendWait: Int) -> TimeInterval {
        kind == .rateLimited ? max(autoHide, TimeInterval(resendWait)) : autoHide
    }

    /// nil/rỗng = ẩn — để gán thẳng lỗi từ AuthManager (nil khi bắt đầu lượt mới).
    mutating func show(_ message: String?, at now: Date = Date(), hideAfter: TimeInterval = autoHide) {
        guard let message, !message.isEmpty else { clear(); return }
        self.message = message
        shownAt = now
        self.hideAfter = hideAfter
    }

    mutating func userEdited(at now: Date = Date()) {
        guard let shownAt, now.timeIntervalSince(shownAt) >= Self.minVisible else { return }
        clear()
    }

    mutating func expire(at now: Date = Date()) {
        guard let shownAt, now.timeIntervalSince(shownAt) >= hideAfter else { return }
        clear()
    }

    mutating func clear() {
        message = nil
        shownAt = nil
        hideAfter = Self.autoHide
    }
}
