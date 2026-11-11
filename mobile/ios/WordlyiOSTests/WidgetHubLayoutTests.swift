import XCTest
@testable import Wordly

// Review UI 11/11 (W1): chưa có widget loại đang xem → "Cách thêm widget" lên
// đầu trang; có rồi → về cuối trang như cũ.
final class WidgetHubLayoutTests: XCTestCase {
    func testAddGuideFirstOnlyWhenThatWidgetIsMissing() {
        XCTAssertTrue(WidgetHubLayout.addGuideFirst(tab: .lock, lock: false, home: true))
        XCTAssertFalse(WidgetHubLayout.addGuideFirst(tab: .lock, lock: true, home: false))
        XCTAssertTrue(WidgetHubLayout.addGuideFirst(tab: .home, lock: true, home: false))
        XCTAssertFalse(WidgetHubLayout.addGuideFirst(tab: .home, lock: false, home: true))
    }

    func testUnknownStateKeepsGuideAtBottom() {
        // Chưa kiểm xong (nil) → giữ bố cục cũ, không nhảy khối khi vừa mở
        XCTAssertFalse(WidgetHubLayout.addGuideFirst(tab: .lock, installed: nil))
    }
}
