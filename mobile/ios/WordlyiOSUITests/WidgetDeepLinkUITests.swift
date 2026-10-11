import XCTest

// Bấm widget = mở link wordly://word?... → tab Từ vựng đúng chế độ + popup từ đó.
final class WidgetDeepLinkUITests: XCTestCase {
    func testSavedWordLinkOpensSavedTabPopup() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"]
        app.launch()
        XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 10))

        app.open(URL(string: "wordly://word?id=h2&w=resilient&m=ki%C3%AAn%20c%C6%B0%E1%BB%9Dng&bank=0")!)
        XCTAssertTrue(app.buttons["Đã lưu"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["/rɪˈzɪljənt/"].waitForExistence(timeout: 5)
                      || app.staticTexts["Nghĩa"].waitForExistence(timeout: 1), "popup từ đã lưu phải mở")
        add(shot(app, "deeplink-saved"))
    }

    func testBankWordLinkOpensNewWordsTabPopup() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"]
        app.launch()
        XCTAssertTrue(app.textViews.firstMatch.waitForExistence(timeout: 10))

        app.open(URL(string: "wordly://word?id=bank-abc&w=spill&m=to%20flow%20over%20the%20edge&bank=1")!)
        XCTAssertTrue(app.staticTexts["spill"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["to flow over the edge"].exists)
        add(shot(app, "deeplink-bank"))
    }

    private func shot(_ app: XCUIApplication, _ name: String) -> XCTAttachment {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        return a
    }
}
