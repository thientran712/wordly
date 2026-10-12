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

    private func shot(_ app: XCUIApplication, _ name: String) -> XCTAttachment {
        let a = XCTAttachment(screenshot: app.screenshot())
        a.name = name
        a.lifetime = .keepAlways
        return a
    }
}
