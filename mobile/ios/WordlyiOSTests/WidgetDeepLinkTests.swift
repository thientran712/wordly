import XCTest
@testable import Wordly

// Bấm widget → mở app đúng từ đang hiện: từ của bạn → Từ vựng > Đã lưu,
// từ kho → Từ vựng > Từ mới, kèm popup nghĩa.
final class WidgetDeepLinkTests: XCTestCase {
    func testSavedWordRoundTrip() throws {
        let item = WidgetWordItem(id: "h-123", word: "resilient", meaning: "kiên cường, mau phục hồi", isSaved: true)
        let url = try XCTUnwrap(WidgetDeepLink(item: item).url)
        XCTAssertEqual(url.scheme, "wordly")
        let link = try XCTUnwrap(WidgetDeepLink(url: url))
        XCTAssertEqual(link.id, "h-123")
        XCTAssertEqual(link.word, "resilient")
        XCTAssertEqual(link.meaning, "kiên cường, mau phục hồi")
        XCTAssertFalse(link.fromBank)
        XCTAssertNil(link.bankWordId)
    }

    func testBankWordExposesWordsTableId() throws {
        let item = WidgetWordItem(id: "bank-9f2c", word: "spill", meaning: "làm đổ & tràn", isSaved: false, fromBank: true)
        let link = try XCTUnwrap(WidgetDeepLink(url: try XCTUnwrap(WidgetDeepLink(item: item).url)))
        XCTAssertTrue(link.fromBank)
        XCTAssertEqual(link.bankWordId, "9f2c")
        XCTAssertEqual(link.meaning, "làm đổ & tràn", "ký tự đặc biệt phải được mã hoá đúng")
    }

    func testIgnoresOtherURLs() {
        XCTAssertNil(WidgetDeepLink(url: URL(string: "com.thientran.wordly://login-callback?code=x")!))
        XCTAssertNil(WidgetDeepLink(url: URL(string: "wordly://word")!), "thiếu id/word")
    }
}
