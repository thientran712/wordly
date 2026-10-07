import XCTest

// Bàn phím phải đóng khi chạm ra ngoài ô nhập (chạy ở chế độ xem trước, không cần đăng nhập).
final class KeyboardDismissUITests: XCTestCase {
    private func launch(tab: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", tab]
        app.launch()
        return app
    }

    func testTapOutsideClosesKeyboardOnTranslate() {
        let app = launch(tab: "translate")
        let input = app.textViews.firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("hello")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "bàn phím phải hiện khi gõ")

        // Chạm vào thanh ngôn ngữ (không phải ô nhập)
        app.staticTexts["English"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "chạm ngoài ô nhập phải đóng bàn phím")
        // Nút vẫn bấm được bình thường: tab khác vẫn chuyển được
        app.tabBars.buttons["Từ vựng"].tap()
        XCTAssertTrue(app.staticTexts["Từ đã lưu (3)"].waitForExistence(timeout: 10))
    }

    func testTapInsideInputKeepsKeyboard() {
        let app = launch(tab: "translate")
        let input = app.textViews.firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 10))
        input.tap()
        input.typeText("hello")
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.exists, "chạm vào chính ô nhập không được đóng bàn phím")
    }

    func testTapOutsideClosesKeyboardOnJournal() {
        let app = launch(tab: "review")
        app.buttons["Sổ tay câu hay"].tap()
        let field = app.textFields.firstMatch.exists ? app.textFields.firstMatch : app.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText("note")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
        app.navigationBars.firstMatch.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
    }
}
