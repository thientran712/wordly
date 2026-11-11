import XCTest

// Phiên quiz (review UI 11/11/2026, G1/Q1/Q3): đang làm bài thì ẩn thanh tab và
// nút chọn "Quiz từ vựng / Sổ tay câu hay", nút "Tiếp" ghim đáy luôn bấm được,
// có nút đóng để thoát phiên.
final class QuizSessionUITests: XCTestCase {
    func testSessionHidesTabBarAndPickerAndPinsNextButton() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "review"]
        app.launch()

        let start = app.buttons["Bắt đầu"]
        XCTAssertTrue(start.waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.firstMatch.exists, "màn chọn chế độ vẫn có thanh tab")
        start.tap()

        let answer = app.buttons.containing(NSPredicate(format: "label BEGINSWITH 'văn học'")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 10))
        XCTAssertFalse(app.tabBars.firstMatch.isHittable, "trong phiên: ẩn thanh tab")
        XCTAssertFalse(app.buttons["Sổ tay câu hay"].exists, "trong phiên: ẩn nút chọn loại")
        answer.tap()

        let next = app.buttons["Tiếp"]
        XCTAssertTrue(next.waitForExistence(timeout: 5))
        XCTAssertTrue(next.isHittable, "nút Tiếp không bị che")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "quiz-session"
        shot.lifetime = .keepAlways
        add(shot)

        let close = app.buttons["Thoát quiz"]
        XCTAssertTrue(close.exists, "có nút đóng phiên")
        close.tap()
        XCTAssertTrue(app.buttons["Bắt đầu"].waitForExistence(timeout: 5), "đóng → về màn chọn chế độ")
        XCTAssertTrue(app.buttons["Sổ tay câu hay"].exists)
    }
}
