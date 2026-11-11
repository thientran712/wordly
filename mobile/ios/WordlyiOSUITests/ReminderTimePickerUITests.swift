import XCTest

// Chọn giờ gửi nhắc: bấm dòng "Gửi lúc" mở tấm chọn giờ nhỏ (bánh xe) thay vì
// menu dài 48 mốc phủ cả màn hình; "Xong" mới áp giờ đã chọn.
final class ReminderTimePickerUITests: XCTestCase {
    func testTimeRowOpensCompactWheelAndAppliesOnDone() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile", "-WordlyUIPreviewScreen", "push"]
        app.launch()

        let row = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Gửi lúc'")).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        // Review UI 11/11 (M1, M2, G4): đầu mục gọn, không chuỗi múi giờ kỹ thuật,
        // không câu hướng dẫn vuốt; 1 khung giờ thì không có nút xoá
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'miễn phí 1 khung'")).firstMatch.exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Asia/' OR label CONTAINS 'Vuốt'")).firstMatch.exists)
        row.tap()
        XCTAssertFalse(app.buttons["Xoá khung giờ này"].waitForExistence(timeout: 2), "chỉ 1 khung giờ → không xoá được")

        let wheel = app.pickerWheels.firstMatch
        let opened = wheel.waitForExistence(timeout: 3)
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "reminder-time-picker-open"
        shot.lifetime = .keepAlways
        add(shot)
        XCTAssertTrue(opened, "bấm dòng giờ phải mở bánh xe chọn giờ")
        XCTAssertEqual(wheel.value as? String, "20:00")
        // Tấm chọn giờ gọn: không cao quá nửa màn hình
        XCTAssertLessThan(wheel.frame.minY, app.frame.height, "bánh xe phải nằm trong màn")
        XCTAssertGreaterThan(wheel.frame.minY, app.frame.height / 2, "tấm chọn giờ chỉ chiếm nửa dưới màn hình")

        wheel.adjust(toPickerWheelValue: "21:00")
        app.buttons["Xong"].tap()
        XCTAssertFalse(wheel.waitForExistence(timeout: 1) && wheel.isHittable, "Xong phải đóng tấm chọn giờ")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label CONTAINS '21:00'")).firstMatch
            .waitForExistence(timeout: 3), "dòng giờ phải hiện giờ vừa chọn")
    }
}
