import XCTest

// Từ vựng > Đã lưu: bấm 1 câu (không phải từ đơn) → popup thấp vừa nội dung,
// chữ căn trái; bấm 1 từ → popup từ điển.
final class SavedWordSheetUITests: XCTestCase {
    func testSentenceAndWordSheets() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "vocab"]
        app.launch()

        let sentence = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'Practice makes perfect'")).firstMatch
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.waitForExistence(timeout: 10))
        for _ in 0..<3 where !sentence.isHittable { scroll.swipeUp() }
        XCTAssertTrue(sentence.waitForExistence(timeout: 5))
        sentence.tap()
        XCTAssertTrue(app.staticTexts["Nghĩa"].waitForExistence(timeout: 5))
        sleep(1)
        add(shot(app, "sentence-sheet"))
        app.swipeDown(velocity: .fast)
        sleep(1)

        let word = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'resilient'")).firstMatch
        for _ in 0..<3 where !word.isHittable { scroll.swipeDown() }
        word.tap()
        sleep(2)
        add(shot(app, "word-sheet"))
    }

    private func shot(_ app: XCUIApplication, _ name: String) -> XCTAttachment {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        return a
    }
}
