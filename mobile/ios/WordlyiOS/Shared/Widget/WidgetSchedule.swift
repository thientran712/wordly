import Foundation
import SwiftUI

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
        case recent     // mọi bản dịch Anh→Việt gần đây (= tick cả "Đã lưu" lẫn "Dịch gần đây")
        case custom     // tự chọn từng từ
        case unsaved    // bản dịch gần đây chưa bấm "Lưu"
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

    /// Kiểu hiển thị widget MÀN HÌNH KHOÁ — Apple không cho tùy biến màu/nền ở
    /// đây (OS tự tô đơn sắc theo tint người dùng chọn), chỉ cỡ chữ/đậm/bố cục.
    enum LockStyle: String, Codable, CaseIterable {
        case full       // nhãn + từ + nghĩa (hiện tại)
        case compact    // chỉ từ, cỡ lớn + đậm
    }
    var lockStyle: LockStyle = .full

    /// Theme màu nền widget MÀN HÌNH CHÍNH — bản cũ (3 preset cố định), giữ
    /// lại chỉ để decode dữ liệu cũ không lỗi; không còn dùng để vẽ (xem `homeStyle`).
    enum HomeTheme: String, Codable, CaseIterable {
        case defaultTheme, sunset, midnight
    }
    var homeTheme: HomeTheme = .defaultTheme

    /// Tuỳ biến widget MÀN HÌNH CHÍNH — màu nền/gradient, màu chữ, đậm/
    /// nghiêng/nhạt cho từ và nghĩa riêng nhau. (Ảnh nền từ thư viện đã bỏ
    /// 11/10/2026 vì gây crash; dữ liệu cũ còn khoá imageOverlay vẫn đọc được.)
    enum TextWeight: String, Codable, CaseIterable {
        case light, regular, bold
    }
    struct HomeStyle: Codable, Equatable {
        // Mặc định = theme "Wordly" (WidgetTheme) — đạt tương phản WCAG AA. Màu
        // cũ #1CB0F6/#58CC02 chữ trắng chỉ ~2.1–2.4; ai đã lưu cài đặt thì giữ nguyên.
        var bgHex1: String = "#0B6FA4"
        var bgHex2: String = "#2E7D0B"
        var wordColorHex: String = "#FFFFFF"
        var meaningColorHex: String = "#E8F7FF"
        var wordWeight: TextWeight = .bold
        var meaningWeight: TextWeight = .regular
        var wordItalic: Bool = false
        var meaningItalic: Bool = false
        /// Ảnh nền (file trong App Group, xem WidgetBackgroundStore). 0 = không có ảnh.
        var backgroundVersion: Int = 0
        /// Lớp làm tối phủ lên ảnh để chữ đọc được, 0…maxDim.
        var backgroundDim: Double = 0.3
        /// Tắt = nền một màu (bgHex1). Mặc định bật để cài đặt cũ trông như trước.
        var useGradient: Bool = true
        /// Khung đã chọn cho từng cỡ — để mở lại màn chỉnh khung đúng chỗ cũ.
        var cropSmall: CropFrame? = nil
        var cropMedium: CropFrame? = nil
        /// Theme ảnh đang dùng (ảnh kèm app, file đã cắt sẵn trong App Group).
        /// Ảnh người dùng tự chọn (`backgroundVersion`) luôn đè lên ảnh theme.
        var themePhotoId: String? = nil
        var hasBackgroundImage: Bool { backgroundVersion > 0 }
        /// Widget có ảnh nền (của người dùng hoặc của theme) → hiện thanh "Làm tối".
        var hasAnyBackground: Bool { hasBackgroundImage || themePhotoId != nil }
        /// Hai đầu nền; tắt gradient thì cả hai là bgHex1.
        var backgroundHexes: [String] { [bgHex1, useGradient ? bgHex2 : bgHex1] }
        static let maxDim = 0.6
    }
    var homeStyle: HomeStyle = HomeStyle()

    /// Căn lề chữ trên widget (màn hình khoá chữ nhật + màn hình chính).
    enum TextAlign: String, Codable, CaseIterable {
        case leading, center, trailing
    }
    var textAlign: TextAlign = .leading

    static let intervals = [15, 30, 60, 120]

    // Hai ô chọn "Đã lưu" / "Dịch gần đây" trong cài đặt. "Tự chọn" thì không ô nào.
    var includesSaved: Bool { source == .saved || source == .recent }
    var includesRecent: Bool { source == .unsaved || source == .recent }

    /// Bỏ chọn cả hai thì giữ nguyên — widget phải còn ít nhất một nguồn.
    mutating func setSources(saved: Bool, recent: Bool) {
        switch (saved, recent) {
        case (true, true): source = .recent
        case (true, false): source = .saved
        case (false, true): source = .unsaved
        case (false, false): break
        }
    }
}

