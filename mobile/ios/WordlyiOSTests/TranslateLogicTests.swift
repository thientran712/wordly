import XCTest
@testable import Wordly

// Logic thuần của màn Dịch — giống web (components/home/InlineTranslate.js,
// lib/ai/dictionary-client.js).
final class TranslateLogicTests: XCTestCase {
    func testSingleWordDetection() {
        XCTAssertTrue(TranslateLogic.isSingleWord("resilient"))
        XCTAssertTrue(TranslateLogic.isSingleWord("  well-known "))
        XCTAssertTrue(TranslateLogic.isSingleWord("don't"))
        XCTAssertFalse(TranslateLogic.isSingleWord("two words"))
        XCTAssertFalse(TranslateLogic.isSingleWord("cà phê"))
        XCTAssertFalse(TranslateLogic.isSingleWord(""))
    }

    // " Run " và "run" phải là cùng một khoá — mỗi lần miss cache là một lượt AI trả phí
    func testWordKeyNormalization() {
        XCTAssertEqual(TranslateLogic.wordKey(" Run "), "run")
        XCTAssertEqual(TranslateLogic.wordKey("RESILIENT"), "resilient")
    }

    func testSuggestionsPutExactWordFirstAndCapAtEight() {
        let s = TranslateLogic.orderSuggestions(typed: "Resi", fetched: ["resilient", "resin", "resist", "a", "b", "c", "d", "e", "f"])
        XCTAssertEqual(s.first, "resi")
        XCTAssertEqual(s.count, 8)
        XCTAssertEqual(TranslateLogic.orderSuggestions(typed: "resin", fetched: ["resin", "rest"]), ["resin", "rest"])
    }

    // Web tự ghi lịch sử sau 10s; mỗi (chiều dịch, câu) chỉ ghi một lần
    func testAutoLogDedupesPerDirectionAndText() {
        var tracker = AutoLogTracker()
        XCTAssertTrue(tracker.shouldLog(direction: "EN→VI", text: "hello"))
        XCTAssertFalse(tracker.shouldLog(direction: "EN→VI", text: " hello "))
        XCTAssertTrue(tracker.shouldLog(direction: "VI→EN", text: "hello"))
        XCTAssertFalse(tracker.shouldLog(direction: "EN→VI", text: "   "))
    }

    func testAutoLogCanRetryAfterFailure() {
        var tracker = AutoLogTracker()
        XCTAssertTrue(tracker.shouldLog(direction: "EN→VI", text: "hello"))
        tracker.forget(direction: "EN→VI", text: "hello")
        XCTAssertTrue(tracker.shouldLog(direction: "EN→VI", text: "hello"))
    }

    // Ảnh gửi lên /api/translate/image dạng data URL — khớp route web
    // (image-validation.js: `^data:([^;]+);base64,(.*)$`).
    func testImageDataURLFormat() {
        let url = TranslateLogic.imageDataURL(jpegData: Data([0xFF, 0xD8]))
        XCTAssertTrue(url.hasPrefix("data:image/jpeg;base64,"))
        XCTAssertEqual(url, "data:image/jpeg;base64,/9g=")
    }

    func testTranslateImageResponseDecodes() throws {
        let json = #"{"source_text":"Hello","translated_text":"Xin chào"}"#
        let r = try JSONDecoder().decode(TranslateImageResponse.self, from: Data(json.utf8))
        XCTAssertEqual(r.sourceText, "Hello")
        XCTAssertEqual(r.translatedText, "Xin chào")
    }

    func testHistoryEntryDecodesSavedFlag() throws {
        let json = #"{"id":"1","source_text":"a","translated_text":"b","direction":"EN→VI","saved_at":"2026-10-06T08:00:00Z","is_saved":true}"#
        let e = try JSONDecoder().decode(TranslateHistoryEntry.self, from: Data(json.utf8))
        XCTAssertEqual(e.isSaved, true)
    }

    /// Lỗi dịch ảnh: hiện câu của server (422 không có chữ / không dịch được), lỗi khác mới là mất mạng.
    func testImageErrorMessage() {
        let noText = APIError.from(status: 422, body: Data(#"{"error":"Không tìm thấy chữ trong ảnh"}"#.utf8))
        XCTAssertEqual(TranslateLogic.imageErrorMessage(noText), "Không tìm thấy chữ trong ảnh")
        let bad = APIError.from(status: 502, body: Data(#"{"error":"AI lỗi: x"}"#.utf8))
        XCTAssertEqual(TranslateLogic.imageErrorMessage(bad), "Không đọc được ảnh, thử lại nhé")
        XCTAssertEqual(TranslateLogic.imageErrorMessage(URLError(.notConnectedToInternet)), "Mất kết nối — thử lại nhé")
    }
}
