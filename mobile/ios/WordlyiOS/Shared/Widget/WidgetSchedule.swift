import Foundation

// Dùng chung cho app + widget (cùng được biên dịch vào 2 target, xem project.yml).
// App lưu danh sách từ + cài đặt vào App Group; widget đọc ra và dựng lịch hiển thị.

/// Một từ hiện trên widget.
struct WidgetWordItem: Codable, Equatable, Identifiable {
    let id: String
    let word: String
    let meaning: String
    var isSaved: Bool
    /// Lấy từ kho 7.5k từ (không phải từ người dùng đã dịch/lưu)
    var fromBank: Bool = false
}

extension WidgetWordItem {
    // Dữ liệu cũ trong App Group chưa có `fromBank`
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        word = try c.decode(String.self, forKey: .word)
        meaning = try c.decode(String.self, forKey: .meaning)
        isSaved = try c.decode(Bool.self, forKey: .isSaved)
        fromBank = try c.decodeIfPresent(Bool.self, forKey: .fromBank) ?? false
    }
}

/// Cài đặt widget (Hồ sơ → Widget màn hình khoá).
struct WidgetSettings: Codable, Equatable {
    enum Source: String, Codable, CaseIterable {
        case saved      // từ đã bấm "Lưu"
        case recent     // mọi bản dịch Anh→Việt gần đây
        case custom     // tự chọn từng từ
    }

    var source: Source = .saved
    var selectedIds: [String] = []
    /// Chu kỳ đổi từ (phút)
    var intervalMinutes: Int = 60
    /// Khung giờ hiển thị, tính bằng phút từ 0h (cho phép qua đêm: start > end)
    var activeStartMinutes: Int = 7 * 60
    var activeEndMinutes: Int = 22 * 60
    /// Ẩn nghĩa để tự kiểm tra trí nhớ
    var showMeaning: Bool = true
    /// Trộn thêm từ mới trong kho từ vựng (không áp dụng cho "Tự chọn")
    var includeBank: Bool = true

    static let intervals = [15, 30, 60, 120]
}

extension WidgetSettings {
    // Cài đặt cũ thiếu khoá mới → giữ giá trị cũ, khoá mới lấy mặc định
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = WidgetSettings()
        source = try c.decodeIfPresent(Source.self, forKey: .source) ?? d.source
        selectedIds = try c.decodeIfPresent([String].self, forKey: .selectedIds) ?? d.selectedIds
        intervalMinutes = try c.decodeIfPresent(Int.self, forKey: .intervalMinutes) ?? d.intervalMinutes
        activeStartMinutes = try c.decodeIfPresent(Int.self, forKey: .activeStartMinutes) ?? d.activeStartMinutes
        activeEndMinutes = try c.decodeIfPresent(Int.self, forKey: .activeEndMinutes) ?? d.activeEndMinutes
        showMeaning = try c.decodeIfPresent(Bool.self, forKey: .showMeaning) ?? d.showMeaning
        includeBank = try c.decodeIfPresent(Bool.self, forKey: .includeBank) ?? d.includeBank
    }
}

/// Trộn từ của người dùng với từ trong kho: chống trùng, xoay vòng có xáo trộn.
///
/// Mỗi "vòng" hiện mọi từ của bạn đúng một lần, xen kẽ 2 từ của bạn : 1 từ kho.
/// Kho thường lớn hơn nhiều → mỗi vòng chỉ lấy một phần kho (≈ nửa số từ của bạn),
/// vòng sau lấy phần kế tiếp, để từ kho không bao giờ hiện liền nhau át từ của bạn.
/// Thứ tự mỗi vòng được xáo bằng hạt giống = số vòng → app và widget tính ra cùng
/// kết quả mà không cần lưu trạng thái, và mỗi vòng một thứ tự khác.
enum WordMix {
    static func normalize(_ word: String) -> String {
        let collapsed = word.lowercased()
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
        return String(collapsed.reversed().drop { ".,!?;:".contains($0) }.reversed())
    }

    /// Bỏ từ trùng (đã chuẩn hoá), giữ lần xuất hiện đầu.
    static func dedupe(_ items: [WidgetWordItem]) -> [WidgetWordItem] {
        var seen = Set<String>()
        return items.filter { seen.insert(normalize($0.word)).inserted }
    }

    /// Từ kho, bỏ những từ người dùng đã có và trùng nhau.
    static func bank(_ bank: [WidgetWordItem], excluding mine: [WidgetWordItem]) -> [WidgetWordItem] {
        let own = Set(mine.map { normalize($0.word) })
        return dedupe(bank).filter { !own.contains(normalize($0.word)) }
    }

    /// Thứ tự hiển thị của một vòng.
    static func rotation(personal: [WidgetWordItem], bank: [WidgetWordItem], cycle: Int) -> [WidgetWordItem] {
        var rng = SeededRandom(seed: UInt64(truncatingIfNeeded: cycle) &* 0x9E37_79B9_7F4A_7C15 &+ 1)
        let p = personal.sorted { $0.id < $1.id }.shuffled(using: &rng)
        let b = bankSlice(bank, personalCount: personal.count, cycle: cycle).shuffled(using: &rng)
        var out: [WidgetWordItem] = []
        var i = 0, j = 0
        while i < p.count || j < b.count {
            for _ in 0..<2 where i < p.count { out.append(p[i]); i += 1 }
            if j < b.count { out.append(b[j]); j += 1 }
        }
        return out
    }

    /// Số từ kho mỗi vòng: cả kho nếu bạn chưa có từ nào, ngược lại ≈ nửa số từ của bạn.
    static func bankPerCycle(bank: Int, personal: Int) -> Int {
        personal == 0 ? bank : min(bank, (personal + 1) / 2)
    }