extension WidgetSettings.HomeStyle {
    // Bộ giải mã tự sinh báo lỗi khi thiếu khoá (không lấy giá trị mặc định)
    // → kéo hỏng cả WidgetSettings, người dùng mất hết cài đặt widget.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Self()
        bgHex1 = try c.decodeIfPresent(String.self, forKey: .bgHex1) ?? d.bgHex1
        bgHex2 = try c.decodeIfPresent(String.self, forKey: .bgHex2) ?? d.bgHex2
        wordColorHex = try c.decodeIfPresent(String.self, forKey: .wordColorHex) ?? d.wordColorHex
        meaningColorHex = try c.decodeIfPresent(String.self, forKey: .meaningColorHex) ?? d.meaningColorHex
        wordWeight = try c.decodeIfPresent(WidgetSettings.TextWeight.self, forKey: .wordWeight) ?? d.wordWeight
        meaningWeight = try c.decodeIfPresent(WidgetSettings.TextWeight.self, forKey: .meaningWeight) ?? d.meaningWeight
        wordItalic = try c.decodeIfPresent(Bool.self, forKey: .wordItalic) ?? d.wordItalic
        meaningItalic = try c.decodeIfPresent(Bool.self, forKey: .meaningItalic) ?? d.meaningItalic
        backgroundVersion = try c.decodeIfPresent(Int.self, forKey: .backgroundVersion) ?? d.backgroundVersion
        useGradient = try c.decodeIfPresent(Bool.self, forKey: .useGradient) ?? d.useGradient
        cropSmall = try? c.decodeIfPresent(CropFrame.self, forKey: .cropSmall)
        cropMedium = try? c.decodeIfPresent(CropFrame.self, forKey: .cropMedium)
        themePhotoId = try c.decodeIfPresent(String.self, forKey: .themePhotoId)
        backgroundDim = min(max(try c.decodeIfPresent(Double.self, forKey: .backgroundDim) ?? d.backgroundDim, 0), Self.maxDim)
    }
}

extension WidgetSettings.HomeStyle {
    func crop(for kind: WidgetBackgroundKind) -> CropFrame? {
        kind == .small ? cropSmall : cropMedium
    }

    mutating func setCrop(_ frame: CropFrame?, for kind: WidgetBackgroundKind) {
        if kind == .small { cropSmall = frame } else { cropMedium = frame }
    }
}

extension WidgetSettings.TextAlign {
    var horizontal: HorizontalAlignment {
        switch self { case .leading: .leading; case .center: .center; case .trailing: .trailing }
    }
    var frame: Alignment {
        switch self { case .leading: .leading; case .center: .center; case .trailing: .trailing }
    }
    var multiline: TextAlignment {
        switch self { case .leading: .leading; case .center: .center; case .trailing: .trailing }
    }
}

extension WidgetSettings.TextWeight {
    var swiftUIWeight: Font.Weight {
        switch self {
        case .light: return .light
        case .regular: return .regular
        case .bold: return .bold
        }
    }
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
        lockStyle = try c.decodeIfPresent(LockStyle.self, forKey: .lockStyle) ?? d.lockStyle
        homeTheme = try c.decodeIfPresent(HomeTheme.self, forKey: .homeTheme) ?? d.homeTheme
        homeStyle = try c.decodeIfPresent(HomeStyle.self, forKey: .homeStyle) ?? d.homeStyle
        textAlign = try c.decodeIfPresent(TextAlign.self, forKey: .textAlign) ?? d.textAlign
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

