import XCTest
@testable import Wordly

// Đăng nhập Google (OAuth qua Supabase) + Apple (id token + nonce).
final class SocialAuthTests: XCTestCase {
    func testNonceIsRandomAndUrlSafe() {
        let a = SocialAuth.randomNonce(), b = SocialAuth.randomNonce()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, b)
        XCTAssertTrue(a.allSatisfy { $0.isLetter || $0.isNumber || "-._".contains($0) })
    }

    // Apple nhận nonce đã băm SHA-256 (hex), Supabase nhận nonce gốc để đối chiếu
    func testSha256Hex() {
        XCTAssertEqual(SocialAuth.sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    func testRedirectUsesBundleScheme() {
        XCTAssertEqual(SocialAuth.redirectURL(bundleId: "com.thientran.wordly").absoluteString,
                       "com.thientran.wordly://login-callback")
    }

    func testCancelledLoginIsNotAnError() {
        XCTAssertNil(SocialAuth.userMessage(for: SocialAuth.Failure.cancelled))
        XCTAssertNotNil(SocialAuth.userMessage(for: SocialAuth.Failure.missingToken))
    }
}
