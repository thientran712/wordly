import XCTest

// Chụp ảnh màn hình cho App Store bằng dữ liệu mẫu (PreviewMode, không cần
// tài khoản). Chạy trên simulator iPhone 17 Pro Max (6.9"), lấy ảnh từ
// .xcresult: `xcrun xcresulttool export attachments`.
final class AppStoreScreenshotTests: XCTestCase {
    override func setUp() { continueAfterFailure = false }

    private func launch(_ args: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview"] + args
        app.launch()
        return app
    }

    private func snap(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }

    func test01Translate() {
        let app = launch(["translate"])
        let input = app.textViews.firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("resilient")
        XCTAssertTrue(app.staticTexts["kiên cường, mau phục hồi"].waitForExistence(timeout: 10))
        app.navigationBars.firstMatch.tap()   // ẩn bàn phím
        let lookUp = app.buttons["Tra nghĩa"]
        if lookUp.waitForExistence(timeout: 5) { lookUp.tap() }
        sleep(2)
        snap(app, "01-translate")
    }

    func test02Saved() {
        let app = launch(["vocab"])
        XCTAssertTrue(app.staticTexts["Sắp hiện trên widget"].waitForExistence(timeout: 10))
        sleep(2)
        snap(app, "02-saved-words")
    }

    func test03NewWords() {
        let app = launch(["vocab"])
        let tab = app.buttons["Từ mới"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        tab.tap()
        sleep(3)
        snap(app, "03-new-words")
    }

    func test04Quiz() {
        let app = launch(["review"])
        let start = app.buttons["Bắt đầu"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        start.tap()
        let answer = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'văn học'")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 10))
        answer.tap()
        sleep(2)
        snap(app, "04-quiz")
    }

    func test05WidgetSettings() {
        let app = launch(["profile", "-WordlyUIPreviewScreen", "widget"])
        XCTAssertTrue(app.staticTexts["XEM TRƯỚC — CÁC THẺ SẮP TỚI"].waitForExistence(timeout: 10))
        sleep(2)
        snap(app, "05-widget")
    }
}
