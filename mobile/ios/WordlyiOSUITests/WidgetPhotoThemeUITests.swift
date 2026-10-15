import XCTest

// Màn "Màn hình chính": theme ảnh nằm ngay trong phần Theme (nhóm Vũ trụ, Thiên
// nhiên…). Chọn theme ảnh → widget có ảnh nền của theme, chỉnh độ tối được;
// "Chỉnh lại khung"/"Xoá ảnh nền" chỉ dành cho ảnh người dùng tự chọn.
final class WidgetPhotoThemeUITests: XCTestCase {
    func testPickPhotoThemeFromThemeSection() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile", "-WordlyUIPreviewScreen", "homestyle"]
        app.launch()

        XCTAssertFalse(app.buttons["widgetPresetOpen"].exists, "không còn nút mẫu riêng — đã gộp vào Theme")

        let groupPicker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Nhóm'")).firstMatch
        XCTAssertTrue(groupPicker.waitForExistence(timeout: 10))
        groupPicker.tap()
        let space = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Vũ trụ'")).firstMatch
        XCTAssertTrue(space.waitForExistence(timeout: 3), "phải có nhóm ảnh Vũ trụ")
        space.tap()

        let photo = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'theme.space'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 5))
        let grid = XCTAttachment(screenshot: app.screenshot())
        grid.name = "photo-theme-grid"
        grid.lifetime = .keepAlways
        add(grid)
        photo.tap()

        XCTAssertTrue(photo.isSelected, "ô vừa chọn được đánh dấu")
        XCTAssertTrue(app.sliders.firstMatch.waitForExistence(timeout: 5), "theme ảnh → chỉnh được độ tối")

        // Máy đang có ảnh người dùng (từ lần chạy trước) → ảnh đó đè theme, có dòng nhắc;
        // xoá ảnh người dùng → quay về ảnh theme, không còn nút chỉnh khung.
        app.swipeUp()
        let removeMine = app.buttons["Xoá ảnh của bạn"]
        if removeMine.waitForExistence(timeout: 2) {
            XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Ảnh của bạn đang đè'")).firstMatch.exists,
                          "có ảnh người dùng + theme ảnh → nhắc ảnh người dùng đang đè")
            removeMine.tap()
        }
        XCTAssertFalse(app.buttons["Chỉnh lại khung"].waitForExistence(timeout: 2), "ảnh theme không phải ảnh của người dùng")
        XCTAssertTrue(app.sliders.firstMatch.exists, "xoá ảnh người dùng vẫn còn ảnh theme")
        let applied = XCTAttachment(screenshot: app.screenshot())
        applied.name = "photo-theme-applied"
        applied.lifetime = .keepAlways
        add(applied)
    }
}
