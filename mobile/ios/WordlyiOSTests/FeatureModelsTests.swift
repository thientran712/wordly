import XCTest
@testable import Wordly

// Model cho các tính năng mang từ web sang (từ điển AI, quiz, lớp học, vòng
// quay luyện nói, từ vựng theo chủ đề, email). Fixture sinh từ phản hồi THẬT
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

    func testClassesAndJoin() throws {
        XCTAssertFalse(try decode(OrgsResponse.self, "/api/orgs").orgs.isEmpty)
        XCTAssertEqual(try decode(ClassesResponse.self, "/api/classes?org_id=x").classes.first?.name, "IELTS FOUNDATION 3")
        XCTAssertTrue(try decode(JoinClassResponse.self, "/api/join", "POST").ok)
    }

    func testHomeworkAllQuestionTypes() throws {
        let r = try decode(HomeworkListResponse.self, "/api/homework?class_id=x")
        let types = Set(r.homework.flatMap { $0.questions.map(\.type) })
        XCTAssertEqual(types, ["mcq", "fill", "essay", "match"])
        let match = try XCTUnwrap(r.homework[0].questions.first { $0.type == "match" })
        XCTAssertEqual(match.pairs?.lefts.count, 2)
        XCTAssertEqual(r.homework[1].mySubmission?.status, "graded")
        let s = try decode(HomeworkSubmitResponse.self, "/api/homework/x/submit", "POST")
        XCTAssertEqual(s.result?.needsManual, true)
    }

    func testSessionsMaterialsSpeakingProgress() throws {
        let s = try decode(ClassSessionsResponse.self, "/api/classes/x/sessions")
        XCTAssertFalse(s.sessions[0].lessonMaterials.isEmpty)
        XCTAssertFalse(try decode(MaterialURLResponse.self, "/api/materials/x/url").url.isEmpty)
        let sp = try decode(SpeakingListResponse.self, "/api/speaking?class_id=x")
        XCTAssertEqual(sp.prompts[1].mySubmission?.scoreOverall, 7.5)
        XCTAssertEqual(try decode(ClassProgressResponse.self, "/api/classes/x/progress").className, "IELTS FOUNDATION 3")
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
    func testHomeworkAnswerEncoding() throws {
        let answers: [String: HomeworkAnswer] = [
            "q1": .choice(2),
            "q2": .text("seen"),
            "q4": .pairs(["resilient": "kiên cường"]),
        ]
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(answers)) as? [String: Any]
        XCTAssertEqual(json?["q1"] as? Int, 2)
        XCTAssertEqual(json?["q2"] as? String, "seen")
        XCTAssertEqual((json?["q4"] as? [String: String])?["resilient"], "kiên cường")
    }

    func testQuizSubmitBodyEncoding() throws {
        let body = QuizSubmitRequest(answers: ["qa": .init(wordId: "w1", given: "hello")], mode: "en_to_vi", classId: nil, durationMs: 1200)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        let qa = (json?["answers"] as? [String: Any])?["qa"] as? [String: Any]
        XCTAssertEqual(qa?["word_id"] as? String, "w1")
        XCTAssertEqual(json?["duration_ms"] as? Int, 1200)
    }
}
