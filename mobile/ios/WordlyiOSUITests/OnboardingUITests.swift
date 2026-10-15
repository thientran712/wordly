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
        XCTAssertTrue(app.otherElements["startChecklist"].waitForExistence(timeout: 5))
    }

    func testNewAccountNoWhatsNewButChecklistAndGuide() {
        let app = launch(["-WordlyNoSavedWords"])
        let card = app.otherElements["startChecklist"]
        XCTAssertTrue(card.waitForExistence(timeout: 10), "tài khoản mới có thẻ Bắt đầu")
        XCTAssertFalse(app.otherElements["whatsNew"].exists, "tài khoản mới không có Có gì mới")
        app.buttons["checklist.lockWidget"].tap()
        XCTAssertTrue(app.otherElements["widgetAddGuide"].waitForExistence(timeout: 5))
        app.buttons["widgetAddGuideClose"].tap()
        app.buttons["checklistDismiss"].tap()
        XCTAssertFalse(card.waitForExistence(timeout: 2), "✕ ẩn thẻ")
    }
}
