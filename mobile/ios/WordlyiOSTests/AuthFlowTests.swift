import XCTest
@testable import Wordly

// Đăng ký / quên mật khẩu bằng mã OTP 6 số — phân loại lỗi server, đếm ngược
// gửi lại mã, nhớ email chưa xác nhận qua các lần mở app.
final class AuthFlowTests: XCTestCase {
    func testClassifiesByServerErrorCode() {
        XCTAssertEqual(AuthFlow.kind(errorCode: "email_not_confirmed", message: ""), .emailNotConfirmed)
        XCTAssertEqual(AuthFlow.kind(errorCode: "over_email_send_rate_limit", message: ""), .rateLimited)
        XCTAssertEqual(AuthFlow.kind(errorCode: "otp_expired", message: ""), .codeInvalid)
        XCTAssertEqual(AuthFlow.kind(errorCode: "user_already_exists", message: ""), .userExists)
        XCTAssertEqual(AuthFlow.kind(errorCode: "email_exists", message: ""), .userExists)
        XCTAssertEqual(AuthFlow.kind(errorCode: "invalid_credentials", message: ""), .invalidCredentials)
        XCTAssertEqual(AuthFlow.kind(errorCode: "weak_password", message: ""), .weakPassword)
    }

    // Server cũ không gửi error_code — vẫn nhận ra qua message
    func testFallsBackToMessageWhenNoCode() {
        XCTAssertEqual(AuthFlow.kind(errorCode: nil, message: "Email not confirmed"), .emailNotConfirmed)
        XCTAssertEqual(AuthFlow.kind(errorCode: nil, message: "Invalid login credentials"), .invalidCredentials)
        XCTAssertEqual(AuthFlow.kind(errorCode: nil, message: "Token has expired or is invalid"), .codeInvalid)
        XCTAssertEqual(AuthFlow.kind(errorCode: "", message: "The Internet connection appears to be offline."), .network)
        XCTAssertEqual(AuthFlow.kind(errorCode: nil, message: "something else"), .other)
    }

    func testResendCooldown() {
        let sent = Date(timeIntervalSince1970: 1000)
        XCTAssertEqual(AuthFlow.secondsUntilResend(lastSent: nil, now: sent), 0)
        XCTAssertEqual(AuthFlow.secondsUntilResend(lastSent: sent, now: sent.addingTimeInterval(15)), 45)
        XCTAssertEqual(AuthFlow.secondsUntilResend(lastSent: sent, now: sent.addingTimeInterval(60)), 0)
        XCTAssertEqual(AuthFlow.secondsUntilResend(lastSent: sent, now: sent.addingTimeInterval(59.2)), 1, "làm tròn lên, không hiện 0 khi còn chờ")
    }

    func testPendingSignupSurvivesRelaunch() {
        let suite = "AuthFlowTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }

        PendingSignupStore(defaults: defaults).email = "  A@B.com "
        // "Mở lại app" = tạo store mới trên cùng bộ nhớ
        XCTAssertEqual(PendingSignupStore(defaults: defaults).email, "a@b.com")

        PendingSignupStore(defaults: defaults).email = nil
        XCTAssertNil(PendingSignupStore(defaults: defaults).email)
    }
}
