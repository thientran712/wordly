import Foundation

/// Đồng ý Điều khoản sử dụng + Chính sách quyền riêng tư sau khi đăng nhập
/// (docs/superpowers/specs/2026-10-15-terms-consent-design.md). Server báo phiên
/// bản cần đồng ý; hồ sơ cũ hơn → hỏi. Đăng ký email đã tick ô đồng ý → ghi
/// lên server luôn, không hỏi lại.
enum TermsConsent {
    enum Decision: Equatable {
        case ok
        case ask(version: Int)
        case acceptSilently(version: Int)
    }

    /// Email đã tick "Tôi đồng ý" lúc đăng ký — chờ đăng nhập xong để ghi lên server.
    struct PendingStore {
        private static let key = "wordly.terms.pendingAcceptEmail"
        let defaults: UserDefaults

        init(defaults: UserDefaults = .standard) { self.defaults = defaults }

        static func normalize(_ email: String) -> String {
            email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }

        func markAccepted(email: String) { defaults.set(Self.normalize(email), forKey: Self.key) }
        func isAccepted(email: String?) -> Bool {
            guard let email, let saved = defaults.string(forKey: Self.key) else { return false }
            return saved == Self.normalize(email)
        }
        func clear() { defaults.removeObject(forKey: Self.key) }
    }

    static func decision(_ response: ProfileResponse, userEmail: String?,
                         pending: PendingStore = PendingStore()) -> Decision {
        guard let current = response.termsCurrentVersion else { return .ok }
        if (response.profile?.termsVersion ?? 0) >= current { return .ok }
        return pending.isAccepted(email: userEmail) ? .acceptSilently(version: current) : .ask(version: current)
    }
}
