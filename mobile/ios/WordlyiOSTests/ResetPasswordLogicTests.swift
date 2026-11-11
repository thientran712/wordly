import XCTest
@testable import Wordly

// Đổi mật khẩu bằng mã OTP 6 số gửi qua email (thay link mở web).
final class ResetPasswordLogicTests: XCTestCase {
    func testValidInputHasNoError() {
        XCTAssertNil(ResetPasswordLogic.error(code: "123456", password: "secret1", confirm: "secret1"))
    }

    func testCodeMustBeSixDigits() {
        XCTAssertNotNil(ResetPasswordLogic.error(code: "12345", password: "secret1", confirm: "secret1"))
        XCTAssertNotNil(ResetPasswordLogic.error(code: "12a456", password: "secret1", confirm: "secret1"))
    }

    func testCodeIgnoresSpacesFromPaste() {
        XCTAssertEqual(ResetPasswordLogic.normalizedCode(" 123 456 "), "123456")
        XCTAssertNil(ResetPasswordLogic.error(code: " 123 456 ", password: "secret1", confirm: "secret1"))
    }

    func testPasswordAtLeastSixChars() {
        XCTAssertNotNil(ResetPasswordLogic.error(code: "123456", password: "abc", confirm: "abc"))
    }

    func testPasswordsMustMatch() {
        XCTAssertNotNil(ResetPasswordLogic.error(code: "123456", password: "secret1", confirm: "secret2"))
    }

    // Review UI 11/11 (A4): ô mã 6 số — dán "123 456" hay "Mã: 123456." vẫn ra 6 số
    func testOTPInputKeepsOnlySixDigits() {
        XCTAssertEqual(ResetPasswordLogic.otpInput("123 456"), "123456")
        XCTAssertEqual(ResetPasswordLogic.otpInput("Mã: 1234567"), "123456")
        XCTAssertEqual(ResetPasswordLogic.otpInput("ab"), "")
    }
}
