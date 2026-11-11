import Foundation

/// Danh mục lọc — khớp web: lib/learning/exam-goals.js, lib/ai/topic-classifier.js.
enum VocabCatalog {
    struct Option: Identifiable, Hashable {
        let key: String
        let label: String
        let icon: String
        var id: String { key }

        func label(count: Int?) -> String {
            count.map { "\(icon) \(label) (\($0))" } ?? "\(icon) \(label)"
        }
    }

    static let exams: [Option] = [
        .init(key: "general", label: "Giao tiếp cơ bản", icon: "🗨️"),
        .init(key: "toeic", label: "TOEIC", icon: "💼"),
        .init(key: "ielts", label: "IELTS", icon: "🎓"),
        .init(key: "toefl", label: "TOEFL", icon: "📘"),
    ]

    static let topics: [Option] = [
        .init(key: "business", label: "Business & Strategy", icon: "💼"),
        .init(key: "technology", label: "Technology & AI", icon: "💻"),
        .init(key: "law_finance", label: "Law & Finance", icon: "⚖️"),
        .init(key: "health", label: "Health & Medicine", icon: "🏥"),
        .init(key: "science", label: "Science & Nature", icon: "🔬"),
        .init(key: "travel", label: "Travel & Places", icon: "✈️"),
        .init(key: "food", label: "Food & Cooking", icon: "🍳"),
        .init(key: "emotions", label: "Emotions & Feelings", icon: "❤️"),
        .init(key: "psychology", label: "Psychology & Behavior", icon: "🧠"),
        .init(key: "communication", label: "Communication", icon: "🗣️"),
        .init(key: "academic", label: "Academic & Education", icon: "🎓"),
        .init(key: "daily", label: "Daily Life", icon: "☀️"),
    ]

    static let levels = ["A1", "A2", "B1", "B2", "C1", "C2"]

    static let levelLabels: [String: String] = [
        "A1": "A1 — Mới bắt đầu", "A2": "A2 — Sơ cấp",
        "B1": "B1 — Trung cấp", "B2": "B2 — Trung cấp cao",
        "C1": "C1 — Nâng cao", "C2": "C2 — Thành thạo",
    ]

    /// Một dòng tóm tắt bộ lọc đang chọn trên danh sách (N1)
    static func filterSummary(exam: String?, topic: String?, level: String?) -> String {
        let parts = [exams.first { $0.key == exam }?.label,
                     topics.first { $0.key == topic }?.label,
                     level].compactMap { $0 }
        return parts.isEmpty ? "Tất cả từ" : parts.joined(separator: " · ")
    }

    static func activeFilterCount(exam: String?, topic: String?, level: String?) -> Int {
        [exam, topic, level].compactMap { $0 }.count
    }
}

/// Ghép các trang kết quả (web: 40 từ/trang). Hết khi đủ `total` hoặc trang rỗng.
struct WordPager<Item> {
    private(set) var items: [Item] = []
    private(set) var hasMore = false
    private(set) var total: Int?

    var nextOffset: Int { items.count }

    mutating func reset(with page: [Item], total: Int?) {
        items = page
        self.total = total
        hasMore = !page.isEmpty && (total.map { page.count < $0 } ?? true)
    }

    mutating func append(_ page: [Item]) {
        items += page
        hasMore = !page.isEmpty && (total.map { items.count < $0 } ?? true)
    }
}

/// Từ trong kho chung (review UI 11/11, N2/N3). Kho chỉ có định nghĩa Anh; nghĩa
/// Việt lấy từ /api/dictionary (từ kho tra miễn phí) hoặc bảng nghĩa Việt của widget.
enum BankWordLogic {
    /// Nghĩa Việt là dòng chính, định nghĩa Anh dòng phụ; chưa có nghĩa Việt → chỉ tiếng Anh.
    static func meanings(vi: String?, en: String?) -> (main: String, secondary: String?) {
        let v = (vi ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let e = (en ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { return (e, nil) }
        return (v, e.isEmpty ? nil : e)
    }

    /// Nghĩa lưu kèm từ — phải là tiếng Việt (quiz/widget của từ đã lưu dùng nghĩa Việt).
    static func meaningToSave(vi: String?) -> String? {
        let v = (vi ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return v.isEmpty ? nil : v
    }

    /// Nghĩa Việt đã có sẵn trong bảng của widget (không tốn lượt gọi).
    static func cachedVi(_ word: String) -> String? {
        AppGroupStorage.shared.meaningsVi[WidgetPhonetic.key(word)]
    }
}
