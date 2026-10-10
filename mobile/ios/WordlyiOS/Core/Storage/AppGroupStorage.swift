import Foundation
import WidgetKit

/// Dữ liệu chia sẻ với widget qua App Group (UserDefaults). Widget đọc đúng 2 khoá
/// này — xem WordlyWidget/WordlyWidget.swift.
final class AppGroupStorage {
    static let shared = AppGroupStorage()
    static let wordsKey = "wordly.widget.items"
    static let settingsKey = "wordly.widget.settings"
    static let bankKey = "wordly.widget.bank"
    private static let bankFetchedAtKey = "wordly.widget.bank.fetchedAt"
    private static let bankLevelKey = "wordly.widget.bank.level"

    private let defaults: UserDefaults?

    private init() {
        defaults = UserDefaults(suiteName: WordlyConfig.appGroup)
    }

    var words: [WidgetWordItem] {
        guard let data = defaults?.data(forKey: Self.wordsKey) else { return [] }
        return (try? JSONDecoder().decode([WidgetWordItem].self, from: data)) ?? []
    }

    var settings: WidgetSettings {
        get {
            guard let data = defaults?.data(forKey: Self.settingsKey),
                  let s = try? JSONDecoder().decode(WidgetSettings.self, from: data) else { return WidgetSettings() }
            return s
        }
        set {
            defaults?.set(try? JSONEncoder().encode(newValue), forKey: Self.settingsKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    func saveWords(_ words: [WidgetWordItem]) {
        guard words != self.words else { return }
        defaults?.set(try? JSONEncoder().encode(words), forKey: Self.wordsKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Từ kho trộn vào widget (lô của ngày).
    var bank: [WidgetWordItem] {
        guard let data = defaults?.data(forKey: Self.bankKey) else { return [] }
        return (try? JSONDecoder().decode([WidgetWordItem].self, from: data)) ?? []
    }
    var bankFetchedAt: Date? { defaults?.object(forKey: Self.bankFetchedAtKey) as? Date }
    var bankLevel: String? { defaults?.string(forKey: Self.bankLevelKey) }

    func saveBank(_ words: [WidgetWordItem], level: String?, at date: Date = Date()) {
        defaults?.set(try? JSONEncoder().encode(words), forKey: Self.bankKey)
        defaults?.set(date, forKey: Self.bankFetchedAtKey)
        defaults?.set(level, forKey: Self.bankLevelKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Đăng xuất: xoá từ vựng (riêng tư) của tài khoản khỏi màn hình khoá.
    func clearWords() {
        defaults?.removeObject(forKey: Self.wordsKey)
        defaults?.removeObject(forKey: Self.bankFetchedAtKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Lịch sử dịch → từ cho widget: chỉ Anh→Việt, bỏ trùng, giữ thứ tự mới nhất trước.
    static func items(from history: [TranslateHistoryEntry]) -> [WidgetWordItem] {
        var seen = Set<String>()
        return history.compactMap { e in
            guard e.direction == "EN→VI" else { return nil }
            let key = e.sourceText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard !key.isEmpty, seen.insert(key).inserted else { return nil }
            return WidgetWordItem(id: e.id, word: e.sourceText, meaning: e.translatedText, isSaved: e.isSaved == true)
        }
    }

    /// Giữ lại cho chỗ gọi cũ (lịch sử, trang chủ) — gộp với từ đã có để không mất từ cũ hơn trang đang xem.
    func syncWidgetData(from history: [TranslateHistoryEntry]) {
        let fresh = Self.items(from: history)
        var merged = fresh
        let ids = Set(fresh.map(\.word).map { $0.lowercased() })
        merged += words.filter { !ids.contains($0.word.lowercased()) }
        saveWords(Array(merged.prefix(300)))
    }
}

/// Tải lịch sử (tối đa 200 dòng) rồi đẩy sang widget. Gọi khi mở app, sau khi lưu từ.
enum WidgetSync {
    static func refresh() async {
        var all: [TranslateHistoryEntry] = []
        var offset = 0
        var fetchedAny = false
        while offset < 200 {
            guard let page = try? await APIClient.shared.fetchHistory(limit: 50, offset: offset) else { break }
            fetchedAny = true
            all += page.history
            if !page.hasMore { break }
            offset += 50
        }
        // Mất mạng → giữ nguyên; tải được mà rỗng (tài khoản mới) → ghi rỗng để
        // không còn từ của tài khoản trước trên màn hình khoá
        guard fetchedAny else { return }
        let store = AppGroupStorage.shared
        let items = AppGroupStorage.items(from: all)
        let changed = items != store.words
        store.saveWords(items)
        if changed {
            // Chỉ log đúng pool widget sẽ thực sự hiện (theo settings.source),
            // không log cả 200 dòng lịch sử thô — tránh làm suggestion_log
            // phình ra với từ chưa bao giờ lên màn hình khoá.
            let shown = WidgetSchedule.pool(from: items, settings: store.settings)
            if !shown.isEmpty {
                Task { await APIClient.shared.logWidgetShown(items: shown) }
            }
        }
        await refreshBank()
    }

    /// Lô từ kho mới mỗi ngày, hoặc khi đổi trình độ (`force` khi vừa sửa hồ sơ).
    static func refreshBank(force: Bool = false) async {
        let store = AppGroupStorage.shared
        let skill = try? await APIClient.shared.fetchProfile().profile?.skillLevel
        guard force || BankWords.needsRefresh(fetchedAt: store.bankFetchedAt, level: skill, lastLevel: store.bankLevel) else { return }
        guard let words = try? await BankWords.fetch(skill: skill), !words.isEmpty else { return }
        let changed = words != store.bank
        store.saveBank(words, level: skill)
        guard changed else { return }
        // bankPool() cũng tôn trọng settings (includeBank + không trộn khi "Tự chọn").
        let shown = WidgetSchedule.bankPool(words, words: store.words, settings: store.settings)
        if !shown.isEmpty {
            Task { await APIClient.shared.logWidgetShown(items: shown) }
        }
    }
}
