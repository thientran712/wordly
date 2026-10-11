import XCTest

// Đăng ký xong nhưng thoát app trước khi nhập mã: mở lại app, màn đăng nhập
// phải nhắc "Chưa xác nhận email" và dẫn tới màn nhập mã cho đúng email đó.
// Email chờ lưu ở UserDefaults (PendingSignupStore) — launch argument
// `-wordly.pendingSignupEmail` giả lập dữ liệu còn lại từ lần mở trước.
final class PendingSignupUITests: XCTestCase {
    func testRelaunchWithPendingSignupLeadsToCodeScreen() {
        let app = XCUIApplication()
        app.launchArguments = ["-wordly.pendingSignupEmail", "pending-demo@yopmail.com"]
        app.launch()

        let banner = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Chưa xác nhận email'")).firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 15), "màn đăng nhập phải nhắc email chưa xác nhận")
        add(attachment(app, "login-pending-banner"))
        banner.tap()

        XCTAssertTrue(app.staticTexts["Xác nhận email"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts.containing(NSPredicate(format: "label CONTAINS 'pending-demo@yopmail.com'")).firstMatch.exists,
                      "màn nhập mã phải đúng email đang chờ")
        XCTAssertTrue(app.buttons["Gửi lại mã"].exists, "mở lại app (chưa gửi mã trong phiên này) thì gửi lại được ngay")
        add(attachment(app, "signup-code-screen"))
    }

    private func attachment(_ app: XCUIApplication, _ name: String) -> XCTAttachment {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        return a
    }
}
