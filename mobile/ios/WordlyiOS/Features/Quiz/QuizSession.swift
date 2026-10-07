import Foundation

/// Trình tự một lượt quiz (logic thuần, test được) — giống web: chọn đáp án thì
/// khoá câu đó, bấm "Tiếp" mới sang câu sau; câu cuối thì báo nộp bài.
/// Server KHÔNG gửi đáp án đúng trước khi nộp, nên chấm điểm luôn ở server.
struct QuizSession {
    let questions: [QuizQuestion]
    private(set) var index = 0
    private(set) var picked: String?
    private(set) var answers: [String: QuizSubmitRequest.Answer] = [:]
    private(set) var isFinished: Bool

    init(questions: [QuizQuestion]) {
        self.questions = questions
        self.isFinished = questions.isEmpty
    }

    var current: QuizQuestion? { questions.indices.contains(index) && !isFinished ? questions[index] : nil }
    var canAdvance: Bool { picked != nil }
    var progress: Double { questions.isEmpty ? 0 : Double(index) / Double(questions.count) }
    var isLastQuestion: Bool { index == questions.count - 1 }

    mutating func pick(_ option: String) {
        guard picked == nil, let q = current else { return }
        picked = option
        answers[q.id] = .init(wordId: q.wordId, given: option)
    }

    /// Sang câu tiếp. Trả `true` khi vừa xong câu cuối (cần nộp bài).
    mutating func advance() -> Bool {
        guard canAdvance, !isFinished else { return false }
        if isLastQuestion {
            isFinished = true
            return true
        }
        index += 1
        picked = nil
        return false
    }

    func submitRequest(mode: String, classId: String?, durationMs: Int?) -> QuizSubmitRequest {
        QuizSubmitRequest(answers: answers, mode: mode, classId: classId, durationMs: durationMs)
    }
}
