import Foundation

/// Đồng ý Điều khoản sử dụng + Chính sách quyền riêng tư (spec
/// 2026-10-15-terms-consent-design.md, chủ dự án chốt lại 15/10): đăng nhập là
/// đồng ý — Google/Apple có dòng "Bằng việc tiếp tục…", email có ô tick; tài
/// khoản cũ mặc định đã đồng ý. Chưa ghi lần nào → app tự ghi lên server, không
/// hiện màn. Chỉ hỏi lại (màn đồng ý) khi Điều khoản lên phiên bản mới.
enum TermsConsent {
    enum Decision: Equatable {
        case ok
        case ask(version: Int)
        case acceptSilently(version: Int)
    }

    static func decision(_ response: ProfileResponse) -> Decision {
        guard let current = response.termsCurrentVersion else { return .ok }
        guard let accepted = response.profile?.termsVersion else { return .acceptSilently(version: current) }
        return accepted >= current ? .ok : .ask(version: current)
    }
}
