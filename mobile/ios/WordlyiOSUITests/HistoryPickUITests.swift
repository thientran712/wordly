import XCTest

// Tab Dịch: bấm 1 mục lịch sử (nằm cuối trang) → tự cuộn lên đầu để thấy bản
// dịch, KHÔNG tự tra từ điển AI (tính phí) — có nút "Tra nghĩa" để tự bấm.
final class HistoryPickUITests: XCTestCase {
    func testPickHistoryScrollsUpWithoutAutoLookup() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"]
        app.launch()

        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.waitForExistence(timeout: 10))
        let row = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'meticulous'")).firstMatch
        for _ in 0..<4 where !row.isHittable { scroll.swipeUp() }
        XCTAssertTrue(row.isHittable)
        row.tap()

        let input = app.textViews.firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        XCTAssertTrue(input.isHittable, "phải cuộn lên đầu, thấy ô nhập")
        XCTAssertEqual(input.value as? String, "meticulous")
        XCTAssertTrue(app.buttons["Tra nghĩa"].waitForExistence(timeout: 3), "từ đơn thì có nút để tự tra")
        sleep(1)
        XCTAssertFalse(app.staticTexts["Đang tra từ điển…"].exists, "không được tự tra từ điển")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "history-picked"
        shot.lifetime = .keepAlways
        add(shot)
    }

    func testLongPressDeletesHistoryEntry() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "translate"]
        app.launch()

        let row = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'cơ hội'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.press(forDuration: 1.0)
        let delete = app.buttons["Xoá khỏi lịch sử"]
        XCTAssertTrue(delete.waitForExistence(timeout: 3), "nhấn giữ phải hiện menu xoá")
        delete.tap()
        XCTAssertTrue(app.buttons["Hoàn tác"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["cơ hội"].exists)
    }
}
