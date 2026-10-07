import Foundation
import WidgetKit

/// Dữ liệu chia sẻ với widget qua App Group (UserDefaults). Widget đọc đúng 2 khoá
/// này — xem WordlyWidget/WordlyWidget.swift.
final class AppGroupStorage {
    static let shared = AppGroupStorage()
    static let wordsKey = "wordly.widget.items"
    static let settingsKey = "wordly.widget.settings"

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
        while offset < 200 {
            guard let page = try? await APIClient.shared.fetchHistory(limit: 50, offset: offset) else { break }
            all += page.history
            if !page.hasMore { break }
            offset += 50
        }
        guard !all.isEmpty else { return }
        AppGroupStorage.shared.saveWords(AppGroupStorage.items(from: all))
    }
}
