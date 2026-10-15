import XCTest

// Đồng ý Điều khoản + Chính sách (spec 2026-10-15-terms-consent-design.md):
// người chưa đồng ý thấy màn đồng ý sau đăng nhập; đã đồng ý thì vào thẳng;
// màn đăng nhập có dòng "Bằng việc tiếp tục…"; đăng ký email phải tick ô.
final class TermsConsentUITests: XCTestCase {
    private func launch(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"] + extra
        app.launch()
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    func testNeverConsentedUserGoesStraightInWithoutScreen() {
        let app = launch(["-WordlyNeedsConsent"])
        XCTAssertTrue(app.tabBars.buttons["Dịch"].waitForExistence(timeout: 10), "chưa đồng ý lần nào → tự ghi, vào thẳng")
        XCTAssertFalse(app.buttons["termsAccept"].exists, "không hiện màn đồng ý")
    }

    func testOutdatedTermsShowsUpdateScreenAndAcceptGoesIn() {
        let app = launch(["-WordlyTermsOutdated"])
        let accept = app.buttons["termsAccept"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10), "Điều khoản đổi phiên bản → thấy màn đồng ý lại")
        XCTAssertFalse(app.tabBars.buttons["Dịch"].exists, "chưa đồng ý thì chưa vào app")
        shot(app, "terms-consent-gate")
        accept.tap()
        XCTAssertTrue(app.tabBars.buttons["Dịch"].waitForExistence(timeout: 5), "đồng ý xong vào app")
    }

    func testDeclineOffersSignOutOrDeleteNotSilentDelete() {
        let app = launch(["-WordlyTermsOutdated"])
        let decline = app.buttons["termsDecline"]
        XCTAssertTrue(decline.waitForExistence(timeout: 10))
        decline.tap()
        XCTAssertTrue(app.buttons["Chỉ đăng xuất"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Xoá tài khoản và dữ liệu"].exists)
        shot(app, "terms-consent-decline")
    }

    func testConsentedUserGoesStraightIn() {
        let app = launch([])
        XCTAssertTrue(app.tabBars.buttons["Dịch"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["termsAccept"].exists)
    }

    func testLoginNoticeAndSignupNeedsTick() {
        let app = launch(["-WordlyUIPreviewScreen", "login"])
        let notice = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Bằng việc tiếp tục'")).firstMatch
        XCTAssertTrue(notice.waitForExistence(timeout: 10), "màn đăng nhập phải có dòng đồng ý")
        shot(app, "terms-login-notice")

        app.buttons["Tạo tài khoản mới"].tap()
        let submit = app.buttons["signupSubmit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 5))
        XCTAssertFalse(submit.isEnabled, "chưa tick thì không tạo tài khoản được")
        app.buttons["signupTermsCheckbox"].tap()
        XCTAssertTrue(submit.isEnabled, "tick xong mới tạo được")
        shot(app, "terms-signup-checkbox")
    }
}
