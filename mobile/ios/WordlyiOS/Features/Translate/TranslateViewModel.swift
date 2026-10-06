import Foundation
import Combine

@MainActor
final class TranslateViewModel: ObservableObject {
    @Published var inputText = ""
    @Published var translatedText = ""
    @Published var direction: TranslateDirection = .enToVi
    @Published var isTranslating = false
    @Published var isSuggLoading = false
    @Published var suggestions: [String] = []
    @Published var showSuggestions = false
    @Published var wordDetail: WordDetail?
    @Published var isDetailLoading = false
    @Published var saved = false
    @Published var isOverLimit = false
    @Published var saveError: String?

    let api = APIClient.shared
    private var translateTask: Task<Void, Never>?
    private var suggestTask: Task<Void, Never>?
    private var translateCache: [String: String] = [:]
    private var dictCache: [String: WordDetail] = [:]
    private var suppressSuggestions = false

    let charLimit = 10_000

    enum TranslateDirection: String, CaseIterable {
        case enToVi = "EN→VI"
        case viToEn = "VI→EN"

        var source: String { self == .enToVi ? "EN" : "VI" }
        var target: String { self == .enToVi ? "VI" : "EN" }
        var sourceName: String { self == .enToVi ? "English" : "Tiếng Việt" }
        var targetName: String { self == .enToVi ? "Tiếng Việt" : "English" }
        var flipped: TranslateDirection { self == .enToVi ? .viToEn : .enToVi }
    }

    // MARK: - Input changed
    func onInputChanged(_ text: String) {
        saved = false
        wordDetail = nil
        isOverLimit = text.count > charLimit
        scheduleTranslation(text)
        if direction == .enToVi && !suppressSuggestions {
            scheduleSuggestions(text)
        }
    }

    // MARK: - Translation debounce
    private func scheduleTranslation(_ text: String) {
        translateTask?.cancel()
        guard !isOverLimit, !text.trimmingCharacters(in: .whitespaces).isEmpty else {
            if text.isEmpty { translatedText = "" }
            return
        }
        translateTask = Task {
            try? await Task.sleep(nanoseconds: 280_000_000) // 280ms
            guard !Task.isCancelled else { return }
            await translate(text: text)
        }
    }

    private func translate(text: String) async {
        let key = "\(direction.rawValue)::\(text.trimmingCharacters(in: .whitespaces))"
        if let cached = translateCache[key] {
            translatedText = cached
            return
        }
        isTranslating = true
        do {
            let resp = try await api.translate(text: text, source: direction.source, target: direction.target)
            if let result = resp.translated, !result.isEmpty {
                translateCache[key] = result
                if translateCache.count > 100 { translateCache.removeValue(forKey: translateCache.keys.first!) }
                translatedText = result
            } else {
                translatedText = "Lỗi — thử lại sau"
            }
        } catch {
            translatedText = "Lỗi — thử lại sau"
        }
        isTranslating = false
    }

    // MARK: - Suggestions debounce
    private func scheduleSuggestions(_ text: String) {
        suggestTask?.cancel()
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.count >= 2 else {
            suggestions = []
            showSuggestions = false
            return
        }
        suggestTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000) // 150ms
            guard !Task.isCancelled else { return }
            isSuggLoading = true
            do {
                var words = try await api.fetchSuggestions(query: trimmed)
                let exact = trimmed.lowercased()
                if words.first?.lowercased() != exact {
                    words = [exact] + words.filter { $0.lowercased() != exact }
                    words = Array(words.prefix(8))
                }
                suggestions = words
                showSuggestions = !words.isEmpty
            } catch {}
            isSuggLoading = false
        }
    }

    // MARK: - Pick suggestion
    func pickSuggestion(_ word: String) {
        suppressSuggestions = true
        showSuggestions = false
        suggestions = []
        wordDetail = nil
        saved = false
        inputText = word
        scheduleTranslation(word)
        if direction == .enToVi && isSingleWord(word) {
            Task { await loadWordDetail(word) }
        }
        // Re-enable suggestions after a brief delay
        Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            suppressSuggestions = false
        }
    }

    // MARK: - Flip direction
    func flipDirection() {
        let newDir = direction.flipped
        direction = newDir
        suggestions = []
        showSuggestions = false
        wordDetail = nil
        suppressSuggestions = false
        if !translatedText.isEmpty {
            let old = inputText
            inputText = translatedText
            translatedText = old
        }
    }

    // MARK: - Clear
    func clear() {
        suppressSuggestions = false
        inputText = ""
        translatedText = ""
        wordDetail = nil
        suggestions = []
        showSuggestions = false
        saved = false
        translateTask?.cancel()
        suggestTask?.cancel()
    }

    // MARK: - Save
    func save() async {
        guard !inputText.isEmpty, !translatedText.isEmpty, !saved else { return }
        saved = true
        do {
            try await api.saveTranslation(
                sourceText: inputText.trimmingCharacters(in: .whitespaces),
                translatedText: translatedText,
                direction: direction.rawValue
            )
        } catch {
            saved = false
            saveError = error.localizedDescription
        }
    }

    // MARK: - Word detail
    func loadWordDetail(_ word: String) async {
        if let cached = dictCache[word.lowercased()] {
            wordDetail = cached
            return
        }
        isDetailLoading = true
        if let detail = try? await api.fetchWordDetail(word: word) {
            dictCache[word.lowercased()] = detail
            wordDetail = detail
        }
        isDetailLoading = false
    }

    func onFocused() {
        if !suggestions.isEmpty && !suppressSuggestions {
            showSuggestions = true
        }
    }
    func onUnfocused() {
        Task {
            try? await Task.sleep(nanoseconds: 180_000_000)
            showSuggestions = false
        }
    }

    private func isSingleWord(_ text: String) -> Bool {
        let pattern = #"^\s*[a-zA-Z'-]+\s*$"#
        return text.range(of: pattern, options: .regularExpression) != nil
    }
}
