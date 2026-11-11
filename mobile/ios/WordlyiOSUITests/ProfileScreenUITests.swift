import XCTest

// Màn Cá nhân: tên chỉ hiện 1 chỗ ở đầu trang, bấm vào mở "Hồ sơ học tập".
final class ProfileScreenUITests: XCTestCase {
    func testHeaderOpensEditProfile() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile"]
        app.launch()

        let header = app.buttons.containing(NSPredicate(format: "label CONTAINS 'Thiên'")).firstMatch
        XCTAssertTrue(header.waitForExistence(timeout: 10))
        sleep(1)
        add(shot(app, "profile"))
        app.swipeUp()
        sleep(1)
        add(shot(app, "profile-bottom"))
        app.swipeDown()

        header.tap()
        XCTAssertTrue(app.navigationBars["Hồ sơ học tập"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.navigationBars.buttons["Lưu"].isEnabled, "chưa sửa gì thì Lưu bị khoá")
        add(shot(app, "edit-profile"))
    }

    // Review UI 11/11 (P3): người dùng miễn phí thấy thẻ Pro có lợi ích + nút rõ ràng
    func testFreeUserSeesProCardWithButton() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile"]
        app.launch()

        let cta = app.buttons["Xem gói Pro"]
        XCTAssertTrue(cta.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Dịch ảnh, giọng nói không giới hạn"].exists)
        cta.tap()
        XCTAssertTrue(app.staticTexts["paywall.headline"].waitForExistence(timeout: 5))
    }

    private func shot(_ app: XCUIApplication, _ name: String) -> XCTAttachment {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        return a
    }
}
