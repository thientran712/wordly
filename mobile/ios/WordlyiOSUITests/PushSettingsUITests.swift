import XCTest

// Màn Thông báo nhắc ôn: KHÔNG được xin quyền iOS chỉ vì mở màn (cài đặt tải về
// đang bật) — chỉ xin khi người dùng tự gạt công tắc (spec 2026-10-13 mục 6).
// Chạy trên app vừa cài lại (quyền thông báo = chưa hỏi).
final class PushSettingsUITests: XCTestCase {
    func testOpeningScreenDoesNotAskPermission() {
        let app = XCUIApplication()
        app.launchArguments = ["-WordlyUIPreview", "profile", "-WordlyUIPreviewScreen", "push"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Nhắc ôn từ"].waitForExistence(timeout: 10))
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let alert = springboard.alerts.firstMatch
        XCTAssertFalse(alert.waitForExistence(timeout: 4),
                       "mở màn không được bật hộp thoại xin quyền thông báo: \(alert.exists ? alert.label : "")")
    }
}
