import Foundation

/// Logic thuần của "Lớp của tôi" — giống web (api/join, components/org/HomeworkPanel.js).
enum ClassLogic {
    /// Chuẩn hoá mã lớp giống server: viết hoa, bỏ khoảng trắng + gạch nối
    /// (WRD-7K2M → WRD7K2M), 4–12 ký tự chữ/số. Sai định dạng → nil.
    static func normalizeJoinCode(_ raw: String) -> String? {
        let code = raw.uppercased().filter { !$0.isWhitespace && $0 != "-" }
        guard (4...12).contains(code.count), code.allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber) }) else { return nil }
        return code
    }

    enum HomeworkStatus: Equatable {
        case todo, overdue, draft, submitted, graded(Double?)

        var label: String {
            switch self {
            case .todo: return "Chưa làm"
            case .overdue: return "Quá hạn"
            case .draft: return "Đang làm dở"
            case .submitted: return "Đã nộp — chờ chấm"
            case .graded(let s): return s.map { "Đã chấm: \(ClassLogic.formatScore($0)) điểm" } ?? "Đã chấm"
            }
        }
    }

    static func status(of hw: Homework, now: Date = Date()) -> HomeworkStatus {
        switch hw.mySubmission?.status {
        case "graded": return .graded(hw.mySubmission?.totalScore)
        case "submitted": return .submitted
        case "draft": return .draft
        default:
            if let due = hw.dueAt.flatMap(APIDate.parse), due < now { return .overdue }
            return .todo
        }
    }

    /// Server (api/speaking/[id]/submit) từ chối bài dài hơn max_seconds + 5s và file > 15MB.
    static func canSubmitSpeaking(durationMs: Int, maxSeconds: Int, bytes: Int) -> Bool {
        durationMs > 0 && durationMs <= maxSeconds * 1000 + 5000 && bytes > 0 && bytes <= 15 * 1024 * 1024
    }

    static func formatScore(_ v: Double) -> String {
        v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v)
    }
}

/// Bản nháp câu trả lời bài tập — định dạng web: mcq = index, fill/essay = chữ,
/// match = { trái: phải } (phải ghép đủ mọi cặp mới tính là đã trả lời).
struct HomeworkDraft {
    let questions: [HomeworkQuestion]
    private var choices: [String: Int] = [:]
    private var texts: [String: String] = [:]
    private var pairs: [String: [String: String]] = [:]

    init(questions: [HomeworkQuestion]) { self.questions = questions }

    mutating func choose(_ qid: String, index: Int) { choices[qid] = index }
    mutating func setText(_ qid: String, _ text: String) { texts[qid] = text }
    mutating func match(_ qid: String, left: String, right: String) { pairs[qid, default: [:]][left] = right }

    func choice(_ qid: String) -> Int? { choices[qid] }
    func text(_ qid: String) -> String { texts[qid] ?? "" }
    func matched(_ qid: String, left: String) -> String? { pairs[qid]?[left] }

    var answers: [String: HomeworkAnswer] {
        var out: [String: HomeworkAnswer] = [:]
        for q in questions {
            switch q.type {
            case "mcq":
                if let i = choices[q.id] { out[q.id] = .choice(i) }
            case "fill", "essay":
                let t = (texts[q.id] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { out[q.id] = .text(t) }
            case "match":
                let lefts = q.pairs?.lefts ?? []
                if let m = pairs[q.id], !lefts.isEmpty, lefts.allSatisfy({ m[$0] != nil }) { out[q.id] = .pairs(m) }
            default: break
            }
        }
        return out
    }

    var answeredCount: Int { answers.count }
    var isComplete: Bool { answeredCount == questions.count }
}
