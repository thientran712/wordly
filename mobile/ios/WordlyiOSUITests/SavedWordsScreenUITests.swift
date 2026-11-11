import XCTest

// Tab Từ vựng — Đã lưu (review UI 11/11):
// S1 thẻ "widget" gọn 1 dòng, danh sách từ thấy ngay màn đầu (chạm thẻ để mở rộng);
// S2 "Ôn bằng quiz" là nút có số từ; S3 thanh tiến độ + mời nâng cấp khi gần đầy.
final class SavedWordsScreenUITests: XCTestCase {
    func testCompactWidgetCardQuizButtonAndProgress() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "vocab"]
        app.launch()

        let card = app.buttons["savedWidgetCard"]
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        XCTAssertLessThan(card.frame.height, 80, "thẻ widget thu còn 1 dòng")

        let quiz = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Ôn ' AND label ENDSWITH ' từ này'")).firstMatch
        XCTAssertTrue(quiz.exists && quiz.isHittable, "nút ôn có số từ, thấy ngay")
        XCTAssertTrue(app.progressIndicators["savedProgress"].exists, "thanh tiến độ từ đã lưu")
        XCTAssertTrue(app.buttons["Nâng cấp để lưu không giới hạn"].exists, "24/30 ≥ 80% → mời nâng cấp")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "saved-compact"
        shot.lifetime = .keepAlways
        add(shot)

        XCTAssertFalse(app.buttons["Tuỳ chỉnh widget"].exists)
        card.tap()
        XCTAssertTrue(app.buttons["Tuỳ chỉnh widget"].waitForExistence(timeout: 3), "chạm → mở rộng xem các từ sắp hiện")
    }
}
