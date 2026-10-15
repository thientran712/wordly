import XCTest

// Giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6).
// `-WordlyOnboarding` bật phần giới thiệu trong chế độ xem trước (mặc định tắt để
// không chặn UI test khác) và xoá cờ "đã xem" như máy mới cài.
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

    func testNewAccountSeesWelcomeThenChecklist() {
        let app = launch(["-WordlyNoSavedWords"])
        let welcome = app.otherElements["onboardingWelcome"]
        XCTAssertTrue(welcome.waitForExistence(timeout: 10), "tài khoản mới thấy màn chào")
        shot(app, "welcome-1")
        app.buttons["welcomeNext"].tap()
        app.buttons["welcomeNext"].tap()
        shot(app, "welcome-3")
        app.buttons["welcomeNext"].tap()   // "Bắt đầu"
        XCTAssertTrue(app.otherElements["startChecklist"].waitForExistence(timeout: 5), "tab Dịch có thẻ Bắt đầu")
        XCTAssertFalse(app.otherElements["whatsNew"].exists, "đã xem màn chào thì không hiện Có gì mới")
        shot(app, "checklist")
    }

    func testWelcomeCanBeSkipped() {
        let app = launch(["-WordlyNoSavedWords"])
        XCTAssertTrue(app.buttons["welcomeSkip"].waitForExistence(timeout: 10))
        app.buttons["welcomeSkip"].tap()
        XCTAssertTrue(app.otherElements["startChecklist"].waitForExistence(timeout: 5))
    }

    func testExistingAccountSeesWhatsNew() {
        let app = launch([])
        let whatsNew = app.otherElements["whatsNew"]
        XCTAssertTrue(whatsNew.waitForExistence(timeout: 10), "tài khoản có từ thấy Có gì mới")
        XCTAssertFalse(app.otherElements["onboardingWelcome"].exists)
        shot(app, "whats-new")
        app.buttons["whatsNewDone"].tap()
        XCTAssertFalse(whatsNew.waitForExistence(timeout: 2) && whatsNew.isHittable)
    }

    func testChecklistOpensWidgetGuideAndCanDismiss() {
        let app = launch(["-WordlyNoSavedWords"])
        XCTAssertTrue(app.buttons["welcomeSkip"].waitForExistence(timeout: 10))
        app.buttons["welcomeSkip"].tap()
        let lock = app.buttons["checklist.lockWidget"]
        XCTAssertTrue(lock.waitForExistence(timeout: 5))
        lock.tap()
        XCTAssertTrue(app.otherElements["widgetAddGuide"].waitForExistence(timeout: 5), "mở hướng dẫn thêm widget")
        shot(app, "add-guide")
        app.buttons["widgetAddGuideClose"].tap()
        app.buttons["checklistDismiss"].tap()
        XCTAssertFalse(app.otherElements["startChecklist"].waitForExistence(timeout: 2), "✕ ẩn thẻ")
    }
}
