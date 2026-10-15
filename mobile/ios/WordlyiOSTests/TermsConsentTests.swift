import XCTest
@testable import Wordly

// Đồng ý Điều khoản + Chính sách (docs/superpowers/specs/2026-10-15-terms-consent-design.md).
// Server báo phiên bản cần đồng ý (terms_current_version); app chỉ hỏi khi hồ sơ cũ hơn.
final class TermsConsentTests: XCTestCase {
    private func response(_ json: String) throws -> ProfileResponse {
        try JSONDecoder().decode(ProfileResponse.self, from: Data(json.utf8))
    }

    func testDecodesTermsFields() throws {
        let r = try response(#"{"profile": {"id": "u1", "terms_version": 1, "terms_accepted_at": "2026-10-15T10:00:00Z"}, "terms_current_version": 2}"#)
        XCTAssertEqual(r.profile?.termsVersion, 1)
        XCTAssertEqual(r.termsCurrentVersion, 2)
    }

    /// Chủ dự án chốt 15/10: đăng nhập (Google/Apple có dòng "Bằng việc tiếp tục…",
    /// email có ô tick) = đồng ý; tài khoản cũ mặc định đã đồng ý → CHƯA đồng ý lần
    /// nào thì app tự ghi, không hiện màn. Chỉ hỏi lại khi Điều khoản lên phiên bản mới.
    func testDecision() throws {
        // Server cũ chưa có trường → không làm gì
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1"}}"#)), .ok)
        // Chưa đồng ý lần nào (tài khoản mới Google/Apple, tài khoản cũ) → tự ghi
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1"}, "terms_current_version": 1}"#)), .acceptSilently(version: 1))
        XCTAssertEqual(TermsConsent.decision(try response(#"{"terms_current_version": 1}"#)), .acceptSilently(version: 1))
        // Đã đồng ý bản cũ, Điều khoản vừa đổi → hỏi lại một lần
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1", "terms_version": 1}, "terms_current_version": 2}"#)), .ask(version: 2))
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1", "terms_version": 2}, "terms_current_version": 2}"#)), .ok)
    }
}
