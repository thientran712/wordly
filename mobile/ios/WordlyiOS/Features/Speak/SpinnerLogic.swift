import Foundation

/// Ba chế độ vòng quay — khớp web app/(learner)/speak/page.js + components/spinner/FilterBar.js.
enum SpinnerMode: String, CaseIterable, Identifiable {
    case ielts, interview, deepTalk
    var id: String { rawValue }

    struct Category: Hashable { let code: String; let label: String }

    var title: String {
        switch self {
        case .ielts: return "IELTS Speaking"
        case .interview: return "Phỏng vấn"
        case .deepTalk: return "Deep Talk"
        }
    }
    var subtitle: String {
        switch self {
        case .ielts: return "Quay để nhận một câu hỏi IELTS Speaking (Part 1–3), rồi luyện nói trong thời gian giới hạn."
        case .interview: return "Câu hỏi phỏng vấn kinh điển — trả lời theo khung STAR, PREP…"
        case .deepTalk: return "Câu hỏi sâu về bản thân và cuộc sống — luyện diễn đạt suy nghĩ."
        }
    }
    /// item_type của /api/spinner/history
    var itemType: String {
        switch self {
        case .ielts: return "topic"
        case .interview: return "interview"
        case .deepTalk: return "deep_talk"
        }
    }
    /// kind của /api/spinner/vocab-suggest
    var vocabKind: String {
        switch self {
        case .ielts: return "ielts"
        case .interview: return "interview"
        case .deepTalk: return "deep_talk"
        }
    }
    var allLabel: String? {
        switch self {
        case .ielts: return "🎲 Ngẫu nhiên (Part 1–3)"
        case .interview: return nil   // web luôn chọn một nhóm
        case .deepTalk: return "🎲 Mọi chủ đề"
        }
    }
    var categories: [Category] {
        switch self {
        case .ielts: return [
            .init(code: "part1", label: "① Part 1 — Câu hỏi ngắn"),
            .init(code: "part2", label: "② Part 2 — Cue card"),
            .init(code: "part3", label: "③ Part 3 — Thảo luận"),
        ]
        case .interview: return [
            .init(code: "behavioral", label: "💬 Top 50 Behavioral"),
            .init(code: "consulting", label: "💼 Top 50 Consulting"),
        ]
        case .deepTalk: return [
            .init(code: "self", label: "🪞 Bản thân"),
            .init(code: "relationships", label: "🤝 Mối quan hệ"),
            .init(code: "purpose", label: "🎯 Mục tiêu sống"),
            .init(code: "fears", label: "🌑 Nỗi sợ"),
            .init(code: "philosophy", label: "💭 Triết lý sống"),
        ]
        }
    }
    var frameworks: [AnswerFramework] {
        switch self {
        case .ielts: return AnswerFramework.ielts
        case .interview: return AnswerFramework.interview
        case .deepTalk: return []
        }
    }
}

struct AnswerFramework: Identifiable, Equatable {
    let id: String
    let label: String
    let steps: [String]
    var category: String? = nil

    static let ielts: [AnswerFramework] = [
        .init(id: "pee", label: "PEE", steps: ["Point — Trả lời thẳng câu hỏi", "Extend — Thêm 1 câu lý do/giải thích", "Example — Ví dụ cá nhân cụ thể"], category: "part1"),
        .init(id: "area", label: "AREA", steps: ["Answer — Trả lời thẳng ý chính (ai/gì/khi nào/ở đâu)", "Reason — Vì sao/bối cảnh xảy ra", "Example — Chi tiết hoặc kỷ niệm cụ thể", "Add-on — Cảm nghĩ/ảnh hưởng của nó với bạn"], category: "part2"),
        .init(id: "oreo", label: "OREO", steps: ["Opinion — Nêu quan điểm rõ ràng", "Reason — Lý do cho quan điểm đó", "Example — Ví dụ minh hoạ (nên mang tính xã hội)", "Opinion — Chốt lại quan điểm"], category: "part3"),
    ]
    static let interview: [AnswerFramework] = [
        .init(id: "star", label: "STAR", steps: ["Situation — Bối cảnh sự việc", "Task — Vai trò của bạn là gì?", "Action — Bạn đã làm gì?", "Result — Kết quả ra sao?"]),
        .init(id: "prep", label: "PREP", steps: ["Point — Nêu luận điểm chính", "Reason — Vì sao điều đó đúng?", "Example — Đưa ví dụ cụ thể", "Point — Nhắc lại luận điểm"]),
        .init(id: "ppf", label: "PPF", steps: ["Past — Trước đây bạn ở đâu?", "Present — Hiện tại bạn đang ở đâu?", "Future — Bạn sẽ đi đến đâu?"]),
        .init(id: "mece", label: "MECE", steps: ["Mutually Exclusive — Không chồng chéo", "Collectively Exhaustive — Không bỏ sót", "Chia câu trả lời thành các nhóm rõ ràng", "Ưu tiên và tóm tắt lại"]),
    ]
}

enum SpinnerLogic {
    /// Đã quay thì bỏ khỏi vòng tới khi xoá khỏi lịch sử; quay hết thì dùng lại cả pool.
    static func excludeSpun(_ pool: [SpinnerItem], excluded: Set<Int>) -> [SpinnerItem] {
        guard !excluded.isEmpty else { return pool }
        let remaining = pool.filter { !excluded.contains($0.id) }
        return remaining.isEmpty ? pool : remaining
    }

    /// Lọc theo nhóm; nhóm không có câu nào thì dùng cả pool (giống web).
    static func filter(_ pool: [SpinnerItem], category: String?) -> [SpinnerItem] {
        guard let category else { return pool }
        let filtered = pool.filter { $0.category == category }
        return filtered.isEmpty ? pool : filtered
    }

    /// Part 2 (cue card) 2 phút, còn lại 1 phút — giống web.
    static func defaultSeconds(mode: SpinnerMode, item: SpinnerItem?) -> Int {
        mode == .ielts && item?.category == "part2" ? 120 : 60
    }

    static func recommendedFramework(mode: SpinnerMode, item: SpinnerItem?) -> AnswerFramework? {
        switch mode {
        case .ielts: return AnswerFramework.ielts.first { $0.category == item?.category }
        case .interview: return AnswerFramework.interview.first { $0.id == item?.framework }
        case .deepTalk: return nil
        }
    }
}

/// Đồng hồ đếm ngược của màn luyện (web: TimerModal). Logic thuần, view gọi tick() mỗi giây.
struct CountdownTimer {
    private(set) var total: Int
    private(set) var remaining: Int
    private(set) var running = false
    private(set) var finished = false

    static let minSeconds = 15
    static let maxSeconds = 600

    init(total: Int) {
        self.total = total
        self.remaining = total
    }

    var progress: Double { total == 0 ? 0 : Double(remaining) / Double(total) }

    mutating func start() {
        if finished || remaining == 0 { remaining = total; finished = false }
        running = true
    }
    mutating func pause() { running = false }
    mutating func reset() {
        running = false
        finished = false
        remaining = total
    }

    mutating func tick() {
        guard running, remaining > 0 else { return }
        remaining -= 1
        if remaining == 0 {
            running = false
            finished = true
        }
    }

    /// ±15s khi chưa chạy (web cho chỉnh thời lượng trước khi bắt đầu).
    mutating func adjust(by delta: Int) {
        total = min(Self.maxSeconds, max(Self.minSeconds, total + delta))
        if !running { remaining = total; finished = false }
    }
}
