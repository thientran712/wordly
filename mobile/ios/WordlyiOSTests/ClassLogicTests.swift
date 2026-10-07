import XCTest
@testable import Wordly

// Lớp của tôi — giống web (api/join, components/org/HomeworkPanel.js).
final class ClassLogicTests: XCTestCase {
    func testJoinCodeNormalizationMatchesServer() {
        XCTAssertEqual(ClassLogic.normalizeJoinCode(" wrd-7k2m "), "WRD7K2M")
        XCTAssertEqual(ClassLogic.normalizeJoinCode("pm9 mdq"), "PM9MDQ")
        XCTAssertNil(ClassLogic.normalizeJoinCode("ab"))            // quá ngắn
        XCTAssertNil(ClassLogic.normalizeJoinCode("ABCDEFGHIJKLM"))  // quá dài
        XCTAssertNil(ClassLogic.normalizeJoinCode("AB!CD"))
    }

    private func hw(due: String?, sub: HomeworkSubmission?) -> Homework {
        Homework(id: "h", title: "t", instructions: nil, questions: [], totalPoints: 10, dueAt: due,
                 allowLate: true, status: "published", mySubmission: sub)
    }
    private let now = ISO8601DateFormatter().date(from: "2026-10-06T00:00:00Z")!

    func testHomeworkStatus() {
        XCTAssertEqual(ClassLogic.status(of: hw(due: "2026-10-10T00:00:00Z", sub: nil), now: now), .todo)
        XCTAssertEqual(ClassLogic.status(of: hw(due: "2026-10-01T00:00:00Z", sub: nil), now: now), .overdue)
        XCTAssertEqual(ClassLogic.status(of: hw(due: nil, sub: .init(status: "draft", totalScore: nil, submittedAt: nil, isLate: nil)), now: now), .draft)
        XCTAssertEqual(ClassLogic.status(of: hw(due: nil, sub: .init(status: "submitted", totalScore: nil, submittedAt: nil, isLate: false)), now: now), .submitted)
        XCTAssertEqual(ClassLogic.status(of: hw(due: nil, sub: .init(status: "graded", totalScore: 8, submittedAt: nil, isLate: false)), now: now), .graded(8))
    }

    private let questions = [
        HomeworkQuestion(id: "q1", type: "mcq", points: 1, prompt: "p", options: ["a", "b"], pairs: nil),
        HomeworkQuestion(id: "q2", type: "fill", points: 1, prompt: "p", options: nil, pairs: nil),
        HomeworkQuestion(id: "q3", type: "essay", points: 3, prompt: "p", options: nil, pairs: nil),
        HomeworkQuestion(id: "q4", type: "match", points: 2, prompt: "p", options: nil,
                         pairs: .init(lefts: ["x", "y"], rights: ["1", "2"])),
    ]

    func testDraftBuildsAnswersInWebFormat() {
        var d = HomeworkDraft(questions: questions)
        d.choose("q1", index: 1)
        d.setText("q2", "  seen ")
        d.setText("q3", "My essay")
        d.match("q4", left: "x", right: "2")
        d.match("q4", left: "y", right: "1")
        XCTAssertEqual(d.answers["q1"], .choice(1))
        XCTAssertEqual(d.answers["q2"], .text("seen"))
        XCTAssertEqual(d.answers["q4"], .pairs(["x": "2", "y": "1"]))
        XCTAssertTrue(d.isComplete)
        XCTAssertEqual(d.answeredCount, 4)
    }

    func testDraftCompletenessRequiresAllPairsAndText() {
        var d = HomeworkDraft(questions: questions)
        d.choose("q1", index: 0)
        d.setText("q2", "   ")
        d.match("q4", left: "x", right: "1")
        XCTAssertFalse(d.isComplete)
        XCTAssertEqual(d.answeredCount, 1)
        XCTAssertNil(d.answers["q2"])
    }

    // Server từ chối bài nói dài hơn max_seconds + 5s, và file > 15MB
    func testSpeakingSubmitLimits() {
        XCTAssertTrue(ClassLogic.canSubmitSpeaking(durationMs: 60_000, maxSeconds: 60, bytes: 1_000))
        XCTAssertTrue(ClassLogic.canSubmitSpeaking(durationMs: 64_999, maxSeconds: 60, bytes: 1_000))
        XCTAssertFalse(ClassLogic.canSubmitSpeaking(durationMs: 65_001, maxSeconds: 60, bytes: 1_000))
        XCTAssertFalse(ClassLogic.canSubmitSpeaking(durationMs: 0, maxSeconds: 60, bytes: 1_000))
        XCTAssertFalse(ClassLogic.canSubmitSpeaking(durationMs: 10_000, maxSeconds: 60, bytes: 16 * 1024 * 1024))
    }
}
