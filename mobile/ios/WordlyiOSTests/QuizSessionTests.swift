import XCTest
@testable import Wordly

// Trình tự một lượt quiz — giống web (web/src/app/(learner)/quiz/page.js):
// chọn một đáp án thì khoá câu đó, bấm tiếp mới sang câu sau; câu cuối thì nộp.
final class QuizSessionTests: XCTestCase {
    private let questions = [
        QuizQuestion(id: "a", wordId: "w1", prompt: "resilient", options: ["kiên cường", "mệt", "nhanh", "đỏ"], level: nil),
        QuizQuestion(id: "b", wordId: "w2", prompt: "diligent", options: ["lười", "chăm chỉ", "to", "nhỏ"], level: "B1"),
    ]

    func testStartsAtFirstQuestionUnanswered() {
        let s = QuizSession(questions: questions)
        XCTAssertEqual(s.current?.id, "a")
        XCTAssertNil(s.picked)
        XCTAssertFalse(s.canAdvance)
        XCTAssertEqual(s.progress, 0)
    }

    func testPickLocksAnswerUntilAdvance() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường")
        s.pick("mệt") // đã chọn rồi → bỏ qua
        XCTAssertEqual(s.picked, "kiên cường")
        XCTAssertTrue(s.canAdvance)
    }

    func testAdvanceMovesToNextAndClearsPick() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường")
        XCTAssertFalse(s.advance()) // chưa phải câu cuối
        XCTAssertEqual(s.current?.id, "b")
        XCTAssertNil(s.picked)
        XCTAssertEqual(s.progress, 0.5, accuracy: 0.001)
    }

    func testAdvanceOnLastQuestionSignalsSubmit() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường"); _ = s.advance()
        s.pick("chăm chỉ")
        XCTAssertTrue(s.advance())
        XCTAssertTrue(s.isFinished)
    }

    func testCannotAdvanceWithoutPick() {
        var s = QuizSession(questions: questions)
        XCTAssertFalse(s.advance())
        XCTAssertEqual(s.current?.id, "a")
    }

    func testSubmitRequestCarriesWordIdsAndAnswers() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường"); _ = s.advance()
        s.pick("lười"); _ = s.advance()
        let body = s.submitRequest(mode: "en_to_vi", durationMs: 9000)
        XCTAssertEqual(body.answers["a"]?.wordId, "w1")
        XCTAssertEqual(body.answers["b"]?.given, "lười")
        XCTAssertEqual(body.durationMs, 9000)
    }

    func testEmptyQuizIsFinishedImmediately() {
        let s = QuizSession(questions: [])
        XCTAssertNil(s.current)
        XCTAssertTrue(s.isFinished)
    }

    // Ôn tập biết đúng/sai ngay từng câu — quyết định 10/10/2026.
    func testRecordCheckStoresResultForCurrentQuestion() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường")
        XCTAssertNil(s.checkedResult(for: "a"))
        s.recordCheck(questionId: "a", correct: true, correctAnswer: "kiên cường")
        let r = s.checkedResult(for: "a")
        XCTAssertEqual(r?.correct, true)
        XCTAssertEqual(r?.correctAnswer, "kiên cường")
    }

    func testCheckedResultClearedAfterAdvanceToNextQuestion() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường")
        s.recordCheck(questionId: "a", correct: true, correctAnswer: "kiên cường")
        _ = s.advance()
        // Câu "a" vẫn còn kết quả đã lưu (xem lại được) — chỉ câu hiện tại ("b") là chưa có.
        XCTAssertNotNil(s.checkedResult(for: "a"))
        XCTAssertNil(s.checkedResult(for: "b"))
    }

    // MARK: Review quiz 23/10/2026

    // Chấm-ngay lỗi mạng → không quay vòng mãi, vẫn đi tiếp được
    func testCheckFailureStopsSpinner() {
        var s = QuizSession(questions: questions)
        s.pick("kiên cường")
        XCTAssertTrue(s.isChecking)
        s.recordCheckFailed(questionId: "a")
        XCTAssertFalse(s.isChecking)
        XCTAssertTrue(s.canAdvance)
    }

    // Trả lời đúng → tự sang câu; sai → dừng cho xem đáp án; chưa chấm → chờ
    func testAutoAdvanceOnlyWhenCurrentAnswerIsCorrect() {
        var s = QuizSession(questions: questions)
        XCTAssertFalse(s.shouldAutoAdvance)
        s.pick("kiên cường")
        XCTAssertFalse(s.shouldAutoAdvance)
        s.recordCheck(questionId: "a", correct: true, correctAnswer: "kiên cường")
        XCTAssertTrue(s.shouldAutoAdvance)
        _ = s.advance()
        s.pick("lười")
        s.recordCheck(questionId: "b", correct: false, correctAnswer: "chăm chỉ")
        XCTAssertFalse(s.shouldAutoAdvance)
    }

    // "Ôn lại các từ sai" — lượt mới chỉ gồm câu sai, trả lời lại từ đầu
    func testRetryWrongBuildsSessionFromWrongQuestionsOnly() {
        let result = QuizResult(correct: 1, total: 2, percent: 50, details: [
            "a": .init(correct: true, given: "kiên cường", correctAnswer: "kiên cường"),
            "b": .init(correct: false, given: "lười", correctAnswer: "chăm chỉ"),
        ])
        let retry = QuizSession.retryingWrong(questions, result: result)
        XCTAssertEqual(retry.questions.map(\.id), ["b"])
        XCTAssertEqual(Set(retry.questions[0].options), Set(questions[1].options))
        XCTAssertNil(retry.picked)
        XCTAssertFalse(retry.isFinished)
        XCTAssertTrue(QuizSession.retryingWrong(questions, result: QuizResult(correct: 2, total: 2, percent: 100, details: [
            "a": .init(correct: true, given: nil, correctAnswer: nil),
            "b": .init(correct: true, given: nil, correctAnswer: nil),
        ])).questions.isEmpty)
    }

    // 409 "Lưu thêm X từ" từ server hiện nguyên văn; lỗi khác → câu chung
    func testQuizErrorMessageUsesServerText() {
        let e409 = APIError.serverError(#"HTTP 409: {"error":"Lưu thêm 2 từ nữa để mở quiz nhé.","needed":2}"#)
        XCTAssertEqual(QuizCopy.errorMessage(e409), "Lưu thêm 2 từ nữa để mở quiz nhé.")
        XCTAssertTrue(QuizCopy.isNotEnoughWords(e409))
        XCTAssertEqual(QuizCopy.errorMessage(APIError.noData), "Có lỗi xảy ra, vui lòng thử lại.")
        XCTAssertFalse(QuizCopy.isNotEnoughWords(APIError.noData))
    }
}
