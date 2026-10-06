import XCTest
@testable import Wordly

// Chế độ xem trước (chỉ bản Debug): mở thẳng các tab với dữ liệu mẫu để chụp
// màn hình kiểm giao diện mà không cần đăng nhập. Test giữ dữ liệu mẫu khớp
// model — model đổi mà fixture không đổi theo thì test này fail.
final class PreviewModeTests: XCTestCase {
    private func decode<T: Decodable>(_ type: T.Type, _ path: String, method: String = "GET") throws -> T {
        let data = try XCTUnwrap(PreviewMode.fixture(path: path, method: method), "thiếu fixture cho \(method) \(path)")
        return try JSONDecoder().decode(T.self, from: data)
    }

    func testFixturesDecodeIntoModels() throws {
        XCTAssertFalse(try decode(TranslateHistoryResponse.self, "/api/translate-history?limit=20&offset=0").history.isEmpty)
        XCTAssertFalse(try decode(JournalResponse.self, "/api/journal").entries.isEmpty)
        XCTAssertFalse(try decode(PracticeSessionsResponse.self, "/api/practice/sessions").sessions.isEmpty)
        XCTAssertNotNil(try decode(ProfileResponse.self, "/api/profile").profile)
        XCTAssertGreaterThan(try decode(StreakResponse.self, "/api/stats/streak").streak, 0)
        XCTAssertNotNil(try decode(TranslateResponse.self, "/api/translate", method: "POST").translated)
    }

    func testFixtureDatesAreParseable() throws {
        let history = try decode(TranslateHistoryResponse.self, "/api/translate-history?limit=20&offset=0").history
        for entry in history { XCTAssertNotNil(APIDate.parse(entry.savedAt), entry.savedAt) }
    }

    func testPracticeReplyIsPlainText() throws {
        let data = try XCTUnwrap(PreviewMode.fixture(path: "/api/practice", method: "POST"))
        XCTAssertFalse(String(decoding: data, as: UTF8.self).isEmpty)
    }

    func testUnknownPathHasNoFixture() {
        XCTAssertNil(PreviewMode.fixture(path: "/api/khong-ton-tai", method: "GET"))
    }

    func testInitialTabFromArguments() {
        XCTAssertEqual(PreviewMode.initialTab(from: ["app", "-WordlyUIPreview", "journal"]), "journal")
        XCTAssertNil(PreviewMode.initialTab(from: ["app"]))
        XCTAssertTrue(PreviewMode.isEnabled(in: ["app", "-WordlyUIPreview", "translate"]))
        XCTAssertFalse(PreviewMode.isEnabled(in: ["app"]))
    }
}
