import XCTest

// "Xoá hết" lịch sử: phải xác nhận, giữ từ đã lưu, và hoàn tác được.
// Dữ liệu mẫu (PreviewMode): ephemeral/resilient/meticulous đã lưu, "cơ hội" chưa lưu.
final class HistoryClearUITests: XCTestCase {
    func testClearKeepsSavedWordsAndCanUndo() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"]
        app.launch()

        let clear = app.buttons["Xoá lịch sử chưa lưu"]
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.waitForExistence(timeout: 10))
        for _ in 0..<4 where !clear.isHittable { scroll.swipeUp() }
        XCTAssertTrue(clear.waitForExistence(timeout: 5), "nút xoá nằm cuối danh sách")
        clear.tap()

        // Popup xác nhận — huỷ thì không mất gì
        let confirm = app.buttons["Xoá 1 mục chưa lưu"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "phải có popup xác nhận")
        confirm.tap()

        XCTAssertTrue(app.buttons["Hoàn tác"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["cơ hội"].exists, "mục chưa lưu đã bị xoá")
        XCTAssertTrue(app.staticTexts["meticulous"].exists, "từ đã lưu phải còn")

        app.buttons["Hoàn tác"].tap()
        XCTAssertTrue(app.staticTexts["cơ hội"].waitForExistence(timeout: 5), "hoàn tác trả lại mục đã xoá")
    }
}
