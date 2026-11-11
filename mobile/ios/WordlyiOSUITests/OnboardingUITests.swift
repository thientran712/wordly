import XCTest

// Onboarding 4 màn khi cài mới (chủ dự án chốt 15/10: bắt buộc, không nút bỏ qua) +
// "Có gì mới" / thẻ "Bắt đầu" theo tài khoản (spec 2026-10-15-shared-word-source-design.md §6).
// `-WordlyOnboarding` bật phần giới thiệu trong chế độ xem trước và xoá cờ như máy mới;
// `-WordlyFreshInstall` = vừa cài app, chưa đăng nhập.
final class OnboardingUITests: XCTestCase {
    private func launch(_ extra: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate", "-WordlyOnboarding"] + extra
        app.launch()
        return app
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        add(a)
    }

    private func walkToLastPage(_ app: XCUIApplication) {
        XCTAssertTrue(app.otherElements["onboardingFlow"].waitForExistence(timeout: 10), "cài mới → onboarding")
        for page in 1...3 {
            XCTAssertTrue(app.otherElements["onboardingPage\(page)"].waitForExistence(timeout: 3), "màn \(page)")
            XCTAssertFalse(app.buttons["Bỏ qua"].exists, "bắt buộc, không có nút bỏ qua")
            shot(app, "onboarding-\(page)")
            app.buttons["onboardingNext"].tap()
        }
        XCTAssertTrue(app.otherElements["onboardingPage4"].waitForExistence(timeout: 3), "màn 4")
        XCTAssertFalse(app.buttons["onboardingNext"].exists, "màn cuối chỉ có 2 nút đăng ký / đăng nhập")
        shot(app, "onboarding-4")
    }

    func testFreshInstallWalksFourScreensThenSignup() {
        let app = launch(["-WordlyFreshInstall"])
        walkToLastPage(app)
        app.buttons["onboardingSignup"].tap()
        XCTAssertTrue(app.buttons["signupSubmit"].waitForExistence(timeout: 5), "mở thẳng màn tạo tài khoản")
    }

    func testFreshInstallLastScreenLogin() {
        let app = launch(["-WordlyFreshInstall"])
        walkToLastPage(app)
        app.buttons["onboardingLogin"].tap()
        XCTAssertTrue(app.buttons["Tạo tài khoản mới"].waitForExistence(timeout: 5), "về màn đăng nhập")
        XCTAssertFalse(app.otherElements["onboardingFlow"].exists)
    }

    func testLoggedInExistingUserSkipsFlowAndSeesWhatsNew() {
        let app = launch([])
        XCTAssertTrue(app.otherElements["whatsNew"].waitForExistence(timeout: 10), "tài khoản có từ → Có gì mới")
        XCTAssertFalse(app.otherElements["onboardingFlow"].exists, "người dùng cũ không xem onboarding")
        app.buttons["whatsNewDone"].tap()
        XCTAssertFalse(app.otherElements["setupFlow"].waitForExistence(timeout: 2), "tài khoản có từ không phải thiết lập")
        XCTAssertFalse(app.otherElements["startChecklist"].exists, "thẻ Bắt đầu đã bỏ")
    }

    /// Tài khoản mới: 3 bước bắt buộc (chủ dự án chốt 11/11/2026) — lưu từ → nhắc ôn → widget.
    func testNewAccountWalksSetupThenMainScreen() {
        let app = launch(["-WordlyNoSavedWords", "-WordlyWidgetInstalled"])
        XCTAssertTrue(app.otherElements["setupFlow"].waitForExistence(timeout: 10), "tài khoản mới → thiết lập")
        XCTAssertFalse(app.otherElements["whatsNew"].exists, "tài khoản mới không có Có gì mới")
        XCTAssertFalse(app.buttons["Để sau"].exists, "không có nút bỏ qua")
        XCTAssertFalse(app.buttons["setupSaveWord"].isEnabled, "chưa có nghĩa thì chưa lưu được")
        app.buttons["setupSuggest.resilient"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["setupMeaning"].waitForExistence(timeout: 5), "dịch ngay")
        shot(app, "setup-1")
        app.buttons["setupSaveWord"].tap()

        let enable = app.buttons["setupEnableReminder"]
        XCTAssertTrue(enable.waitForExistence(timeout: 5), "bước 2")
        XCTAssertFalse(app.buttons["Để sau"].exists)
        shot(app, "setup-2")
        enable.tap()
        // Hộp quyền thông báo của iOS (lần đầu trên simulator) — chọn gì cũng đi tiếp
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for label in ["Allow", "Cho phép"] where springboard.buttons[label].waitForExistence(timeout: 3) {
            springboard.buttons[label].tap()
            break
        }

        let finish = app.buttons["setupFinish"]
        XCTAssertTrue(finish.waitForExistence(timeout: 8), "bước 3")
        XCTAssertTrue(app.staticTexts["Đã thêm widget Wordly"].waitForExistence(timeout: 5), "tự nhận widget")
        shot(app, "setup-3")
        finish.tap()
        XCTAssertFalse(app.otherElements["setupFlow"].waitForExistence(timeout: 3), "vào màn chính")
        XCTAssertFalse(app.otherElements["startChecklist"].exists, "thẻ Bắt đầu đã bỏ")
    }
}
