import XCTest

// Tab Từ vựng: "Đã nhắc" đứng đầu, liệt kê từ đã nhắc gom theo ngày, mỗi từ
// một dòng; bấm từ mở popup chi tiết.
final class RemindedTabUITests: XCTestCase {
    func testRemindedTabListsWordsByDay() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "vocab"]
        app.launch()

        let tab = app.buttons["Đã nhắc"]
        XCTAssertTrue(tab.waitForExistence(timeout: 10))
        // "Đã nhắc" là tab con đầu tiên (bên trái "Đã lưu")
        XCTAssertLessThan(tab.frame.minX, app.buttons["Đã lưu"].frame.minX)
        tab.tap()

        XCTAssertTrue(app.staticTexts["Hôm nay"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Hôm qua"].exists)
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == 'resilient'")).count, 1, "trùng từ trong ngày gộp 1 dòng")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "reminded-tab"
        shot.lifetime = .keepAlways
        add(shot)
        if let dir = ProcessInfo.processInfo.environment["WORDLY_SHOT_DIR"] {
            try? app.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("reminded-tab.png"))
        }

        app.staticTexts["serendipity"].tap()
        XCTAssertTrue(app.staticTexts["serendipity"].waitForExistence(timeout: 5), "bấm từ mở popup chi tiết")
    }
}
