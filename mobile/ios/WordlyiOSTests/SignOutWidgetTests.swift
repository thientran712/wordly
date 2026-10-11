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
