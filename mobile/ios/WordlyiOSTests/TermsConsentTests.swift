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

    func testDecision() throws {
        // Server cũ chưa có trường → không hỏi (không khoá người dùng)
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1"}}"#), userEmail: nil), .ok)
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1"}, "terms_current_version": 1}"#), userEmail: nil), .ask(version: 1))
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1", "terms_version": 1}, "terms_current_version": 2}"#), userEmail: nil), .ask(version: 2))
        XCTAssertEqual(TermsConsent.decision(try response(#"{"profile": {"id": "u1", "terms_version": 2}, "terms_current_version": 2}"#), userEmail: nil), .ok)
        // Thiếu hồ sơ → vẫn hỏi
        XCTAssertEqual(TermsConsent.decision(try response(#"{"terms_current_version": 1}"#), userEmail: nil), .ask(version: 1))
    }

    func testEmailSignupTickedBoxAcceptsSilently() throws {
        let defaults = UserDefaults(suiteName: "terms-test-\(UUID().uuidString)")!
        let store = TermsConsent.PendingStore(defaults: defaults)
        store.markAccepted(email: "  An@Example.com ")
        let r = try response(#"{"profile": {"id": "u1"}, "terms_current_version": 1}"#)
        XCTAssertEqual(TermsConsent.decision(r, userEmail: "an@example.com", pending: store), .acceptSilently(version: 1))
        // Email khác (người khác đăng nhập trên máy này) → vẫn phải hỏi
        XCTAssertEqual(TermsConsent.decision(r, userEmail: "b@example.com", pending: store), .ask(version: 1))
        store.clear()
        XCTAssertEqual(TermsConsent.decision(r, userEmail: "an@example.com", pending: store), .ask(version: 1))
    }
}
