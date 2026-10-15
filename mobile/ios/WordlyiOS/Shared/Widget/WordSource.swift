import Foundation

// Nguồn từ chung cho widget màn hình khoá, màn hình chính và push (spec
// 2026-10-15-shared-word-source-design.md §2). Dùng chung app + widget (project.yml).
// Luật dựng pool phải khớp web/src/lib/word-source/pool.js — cùng kiểm bằng
// shared/fixtures/word-pool-cases.json.

struct WordSourceSettings: Codable, Equatable {
    static let maxPins = 30

    var includeSaved = true
    var includeBank = true
    /// Id từ đã lưu được ghim (thứ tự ghim). Id không còn lưu được bỏ qua khi đọc,
    /// không xoá khỏi mảng → hoàn tác xoá từ thì từ tự ghim lại.
    var pinnedIds: [String] = []
    var pinnedOnly = false
    /// Lần sửa gần nhất (máy hoặc server) — bản mới hơn thắng khi đồng bộ
    var updatedAt: Date?

    init(includeSaved: Bool = true, includeBank: Bool = true, pinnedIds: [String] = [],
         pinnedOnly: Bool = false, updatedAt: Date? = nil) {
        (self.includeSaved, self.includeBank, self.pinnedIds, self.pinnedOnly, self.updatedAt) =
            (includeSaved, includeBank, pinnedIds, pinnedOnly, updatedAt)
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Self()
        includeSaved = try c.decodeIfPresent(Bool.self, forKey: .includeSaved) ?? d.includeSaved
        includeBank = try c.decodeIfPresent(Bool.self, forKey: .includeBank) ?? d.includeBank
        pinnedIds = try c.decodeIfPresent([String].self, forKey: .pinnedIds) ?? []
        pinnedOnly = try c.decodeIfPresent(Bool.self, forKey: .pinnedOnly) ?? false
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
    }

    /// Tắt "Từ đã lưu" thì từ kho là nguồn duy nhất → bật và khoá.
    var bankLocked: Bool { !includeSaved }

    mutating func setIncludeSaved(_ on: Bool) {
        includeSaved = on
        if !on { includeBank = true }
    }

    mutating func setIncludeBank(_ on: Bool) {
        guard !bankLocked else { includeBank = true; return }
        includeBank = on
    }

    func isPinned(_ id: String) -> Bool { pinnedIds.contains(id) }

    enum PinResult: Equatable { case pinned, unpinned, limitReached }

    @discardableResult
    mutating func togglePin(_ id: String) -> PinResult {
        if let i = pinnedIds.firstIndex(of: id) {
            pinnedIds.remove(at: i)
            return .unpinned
        }
        guard pinnedIds.count < Self.maxPins else { return .limitReached }
        pinnedIds.append(id)
        return .pinned
    }

    /// Chuyển cài đặt widget cũ (một lần): "Tự chọn" → từ ghim + chỉ dùng từ ghim;
    /// nguồn khác → đã lưu (nguồn "dịch gần đây" đã bỏ). Giữ lựa chọn trộn kho.
    static func migrated(from legacy: WidgetSettings, savedIds: Set<String>) -> WordSourceSettings {
        var s = WordSourceSettings(includeSaved: true, includeBank: legacy.includeBank)
        if legacy.source == .custom {
            var seen = Set<String>()
            s.pinnedIds = Array(legacy.selectedIds.filter { savedIds.contains($0) && seen.insert($0).inserted }
                .prefix(maxPins))
            s.pinnedOnly = true
        }
        return s
    }
}

/// Danh sách xoay vòng dựng từ nguồn từ.
enum WordSourcePool {
    struct Result: Equatable {
        /// Từ của bạn (không lặp) — gồm cả từ ghim
        var personal: [WidgetWordItem]
        /// Từ ghim hợp lệ — mỗi vòng xuất hiện thêm 1 lần (tổng 2 lần)
        var pinned: [WidgetWordItem]
        /// Từ kho dùng được (đã bỏ trùng chữ với từ của bạn)
        var bank: [WidgetWordItem]
        var isEmpty: Bool { personal.isEmpty && bank.isEmpty }
    }

    /// `saved` = chỉ từ đã lưu. Luật: spec §2.2.
    static func build(settings s: WordSourceSettings, saved: [WidgetWordItem], bank: [WidgetWordItem]) -> Result {
        let savedById = Dictionary(saved.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var seen = Set<String>()
        let pins = s.pinnedIds.prefix(WordSourceSettings.maxPins)
            .compactMap { id in seen.insert(id).inserted ? savedById[id] : nil }

        if s.pinnedOnly && !pins.isEmpty {
            return Result(personal: pins, pinned: pins, bank: [])
        }
        let personal = WordMix.dedupe((s.includeSaved ? saved : []) + pins)
        let pinned = pins.filter { p in personal.contains { $0.id == p.id } }
        let useBank = s.includeBank || !s.includeSaved || personal.isEmpty
        return Result(personal: personal, pinned: pinned, bank: useBank ? WordMix.bank(bank, excluding: personal) : [])
    }
}

extension WordSourceSettings {
    /// Khoá App Group — app ghi, widget đọc.
    static let storageKey = "wordly.wordSource"

    /// Đọc nguồn từ trong App Group. Máy chưa có (cập nhật từ bản cũ) → chuyển từ
    /// cài đặt widget cũ, KHÔNG ghi (app ghi + gửi server khi mở, widget chỉ đọc).
    static func load(defaults: UserDefaults?, legacy: WidgetSettings, words: [WidgetWordItem]) -> WordSourceSettings {
        if let data = defaults?.data(forKey: storageKey),
           let s = try? JSONDecoder().decode(WordSourceSettings.self, from: data) {
            return s
        }
        return migrated(from: legacy, savedIds: Set(words.filter(\.isSaved).map(\.id)))
    }
}

extension WordSourceSettings {
    /// Số từ ghim còn hợp lệ (còn trong danh sách đã lưu).
    func validPinCount(savedIds: Set<String>) -> Int {
        Set(pinnedIds).intersection(savedIds).count
    }

    /// Tóm tắt bằng chữ cho dòng "Nguồn từ" ở Cá nhân — không hiện số lượng từ.
    func summary(savedIds: Set<String>) -> String {
        let hasPins = validPinCount(savedIds: savedIds) > 0
        if pinnedOnly && hasPins { return "Chỉ từ ghim" }
        let base: String
        switch (includeSaved, includeBank) {
        case (true, true): base = "Đã lưu + từ mới"
        case (true, false): base = "Từ đã lưu"
        default: base = "Từ mới trong kho"
        }
        return hasPins && !pinnedOnly ? base + " · có từ ghim" : base
    }
}
