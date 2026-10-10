import XCTest
@testable import Wordly

// Model cho các tính năng mang từ web sang (từ điển AI, quiz, vòng quay
// luyện nói, từ vựng theo chủ đề, email). Fixture sinh từ phản hồi THẬT
// của production — test này bảo đảm model decode được đúng dữ liệu server trả.
final class FeatureModelsTests: XCTestCase {
    private func fixture(_ path: String, _ method: String = "GET") throws -> Data {
        try XCTUnwrap(PreviewMode.fixture(path: path, method: method), "thiếu fixture \(method) \(path)")
    }
    private func decode<T: Decodable>(_ type: T.Type, _ path: String, _ method: String = "GET") throws -> T {
        try JSONDecoder().decode(T.self, from: fixture(path, method))
    }

    func testDictionary() throws {
        let r = try decode(DictionaryResponse.self, "/api/dictionary", "POST")
        let d = try XCTUnwrap(r.detail)
        XCTAssertFalse(d.phoneticUs.isEmpty)
        XCTAssertFalse(d.meanings.isEmpty)
        XCTAssertFalse(d.meanings[0].defs[0].defVi.isEmpty)
    }

    func testQuizQuestionsAndResult() throws {
        let q = try decode(QuizResponse.self, "/api/quiz?mode=en_to_vi&count=10&source=saved")
        XCTAssertEqual(q.questions.first?.options.count, 4)
        let r = try decode(QuizSubmitResponse.self, "/api/quiz", "POST")
        XCTAssertEqual(r.result.total, r.result.details.count)
    }

    func testSpinner() throws {
        XCTAssertFalse(try decode(SpinnerTopicsResponse.self, "/api/spinner/topics?language=en").topics.isEmpty)
        XCTAssertFalse(try decode(SpinnerQuestionsResponse.self, "/api/spinner/interview?category=behavioral").questions.isEmpty)
        XCTAssertFalse(try decode(SpinnerQuestionsResponse.self, "/api/spinner/deep-talk").questions.isEmpty)
        XCTAssertEqual(try decode(SpinHistoryResponse.self, "/api/spinner/history?item_type=topic").items.count, 1)
        XCTAssertEqual(try decode(VocabSuggestResponse.self, "/api/spinner/vocab-suggest", "POST").words.count, 2)
    }

    func testWordsByTopic() throws {
        let r = try decode(WordsByTopicResponse.self, "/api/words/by-topic?offset=0&counts=1")
        XCTAssertFalse(r.words.isEmpty)
        XCTAssertEqual(r.examCounts?["ielts"], 950)
    }

    func testEmailSettings() throws {
        let p = try decode(EmailPreferencesResponse.self, "/api/email-preferences")
        XCTAssertEqual(p.preferences?.frequency, "weekdays")
        let s = try decode(EmailSlotsResponse.self, "/api/email-slots")
        XCTAssertEqual(s.slots.map(\.displayTime), ["08:00", "20:30"])
    }

    // ── Encode: body gửi lên server phải đúng định dạng web đang dùng ──
    func testQuizSubmitBodyEncoding() throws {
        let body = QuizSubmitRequest(answers: ["qa": .init(wordId: "w1", given: "hello")], mode: "en_to_vi", durationMs: 1200)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        let qa = (json?["answers"] as? [String: Any])?["qa"] as? [String: Any]
        XCTAssertEqual(qa?["word_id"] as? String, "w1")
        XCTAssertEqual(json?["duration_ms"] as? Int, 1200)
    }
}
