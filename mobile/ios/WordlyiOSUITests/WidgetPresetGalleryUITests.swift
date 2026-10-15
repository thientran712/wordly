import XCTest

// Màn "Màn hình chính": nút "Chọn mẫu có sẵn" mở danh sách mẫu (tấm cỡ vừa),
// nút X đóng lại; chạm một mẫu thì áp dụng và tự đóng.
final class WidgetPresetGalleryUITests: XCTestCase {
    private func launch() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile", "-WordlyUIPreviewScreen", "homestyle"]
        app.launch()
        return app
    }

    func testOpenGalleryAndCloseWithX() {
        let app = launch()
        let open = app.buttons["widgetPresetOpen"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        open.tap()

        let close = app.buttons["widgetPresetClose"]
        XCTAssertTrue(close.waitForExistence(timeout: 3), "phải có nút X")
        XCTAssertTrue(app.buttons["widgetPreset.night-desk"].waitForExistence(timeout: 3), "phải có mẫu ảnh góc học đêm")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "widget-preset-gallery"
        shot.lifetime = .keepAlways
        add(shot)

        close.tap()
        XCTAssertFalse(close.waitForExistence(timeout: 1) && close.isHittable, "X phải đóng danh sách mẫu")
        XCTAssertTrue(open.isHittable)
    }

    func testTapPresetAppliesAndCloses() {
        let app = launch()
        app.buttons["widgetPresetOpen"].tap()
        let card = app.buttons["widgetPreset.night-desk"]
        XCTAssertTrue(card.waitForExistence(timeout: 3))
        card.tap()

        XCTAssertFalse(app.buttons["widgetPresetClose"].waitForExistence(timeout: 2) && app.buttons["widgetPresetClose"].isHittable,
                       "chọn mẫu xong phải tự đóng")
        // Mẫu ảnh → phần ảnh nền hiện các nút chỉnh ảnh
        XCTAssertTrue(app.buttons["Chỉnh lại khung"].waitForExistence(timeout: 5), "mẫu ảnh phải đặt ảnh nền")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "widget-preset-applied"
        shot.lifetime = .keepAlways
        add(shot)
    }
}
