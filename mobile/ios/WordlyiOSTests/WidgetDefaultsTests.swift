import XCTest
@testable import Wordly

/// Nền mặc định widget màn hình chính = theme ảnh "Bàn sáng mai" (chủ dự án 11/11/2026),
/// cũng là theme ảnh gói free được dùng thử.
final class WidgetDefaultsTests: XCTestCase {
    func testDefaultHomeThemeIsFreeStudyPhoto() {
        let theme = WidgetDefaults.homeTheme
        XCTAssertEqual(theme.id, "study-bright")
        XCTAssertEqual(theme.name, "Bàn sáng mai")
        XCTAssertNotNil(theme.photo, "phải là theme ảnh")
        XCTAssertTrue(ThemeAccess.isFree(theme), "gói free dùng được — không bị khoá Pro")
    }

    func testSeedOnlyWhenNoSavedWidgetSettings() {
        XCTAssertTrue(WidgetDefaults.needsSeed(hasStoredSettings: false), "máy mới / chưa từng chỉnh widget")
        XCTAssertFalse(WidgetDefaults.needsSeed(hasStoredSettings: true), "đã có cài đặt — giữ lựa chọn của người dùng")
    }

    func testSeededStyleUsesThemePhotoAndKeepsUserBackgroundOff() {
        var style = WidgetSettings.HomeStyle()
        style.apply(WidgetDefaults.homeTheme)
        XCTAssertEqual(style.themePhotoId, "study-bright")
        XCTAssertFalse(style.hasBackgroundImage)
        XCTAssertTrue(style.matches(WidgetDefaults.homeTheme))
    }
}
