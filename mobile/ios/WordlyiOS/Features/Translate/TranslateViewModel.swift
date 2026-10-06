import Foundation

/// Màn Dịch & tra từ — hành vi giống web (components/home/InlineTranslate.js):
/// dịch tự động khi gõ, gợi ý từ (Datamuse), từ điển AI cho từ đơn, tự ghi lịch
/// sử sau 10 giây, nút Lưu đánh dấu "Đã lưu" (vào quiz + widget + email ôn tập).
@MainActor
final class TranslateViewModel: ObservableObject {
    enum Direction: String, CaseIterable {
        case enToVi = "EN→VI"
        case viToEn = "VI→EN"

        var source: String { self == .enToVi ? "EN" : "VI" }
        var target: String { self == .enToVi ? "VI" : "EN" }
        var sourceName: String { self == .enToVi ? "English" : "Tiếng Việt" }
        var targetName: String { self == .enToVi ? "Tiếng Việt" : "English" }
        var flipped: Direction { self == .enToVi ? .viToEn : .enToVi }
    }

    enum DictionaryState: Equatable {
        case hidden, loading, loaded(DictionaryDetail), notFound, failed(String)
    }

    @Published var inputText = ""
    @Published var translatedText = ""
    @Published var direction: Direction = .enToVi
    @Published var isTranslating = false
    @Published var suggestions: [String] = []
    @Published var dictionary: DictionaryState = .hidden
    @Published var saved = false
    @Published var toast: String?
    /// Tăng mỗi khi lịch sử đổi (tự ghi / lưu) để danh sách lịch sử tải lại.
    @Published var historyVersion = 0

    let charLimit = 10_000
    var isOverLimit: Bool { inputText.count > charLimit }
    var canSave: Bool { !inputText.trimmingCharacters(in: .whitespaces).isEmpty && !translatedText.isEmpty && !isTranslating }

    private let api = APIClient.shared
    private var translateTask: Task<Void, Never>?
    private var suggestTask: Task<Void, Never>?
    private var autoLogTask: Task<Void, Never>?
    private var translateCache: [String: String] = [:]
    private var dictCache: [String: DictionaryDetail] = [:]
    private var autoLog = AutoLogTracker()
    private var suppressSuggestions = false
    /// Đổi inputText bằng code (chọn mục lịch sử) → onChange của ô nhập không xử lý lại.
    private var skipNextChange = false

    // MARK: Gõ chữ
    func onInputChanged(_ text: String) {
        if skipNextChange {
            skipNextChange = false
            return
        }
        saved = false
        if !TranslateLogic.isSingleWord(text) { dictionary = .hidden }
        scheduleTranslation(text)
        if direction == .enToVi, !suppressSuggestions { scheduleSuggestions(text) } else { suggestions = [] }
    }

