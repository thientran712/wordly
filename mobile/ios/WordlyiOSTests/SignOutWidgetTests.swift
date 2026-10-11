import XCTest
@testable import Wordly

// Đăng xuất: widget không còn xoay từ nào (kể cả từ kho chung) mà nhắc đăng nhập.
final class SignOutWidgetTests: XCTestCase {
    private let store = AppGroupStorage.shared
    private let item = WidgetWordItem(id: "x", word: "resilient", meaning: "kiên cường", isSaved: true)

    override func tearDown() {
        store.clearWords()
        store.signedOut = false
    }

    func testClearWordsRemovesBankAndMarksSignedOut() {
        store.saveWords([item])
        store.saveBank([WidgetWordItem(id: "b", word: "spill", meaning: "làm đổ", isSaved: false, fromBank: true)], level: "B1")
        store.signedOut = false

        store.clearWords()

        XCTAssertTrue(store.words.isEmpty)
        XCTAssertTrue(store.bank.isEmpty, "lô từ kho cũng phải xoá, nếu không widget vẫn xoay từ sau khi đăng xuất")
        XCTAssertTrue(store.signedOut)
    }

    func testSavingWordsAfterLoginClearsSignedOut() {
        store.clearWords()
        store.saveWords([item])
        XCTAssertFalse(store.signedOut)
    }
}

// Mở app (scenePhase active) chỉ đồng bộ widget khi lần trước đã cũ — tránh
// tranh mạng với màn đang tải mỗi lần chuyển qua lại giữa app.
final class WidgetSyncThrottleTests: XCTestCase {
    func testRefreshOnlyWhenStale() {
        let t0 = Date(timeIntervalSince1970: 0)
        XCTAssertTrue(WidgetSync.isStale(lastRefresh: nil, now: t0))
        XCTAssertFalse(WidgetSync.isStale(lastRefresh: t0, now: t0.addingTimeInterval(120)))
        XCTAssertTrue(WidgetSync.isStale(lastRefresh: t0, now: t0.addingTimeInterval(301)))
    }
}
