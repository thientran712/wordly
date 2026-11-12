import XCTest

// Đăng nhập / đăng ký / điều khoản (review UI 11/11):
// A2 Apple/Google lên trên form email, "Tạo tài khoản mới" thấy ngay không cần cuộn;
// A3 đăng ký bỏ ô "Xác nhận mật khẩu"; A5 hộp "Không đồng ý" có lối quay lại.
final class AuthScreensUITests: XCTestCase {
    private func launch(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"] + extra
        app.launch()
        return app
    }

    func testLoginPutsSocialFirstAndSignupVisible() {
        let app = launch(["-WordlyUIPreviewScreen", "login"])
        let google = app.buttons["Tiếp tục với Google"]
        XCTAssertTrue(google.waitForExistence(timeout: 10))
        let email = app.textFields.firstMatch
        XCTAssertLessThan(google.frame.minY, email.frame.minY, "Google/Apple đứng trên form email")
        let signup = app.buttons["Tạo tài khoản mới"]
        XCTAssertTrue(signup.isHittable, "tạo tài khoản thấy ngay, không bị cắt mép đáy")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "login-layout"
        shot.lifetime = .keepAlways
        add(shot)

        signup.tap()
        XCTAssertTrue(app.buttons["signupSubmit"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Xác nhận mật khẩu"].exists, "bỏ ô nhập lại mật khẩu — đã có nút hiện mật khẩu")
    }

    func testDeclineHasReviewTermsOption() {
        let app = launch(["-WordlyTermsOutdated"])
        let decline = app.buttons["termsDecline"]
        XCTAssertTrue(decline.waitForExistence(timeout: 10))
        decline.tap()
        let back = app.buttons["Xem lại điều khoản"]
        XCTAssertTrue(back.waitForExistence(timeout: 3), "lựa chọn an toàn: quay lại đọc điều khoản")
        back.tap()
        XCTAssertTrue(app.buttons["termsAccept"].waitForExistence(timeout: 3), "vẫn ở màn đồng ý")
    }
}