    private func scheduleTranslation(_ text: String) {
        translateTask?.cancel()
        autoLogTask?.cancel()
        guard !isOverLimit, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            translatedText = ""
            return
        }
        translateTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await translate(text)
        }
    }

    private func translate(_ text: String) async {
        let key = "\(direction.rawValue)::\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
        if let cached = translateCache[key] {
            translatedText = cached
        } else {
            isTranslating = true
            defer { isTranslating = false }
            do {
                let r = try await api.translate(text: text, source: direction.source, target: direction.target)
                guard !Task.isCancelled else { return }
                guard let result = r.translated, !result.isEmpty else {
                    translatedText = ""
                    toast = r.error ?? "Không dịch được, thử lại nhé"
                    return
                }
                translateCache[key] = result
                translatedText = result
            } catch {
                toast = "Mất kết nối — thử lại nhé"
                return
            }
        }
        if direction == .enToVi, TranslateLogic.isSingleWord(text) {
            await lookUp(text)
        }
        scheduleAutoLog()
    }

    /// Web tự ghi bản dịch vào lịch sử sau 10 giây đứng yên (chưa "Lưu").
    private func scheduleAutoLog() {
        autoLogTask?.cancel()
        let source = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        let translated = translatedText
        let dir = direction.rawValue
        autoLogTask = Task {
            try? await Task.sleep(for: .seconds(10))
            guard !Task.isCancelled, autoLog.shouldLog(direction: dir, text: source) else { return }
            do {
                try await api.saveTranslation(sourceText: source, translatedText: translated, direction: dir)
                historyVersion += 1
            } catch {
                autoLog.forget(direction: dir, text: source)
            }
        }
    }

    // MARK: Gợi ý từ
    private func scheduleSuggestions(_ text: String) {
        suggestTask?.cancel()
        let typed = text.trimmingCharacters(in: .whitespaces)
        guard typed.count >= 2, TranslateLogic.isSingleWord(typed) else {
            suggestions = []
            return
        }
        suggestTask = Task {
            try? await Task.sleep(for: .milliseconds(150))
            guard !Task.isCancelled else { return }
            let fetched = (try? await api.fetchSuggestions(query: typed)) ?? []
            guard !Task.isCancelled else { return }
            suggestions = TranslateLogic.orderSuggestions(typed: typed, fetched: fetched)
        }
    }

    func pickSuggestion(_ word: String) {
        suppressSuggestions = true
        suggestions = []
        inputText = word   // onChange của ô nhập sẽ dịch
        Task {
            try? await Task.sleep(for: .seconds(1))
            suppressSuggestions = false
        }
    }

    // MARK: Từ điển AI
    func lookUp(_ word: String) async {
        let key = TranslateLogic.wordKey(word)
        if let cached = dictCache[key] {
            dictionary = .loaded(cached)
            return
        }
        dictionary = .loading
        do {
            if let detail = try await api.lookupWord(key) {
                dictCache[key] = detail
                dictionary = .loaded(detail)
            } else {
                dictionary = .notFound
            }
        } catch APIError.serverError(let m) where m.contains("429") {
            dictionary = .failed("Bạn tra hơi nhanh, chờ một chút rồi thử lại nhé.")
        } catch {
            dictionary = .failed("Không tra được nghĩa từ. Thử lại nhé.")
        }
    }

    func retryLookup() {
        Task { await lookUp(inputText) }
    }

    // MARK: Hành động
    func flipDirection() {
        direction = direction.flipped
        suggestions = []
        dictionary = .hidden
        if !translatedText.isEmpty {
            let old = inputText
            inputText = translatedText
            translatedText = old
        }
        saved = false
    }

    func clear() {
        translateTask?.cancel()
        suggestTask?.cancel()
        autoLogTask?.cancel()
        inputText = ""
        translatedText = ""
        suggestions = []
        dictionary = .hidden
        saved = false
    }

    /// "Lưu" — web dùng PATCH: đánh dấu dòng lịch sử là đã lưu (tạo mới nếu chưa có).
    func save() async {
        guard canSave, !saved else { return }
        saved = true
        let source = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try await api.markSaved(sourceText: source, translatedText: translatedText, direction: direction.rawValue)
            _ = autoLog.shouldLog(direction: direction.rawValue, text: source) // đã có trong lịch sử, khỏi tự ghi
            autoLogTask?.cancel()
            historyVersion += 1
            toast = "Đã lưu “\(source)” — sẽ có trong quiz và widget"
        } catch {
            saved = false
            toast = "Không lưu được, thử lại nhé"
        }
    }

    /// Nhận một mục từ lịch sử để xem lại.
    func load(entry: TranslateHistoryEntry) {
        direction = entry.direction == Direction.viToEn.rawValue ? .viToEn : .enToVi
        suppressSuggestions = true
        skipNextChange = entry.sourceText != inputText
        inputText = entry.sourceText
        translatedText = entry.translatedText
        translateCache["\(direction.rawValue)::\(entry.sourceText)"] = entry.translatedText
        saved = entry.isSaved == true
        suggestions = []
        _ = autoLog.shouldLog(direction: direction.rawValue, text: entry.sourceText)
        if direction == .enToVi, TranslateLogic.isSingleWord(entry.sourceText) {
            Task { await lookUp(entry.sourceText) }
        } else {
            dictionary = .hidden
        }
        Task {
            try? await Task.sleep(for: .seconds(1))
            suppressSuggestions = false
        }
    }
}
