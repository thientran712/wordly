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

    /// Máy đã có bản nguồn từ mới (chưa có = vừa cập nhật từ bản cũ, cần chuyển + gửi server).
    var hasStoredWordSource: Bool { defaults?.data(forKey: WordSourceSettings.storageKey) != nil }

    /// Nguồn từ chung (widget + push). Chưa có → chuyển từ cài đặt widget cũ.
    var wordSource: WordSourceSettings {
        get { WordSourceSettings.load(defaults: defaults, legacy: settings, words: words) }
        set {
            defaults?.set(try? JSONEncoder().encode(newValue), forKey: WordSourceSettings.storageKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Đã đăng xuất → widget nhắc đăng nhập thay vì xoay từ. Widget đọc khoá này
    /// trực tiếp (WordlyWidget.swift, `signedOutKey`).
    static let signedOutKey = "wordly.widget.signedOut"
    var signedOut: Bool {
        get { defaults?.bool(forKey: Self.signedOutKey) ?? false }
        set { defaults?.set(newValue, forKey: Self.signedOutKey) }
    }

    func saveWords(_ words: [WidgetWordItem]) {
        if signedOut {
            // Đăng nhập lại: đồng bộ được từ là đã có phiên
            signedOut = false
            WidgetCenter.shared.reloadAllTimelines()
        }
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

    /// Bảng từ (đã chuẩn hoá) → phiên âm US cho widget, xem WidgetPhonetic.
    var phonetics: [String: String] {
        defaults?.dictionary(forKey: WidgetPhonetic.cacheKey) as? [String: String] ?? [:]
    }

    /// Bảng từ (đã chuẩn hoá) → nghĩa Việt cho từ kho trên widget, xem WidgetMeaning.
    var meaningsVi: [String: String] {
        defaults?.dictionary(forKey: WidgetMeaning.cacheKey) as? [String: String] ?? [:]
    }

    /// Lưu kết quả một đợt tra từ điển: phiên âm + nghĩa Việt (bảng riêng, cùng
    /// cách chuẩn hoá và cùng giới hạn 2000 từ — dữ liệu phiên âm cũ giữ nguyên).
    func saveLookups(phonetics found: [String: String], meaningsVi foundVi: [String: String] = [:]) {
        guard !found.isEmpty || !foundVi.isEmpty else { return }
        let inUse = Set((words + bank).map { WidgetPhonetic.key($0.word) })
        if !found.isEmpty {
            defaults?.set(WidgetLookupCache.merged(phonetics, with: found, inUse: inUse), forKey: WidgetPhonetic.cacheKey)
        }
        if !foundVi.isEmpty {
            defaults?.set(WidgetLookupCache.merged(meaningsVi, with: foundVi, inUse: inUse), forKey: WidgetMeaning.cacheKey)
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Đăng xuất: xoá từ vựng của tài khoản và cả lô từ kho (nếu không, widget
    /// vẫn xoay từ kho như chưa đăng xuất), widget chuyển sang nhắc đăng nhập.
    /// Giữ cài đặt widget (màu, căn lề…) cho lần đăng nhập sau.
    func clearWords() {
        defaults?.removeObject(forKey: Self.wordsKey)
        defaults?.removeObject(forKey: Self.bankKey)
        defaults?.removeObject(forKey: Self.bankFetchedAtKey)
        defaults?.removeObject(forKey: Self.bankLevelKey)
        // Nguồn từ của tài khoản này (ghim…) không được sang tài khoản đăng nhập sau
        defaults?.removeObject(forKey: WordSourceSettings.storageKey)
        signedOut = true
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Dọn file ảnh nền widget còn sót từ build 9–10 (tính năng ảnh nền đã bỏ
    /// vì gây crash).
    func deleteHomeBackgroundImage() {
        guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: WordlyConfig.appGroup)?
            .appendingPathComponent("widget_home_bg.jpg"),
              FileManager.default.fileExists(atPath: url.path) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    /// 200 từ đã lưu mới nhất gộp TRƯỚC lịch sử — cùng tập từ push dùng trên server
    /// (select-push-word.js, SAVED_WORDS_LIMIT), kể cả khi lịch sử 200 dòng toàn từ chưa lưu.
    static func items(saved: [TranslateHistoryEntry], history: [TranslateHistoryEntry]) -> [WidgetWordItem] {
        items(from: saved + history)
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
    @MainActor private static var lastRefresh: Date?

    static func isStale(lastRefresh: Date?, now: Date, interval: TimeInterval = 300) -> Bool {
        guard let lastRefresh else { return true }
        return now.timeIntervalSince(lastRefresh) > interval
    }

    /// Mở app / quay lại app: chỉ đồng bộ khi lần trước đã quá 5 phút — trước
    /// đây mỗi lần app active đều lật 4 trang lịch sử + hồ sơ + kho từ, tranh
    /// mạng với màn đang tải.
    @MainActor static func refreshIfStale() async {
        guard isStale(lastRefresh: lastRefresh, now: Date()) else { return }
        lastRefresh = Date()
        await refresh()
    }

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
        // Lỗi tải danh sách đã lưu → dùng lịch sử như trước (không làm mất từ)
        let saved = (try? await APIClient.shared.fetchSavedHistory()) ?? []
        let items = AppGroupStorage.items(saved: saved, history: all)
        store.saveWords(items)
        // Nguồn từ chung: lấy bản server / gửi bản máy (sau khi đã có danh sách từ để chuyển cài đặt cũ)
        await WordSourceSync.sync()
        await refreshBank()
        await refreshPhonetics()
        // Lịch widget thật lên server (thay log cả pool) — push tránh trùng
        await MainActor.run { WidgetScheduleUpload.schedule() }
    }

    /// Tra phiên âm cho những từ sắp lên widget mà chưa có — cùng lượt tra lấy
    /// luôn nghĩa Việt cho từ kho (kho chỉ có định nghĩa tiếng Anh). Lịch sắp hiện
    /// đã gồm từ kho trộn vào. Mỗi lần tối đa 12 từ, tuần tự — /api/dictionary
    /// giới hạn 40 lượt/phút/người và dùng chung với tra từ trong app. Từ đã cache
    /// trong DB thì không tốn lượt AI.
    static func refreshPhonetics(limit: Int = 12) async {
        let store = AppGroupStorage.shared
        let upcoming = WidgetSchedule.entries(words: store.words, bank: store.bank, source: store.wordSource,
                                              settings: store.settings)
            .compactMap(\.word)
        let todo = WidgetPhonetic.wordsToFetch(upcoming: upcoming, cache: store.phonetics,
                                               meanings: store.meaningsVi, limit: limit)
        var found: [String: String] = [:]
        var foundVi: [String: String] = [:]
        for word in todo {
            // Lỗi mạng/giới hạn → bỏ qua, lần sau tra lại; tra được mà không có → lưu rỗng
            do {
                let detail = try await APIClient.shared.lookupWord(word)
                found[word] = detail?.phoneticUs ?? ""
                foundVi[word] = detail?.shortMeaningVi ?? ""
            } catch {
                continue
            }
        }
        store.saveLookups(phonetics: found, meaningsVi: foundVi)
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
        await MainActor.run { WidgetScheduleUpload.schedule() }
    }
}
