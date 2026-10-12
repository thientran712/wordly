import XCTest
@testable import Wordly

// Thông báo lỗi ở đăng nhập / đăng ký / quên mật khẩu / nhập mã: không ẩn
// nhanh quá (đủ 1,5s mới cho sửa ô làm tắt), không hiện mãi (tự ẩn sau 8s;
// lỗi "gửi mã quá nhanh" giữ tới hết lúc chờ gửi lại).
final class AuthErrorBannerTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1000)

    func testShowSetsMessage() {
        var b = AuthErrorBanner()
        b.show("Email hoặc mật khẩu không đúng", at: t0)
        XCTAssertEqual(b.message, "Email hoặc mật khẩu không đúng")
    }

    func testShowNilOrEmptyClears() {
        var b = AuthErrorBanner()
        b.show("lỗi", at: t0)
        b.show(nil, at: t0)
        XCTAssertNil(b.message)
        b.show("lỗi", at: t0)
        b.show("", at: t0)
        XCTAssertNil(b.message)
    }

    // Bàn phím/autofill bắn sự kiện sửa ô ngay khi lỗi vừa hiện → chưa được tắt
    func testEditRightAfterShowKeepsMessage() {
        var b = AuthErrorBanner()
        b.show("lỗi", at: t0)
        b.userEdited(at: t0.addingTimeInterval(1.0))
        XCTAssertEqual(b.message, "lỗi")
    }

    func testEditAfterMinVisibleHides() {
        var b = AuthErrorBanner()
        b.show("lỗi", at: t0)
        b.userEdited(at: t0.addingTimeInterval(1.5))
        XCTAssertNil(b.message)
    }

    func testAutoHidesAfterEightSeconds() {
        var b = AuthErrorBanner()
        b.show("lỗi", at: t0)
        b.expire(at: t0.addingTimeInterval(7.9))
        XCTAssertEqual(b.message, "lỗi")
        b.expire(at: t0.addingTimeInterval(8))
        XCTAssertNil(b.message)
    }

    // Lần hiện mới tính lại từ đầu — lỗi cũ hết hạn không được tắt lỗi mới
    func testNewShowRestartsTimers() {
        var b = AuthErrorBanner()
        b.show("lỗi 1", at: t0)
        b.show("lỗi 2", at: t0.addingTimeInterval(7))
        b.expire(at: t0.addingTimeInterval(8))
        XCTAssertEqual(b.message, "lỗi 2")
        b.userEdited(at: t0.addingTimeInterval(7.5))
        XCTAssertEqual(b.message, "lỗi 2")
    }

    func testRateLimitedStaysUntilResendAllowed() {
        XCTAssertEqual(AuthErrorBanner.hideAfter(kind: .rateLimited, resendWait: 60), 60)
        XCTAssertEqual(AuthErrorBanner.hideAfter(kind: .rateLimited, resendWait: 3), 8)
        XCTAssertEqual(AuthErrorBanner.hideAfter(kind: .invalidCredentials, resendWait: 60), 8)

        var b = AuthErrorBanner()
        b.show("chờ 1 phút", at: t0, hideAfter: 60)
        b.expire(at: t0.addingTimeInterval(30))
        XCTAssertEqual(b.message, "chờ 1 phút")
        b.expire(at: t0.addingTimeInterval(60))
        XCTAssertNil(b.message)
    }

    func testClear() {
        var b = AuthErrorBanner()
        b.show("lỗi", at: t0)
        b.clear()
        XCTAssertNil(b.message)
        XCTAssertNil(b.shownAt)
    }
}
