import Foundation

/// Trình tự một lượt quiz (logic thuần, test được) — giống web: chọn đáp án thì
/// khoá câu đó, bấm "Tiếp" mới sang câu sau; câu cuối thì báo nộp bài.
/// Server KHÔNG gửi đáp án đúng trước khi nộp, nên chấm điểm luôn ở server.
struct QuizSession {
    /// Kết quả chấm ngay 1 câu (POST /api/quiz/check) — ôn và biết đúng/sai
    /// từng từ ngay, không phải đợi làm hết cả bài (quyết định 10/10/2026).
    struct CheckedResult: Equatable {
        let correct: Bool
        let correctAnswer: String?
    }

    let questions: [QuizQuestion]
    private(set) var index = 0
    private(set) var picked: String?
    private(set) var answers: [String: QuizSubmitRequest.Answer] = [:]
    private(set) var isFinished: Bool
    private var checkedResults: [String: CheckedResult] = [:]
    /// Câu chấm-ngay lỗi mạng — thôi hiện vòng xoay, vẫn nộp cả bài được.
    private var failedChecks: Set<String> = []

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

    func checkedResult(for questionId: String) -> CheckedResult? { checkedResults[questionId] }

    mutating func recordCheck(questionId: String, correct: Bool, correctAnswer: String?) {
        checkedResults[questionId] = CheckedResult(correct: correct, correctAnswer: correctAnswer)
    }

    mutating func recordCheckFailed(questionId: String) {
        failedChecks.insert(questionId)
    }

    /// Đã chọn, đang chờ server chấm câu hiện tại.
    var isChecking: Bool {
        guard picked != nil, let q = current else { return false }
        return checkedResults[q.id] == nil && !failedChecks.contains(q.id)
    }

    /// Trả lời đúng thì tự sang câu (bớt một chạm); sai thì dừng cho xem đáp án.
    var shouldAutoAdvance: Bool {
        guard picked != nil, let q = current else { return false }
        return checkedResults[q.id]?.correct == true
    }

    /// "Ôn lại các từ sai": lượt mới chỉ gồm câu chưa đúng, đáp án xáo lại.
    static func retryingWrong(_ questions: [QuizQuestion], result: QuizResult) -> QuizSession {
        let wrong = questions
            .filter { result.details[$0.id]?.correct != true }
            .map { QuizQuestion(id: $0.id, wordId: $0.wordId, prompt: $0.prompt, options: $0.options.shuffled(), level: $0.level) }
        return QuizSession(questions: wrong)
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

    func submitRequest(mode: String, durationMs: Int?) -> QuizSubmitRequest {
        QuizSubmitRequest(answers: answers, mode: mode, durationMs: durationMs)
    }
}

/// Câu chữ của quiz (logic thuần).
enum QuizCopy {
    /// Server 409: chưa đủ từ ("Lưu thêm X từ…") — hiện nguyên văn + nút sang Dịch.
    static func isNotEnoughWords(_ error: Error) -> Bool {
        guard case APIError.serverError(let raw) = error else { return false }
        return raw.hasPrefix("HTTP 409")
    }

    static func errorMessage(_ error: Error) -> String {
        if isNotEnoughWords(error) {
            return (error as? APIError)?.serverMessage ?? "Chưa đủ từ vựng để tạo quiz. Hãy lưu thêm từ khi dịch."
        }
        return "Có lỗi xảy ra, vui lòng thử lại."
    }
}