    /// Lọc từ theo nguồn. Nguồn đang chọn không có từ nào thì dùng mọi từ gần đây để widget không trống.
    static func pool(from words: [WidgetWordItem], settings: WidgetSettings) -> [WidgetWordItem] {
        switch settings.source {
        case .recent:
            return words
        case .saved:
            let saved = words.filter(\.isSaved)
            return saved.isEmpty ? words : saved
        case .unsaved:
            let unsaved = words.filter { !$0.isSaved }
            return unsaved.isEmpty ? words : unsaved
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

/// Link khi bấm widget: `wordly://word?id=…&w=…&m=…&bank=1`. Widget tạo, app
/// đọc để mở đúng từ (Từ vựng > Đã lưu hoặc Từ mới + popup nghĩa). Kèm sẵn
/// từ + nghĩa để app hiện được ngay, không phải chờ tải danh sách.
struct WidgetDeepLink: Equatable {
    static let scheme = "wordly"
    static let host = "word"
    private static let bankPrefix = "bank-"

    let id: String
    let word: String
    let meaning: String
    let fromBank: Bool

    /// Id trong bảng `words` (màn Từ mới) — từ kho có id dạng "bank-<id>".
    var bankWordId: String? {
        fromBank && id.hasPrefix(Self.bankPrefix) ? String(id.dropFirst(Self.bankPrefix.count)) : nil
    }

    init(item: WidgetWordItem) {
        id = item.id
        word = item.word
        meaning = item.meaning
        fromBank = item.fromBank
    }

    init?(url: URL) {
        guard url.scheme == Self.scheme, url.host == Self.host,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard let id = value("id"), !id.isEmpty, let word = value("w"), !word.isEmpty else { return nil }
        self.id = id
        self.word = word
        meaning = value("m") ?? ""
        fromBank = value("bank") == "1"
    }

    var url: URL? {
        var c = URLComponents()
        c.scheme = Self.scheme
        c.host = Self.host
        c.queryItems = [
            URLQueryItem(name: "id", value: id),
            URLQueryItem(name: "w", value: word),
            URLQueryItem(name: "m", value: meaning),
            URLQueryItem(name: "bank", value: fromBank ? "1" : "0"),
        ]
        return c.url
    }
}

/// Phiên âm US trên widget. App tra qua /api/dictionary (đã cache trong DB) rồi
/// lưu bảng từ → phiên âm vào App Group; widget chỉ đọc. Câu thì không có phiên
/// âm — vừa vô nghĩa vừa tốn một lượt tra AI.
enum WidgetPhonetic {
    static let cacheKey = "wordly.widget.phonetics"
    /// Cụm từ dài nhất còn tra (vd "take something for granted")
    static let maxWords = 4

    static func eligible(_ text: String) -> Bool {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty, !t.contains(where: { ".?!,;:".contains($0) }) else { return false }
        return t.split(whereSeparator: \.isWhitespace).count <= maxWords
    }

    static func key(_ text: String) -> String { WordMix.normalize(text) }

    /// "rɪˈzɪljənt" → "/rɪˈzɪljənt/"; rỗng → nil (đã tra nhưng không có)
    static func display(_ raw: String?) -> String? {
        let t = (raw ?? "").trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "/")))
        return t.isEmpty ? nil : "/\(t)/"
    }

    static func phonetic(for word: String, cache: [String: String]) -> String? {
        guard eligible(word) else { return nil }
        return display(cache[key(word)])
    }

    /// Từ sắp hiện mà chưa có trong cache (giá trị rỗng = đã tra, không có → không tra lại).
    /// Có `meanings` → từ kho chưa có nghĩa Việt cũng phải tra (kể cả đã có phiên âm
    /// từ trước), vì cùng một lượt tra trả về cả hai — không tốn thêm lượt nào.
    static func wordsToFetch(upcoming: [WidgetWordItem], cache: [String: String],
                             meanings: [String: String]? = nil, limit: Int) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        for item in upcoming where eligible(item.word) {
            let k = key(item.word)
            let needsMeaning = item.fromBank && meanings.map { $0[k] == nil } == true
            guard cache[k] == nil || needsMeaning, seen.insert(k).inserted else { continue }
            out.append(k)
            if out.count == limit { break }
        }
        return out
    }
}

/// Nghĩa tiếng Việt cho từ kho trên widget. Kho chỉ có định nghĩa tiếng Anh
/// (`words.def_en`), nên app lấy `def_vi` trong cùng lượt tra phiên âm
/// (/api/dictionary) rồi lưu bảng từ (đã chuẩn hoá) → nghĩa Việt vào App Group;
/// widget chỉ đọc. Chưa tra được → giữ nghĩa cũ, widget không bao giờ trống.
enum WidgetMeaning {
    static let cacheKey = "wordly.widget.meaningsVi"

    /// Nghĩa hiện trên widget. Từ của người dùng đã là nghĩa Việt (bản dịch) → giữ nguyên.
    static func meaning(for item: WidgetWordItem, cache: [String: String]) -> String {
        guard item.fromBank else { return item.meaning }
        let vi = (cache[WidgetPhonetic.key(item.word)] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return vi.isEmpty ? item.meaning : vi
    }

    /// Bản sao của từ với nghĩa hiển thị — giữ id/từ để lịch xoay và link mở app không đổi.
    static func localized(_ item: WidgetWordItem, cache: [String: String]) -> WidgetWordItem {
        let shown = meaning(for: item, cache: cache)
        guard shown != item.meaning else { return item }
        return WidgetWordItem(id: item.id, word: item.word, meaning: shown, isSaved: item.isSaved, fromBank: item.fromBank)
    }
}

/// Gộp kết quả tra mới vào bảng lưu trong App Group (phiên âm, nghĩa Việt).
enum WidgetLookupCache {
    static let maxEntries = 2000

    /// Kết quả mới đè kết quả cũ. Không để phình mãi: quá `cap` từ thì chỉ giữ
    /// từ widget còn dùng (`inUse`, khoá đã chuẩn hoá).
    static func merged(_ existing: [String: String], with found: [String: String],
                       inUse: Set<String>, cap: Int = maxEntries) -> [String: String] {
        var all = existing.merging(found) { _, new in new }
        if all.count > cap {
            all = all.filter { inUse.contains($0.key) }
        }
        return all
    }
}
