import Foundation

/// Một dòng /api/suggestion-log: app đã nhắc từ này qua push / widget / email (cũ).
struct RemindedItem: Decodable, Equatable {
    let id: String
    let source: String          // push | widget | email
    let entryType: String       // translate_history | bank | journal_entries
    let entryId: String?
    let bankWordId: String?
    let shownAt: String
    let word: String
    let meaning: String?

    enum CodingKeys: String, CodingKey {
        case id, source, word, meaning
        case entryType = "entry_type"
        case entryId = "entry_id"
        case bankWordId = "bank_word_id"
        case shownAt = "shown_at"
    }
}

struct RemindedPage: Decodable {
    let items: [RemindedItem]
    let hasMore: Bool
}

/// Logic thuần tab "Đã nhắc": 7 ngày gần nhất, gom theo ngày (giờ máy), mỗi từ
/// một dòng mỗi ngày kèm các kênh đã nhắc.
enum RemindedLogic {
    static let days = 7
    static let maxPages = 4
    private static let sourceOrder = ["push", "widget", "email"]

    struct Row: Identifiable, Equatable {
        let id: String
        let word: String
        let meaning: String
        let sources: [String]
        let timesShown: Int
        let latest: Date
        let entryId: String?
        let bankWordId: String?

        /// Mở bằng popup chi tiết từ đã lưu (từ đơn EN thì tra từ điển AI).
        var detailEntry: TranslateHistoryEntry {
            TranslateHistoryEntry(id: entryId ?? "bank-\(bankWordId ?? id)", sourceText: word, translatedText: meaning,
                                  direction: "EN→VI", savedAt: "", isSaved: entryId != nil)
        }
    }

    struct Section: Identifiable, Equatable {
        let day: Date
        let title: String
        let rows: [Row]
        var id: Date { day }
    }

    static func cutoff(now: Date, calendar: Calendar) -> Date {
        calendar.date(byAdding: .day, value: -(days - 1), to: calendar.startOfDay(for: now)) ?? now
    }

    static func group(_ items: [RemindedItem], now: Date, calendar: Calendar = .current) -> [Section] {
        let from = cutoff(now: now, calendar: calendar)
        var byDay: [Date: [(RemindedItem, Date)]] = [:]
        for item in items where item.entryType != "journal_entries" {
            guard let at = APIDate.parse(item.shownAt), at >= from else { continue }
            byDay[calendar.startOfDay(for: at), default: []].append((item, at))
        }
        return byDay.keys.sorted(by: >).map { day in
            var rows: [String: (first: RemindedItem, sources: Set<String>, count: Int, latest: Date)] = [:]
            for (item, at) in byDay[day]! {
                let key = WordMix.normalize(item.word)
                if var r = rows[key] {
                    r.sources.insert(item.source); r.count += 1
                    if at > r.latest { r.latest = at; r.first = item }
                    rows[key] = r
                } else {
                    rows[key] = (item, [item.source], 1, at)
                }
            }
            let built = rows.values.sorted { $0.latest > $1.latest }.map { r in
                Row(id: r.first.id, word: r.first.word, meaning: r.first.meaning ?? "",
                    sources: sourceOrder.filter(r.sources.contains) + r.sources.subtracting(sourceOrder).sorted(),
                    timesShown: r.count, latest: r.latest, entryId: r.first.entryId, bankWordId: r.first.bankWordId)
            }
            return Section(day: day, title: dayTitle(day, now: now, calendar: calendar), rows: built)
        }
    }

    static func dayTitle(_ date: Date, now: Date, calendar: Calendar = .current) -> String {
        if calendar.isDate(date, inSameDayAs: now) { return "Hôm nay" }
        if let y = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: y) { return "Hôm qua" }
        let names = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"]
        let c = calendar.dateComponents([.weekday, .day, .month], from: date)
        return String(format: "%@, %02d/%02d", names[(c.weekday ?? 1) - 1], c.day ?? 0, c.month ?? 0)
    }

    static func icon(for source: String) -> String {
        switch source {
        case "push": return "bell.fill"
        case "widget": return "lock.iphone"
        default: return "envelope.fill"
        }
    }

    static func shouldLoadMore(lastPage: [RemindedItem], hasMore: Bool, pagesLoaded: Int, now: Date, calendar: Calendar = .current) -> Bool {
        guard hasMore, pagesLoaded < maxPages,
              let oldest = lastPage.last.flatMap({ APIDate.parse($0.shownAt) }) else { return false }
        return oldest >= cutoff(now: now, calendar: calendar)
    }
}
