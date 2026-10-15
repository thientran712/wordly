import XCTest

// Chủ dự án bỏ thẻ 🔥 (chuỗi ngày liên tiếp + tổng ngày đã học) ở tab Cá nhân (15/10/2026).
final class ProfileNoStreakUITests: XCTestCase {
    func testProfileHasNoStudyDaysCard() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Thiên"].waitForExistence(timeout: 10), "tab Cá nhân đã mở")
        let days = app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'ngày liên tiếp' OR label CONTAINS 'ngày đã học'"))
        XCTAssertEqual(days.count, 0, "không còn hiện số ngày đã học")
    }
}
