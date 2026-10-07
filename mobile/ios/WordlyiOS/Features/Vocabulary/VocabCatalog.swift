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
}

/// Ghép các trang kết quả (web: 40 từ/trang). Hết khi đủ `total` hoặc trang rỗng.
struct WordPager<Item> {
    private(set) var items: [Item] = []
    private(set) var hasMore = false
    private var total: Int?

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