    /// Phần kho dùng cho vòng `cycle` — trượt dần qua toàn bộ kho.
    private static func bankSlice(_ bank: [WidgetWordItem], personalCount: Int, cycle: Int) -> [WidgetWordItem] {
        let sorted = bank.sorted { $0.id < $1.id }
        let k = bankPerCycle(bank: sorted.count, personal: personalCount)
        guard k > 0, k < sorted.count else { return sorted }
        let start = (max(0, cycle) * k) % sorted.count
        return (0..<k).map { sorted[(start + $0) % sorted.count] }
    }

    /// Từ ở ô thứ `slot` (đếm liên tục qua các vòng).
    static func item(at slot: Int, personal: [WidgetWordItem], bank: [WidgetWordItem]) -> WidgetWordItem? {
        let length = personal.count + bankPerCycle(bank: bank.count, personal: personal.count)
        guard length > 0 else { return nil }
        let cycle = max(0, slot) / length
        var seq = rotation(personal: personal, bank: bank, cycle: cycle)
        // Chỗ nối hai vòng: không để một từ hiện hai lần liền
        if cycle > 0, seq.count > 1,
           seq.first?.id == rotation(personal: personal, bank: bank, cycle: cycle - 1).last?.id {
            seq.swapAt(0, 1)
        }
        return seq[max(0, slot) % length]
    }
}

/// SplitMix64 — xáo trộn có hạt giống, ổn định giữa app và widget.
struct SeededRandom: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed }
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

enum WidgetSchedule {
    struct Entry: Equatable {
        let date: Date
        let word: WidgetWordItem?
    }

    /// Lọc từ theo nguồn. "Đã lưu" mà chưa lưu từ nào thì dùng từ gần đây để widget không trống.
    static func pool(from words: [WidgetWordItem], settings: WidgetSettings) -> [WidgetWordItem] {
        switch settings.source {
        case .recent:
            return words
        case .saved:
            let saved = words.filter(\.isSaved)
            return saved.isEmpty ? words : saved
        case .custom:
            let ids = Set(settings.selectedIds)
            return words.filter { ids.contains($0.id) }
        }
    }

    private static func minutes(_ date: Date, _ cal: Calendar) -> Int {
        let c = cal.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    static func isActive(_ date: Date, settings: WidgetSettings, calendar cal: Calendar = .current) -> Bool {
        let m = minutes(date, cal)
        let s = settings.activeStartMinutes, e = settings.activeEndMinutes
        if s == e { return true }                    // cả ngày
        return s < e ? (m >= s && m < e) : (m >= s || m < e)
    }

    /// Mốc thay đổi tiếp theo: hết slot hiện tại, hết khung giờ, hoặc lúc khung giờ mở lại.
    private static func nextChange(after date: Date, settings: WidgetSettings, calendar cal: Calendar) -> Date {
        let day = cal.startOfDay(for: date)
        let m = minutes(date, cal)
        func at(_ minute: Int, dayOffset: Int = 0) -> Date {
            cal.date(byAdding: .minute, value: minute, to: cal.date(byAdding: .day, value: dayOffset, to: day)!)!
        }
        let s = settings.activeStartMinutes, e = settings.activeEndMinutes
        if isActive(date, settings: settings, calendar: cal) {
            let interval = max(1, settings.intervalMinutes)
            var next = at((m / interval + 1) * interval)
            if s != e {
                let end = (s > e && m >= s) ? at(e, dayOffset: 1) : at(e)
                if end > date && end < next { next = end }
            }
            return next
        }
        return m < s ? at(s) : at(s, dayOffset: 1)
    }

    /// Lúc xin lịch mới: hết lịch, nhưng không sớm hơn 30 phút — pool rỗng chỉ
    /// có 1 entry tại `now`, xin lại ngay sẽ lặp liên tục và đốt lượt cập nhật.
    static func reloadDate(entries: [Entry], now: Date = Date()) -> Date {
        let minimum = now.addingTimeInterval(30 * 60)
        guard let last = entries.last?.date, last > minimum else { return minimum }
        return last
    }

    /// Lịch hiển thị ~24 giờ tới. Ngoài khung giờ → entry `word == nil` (màn nghỉ).
    /// Từ kho được trộn vào (đã bỏ từ người dùng có rồi). "Tự chọn" thì không trộn.
    static func bankPool(_ bank: [WidgetWordItem], words: [WidgetWordItem], settings: WidgetSettings) -> [WidgetWordItem] {
        guard settings.includeBank, settings.source != .custom else { return [] }
        return WordMix.bank(bank, excluding: words)
    }

    static func entries(words: [WidgetWordItem], bank: [WidgetWordItem] = [], settings: WidgetSettings, now: Date = Date(),
                        calendar cal: Calendar = .current, horizonHours: Int = 24) -> [Entry] {
        let personal = WordMix.dedupe(pool(from: words, settings: settings))
        let bankWords = bankPool(bank, words: words, settings: settings)
        guard !personal.isEmpty || !bankWords.isEmpty else { return [Entry(date: now, word: nil)] }

        let horizon = now.addingTimeInterval(TimeInterval(horizonHours * 3600))
        // Xoay vòng theo số slot kể từ mốc cố định → mỗi slot một từ, lần sau mở app không lặp lại từ đầu
        var index = Int(now.timeIntervalSince1970 / 60) / max(1, settings.intervalMinutes)
        var result: [Entry] = []
        var t = now
        while t < horizon && result.count < 200 {
            if isActive(t, settings: settings, calendar: cal) {
                result.append(Entry(date: t, word: WordMix.item(at: index, personal: personal, bank: bankWords)))
                index += 1
            } else {
                result.append(Entry(date: t, word: nil))
            }
            t = nextChange(after: t, settings: settings, calendar: cal)
        }
        return result
    }
}
