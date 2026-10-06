import Foundation
import WidgetKit

// Shared UserDefaults between main app and Widget extension
final class AppGroupStorage {
    static let shared = AppGroupStorage()
    private let defaults: UserDefaults?
    private let widgetWordsKey = "wordly.widget.words"

    private init() {
        defaults = UserDefaults(suiteName: WordlyConfig.appGroup)
    }

    // Codable model shared with Widget (mirrors WidgetWordEntry in Widget target)
    struct WidgetWordStorage: Codable {
        let sourceText: String
        let translatedText: String
        let direction: String
    }

    // Save words for widget display
    func saveWidgetWords(_ words: [WidgetWordStorage]) {
        guard let defaults else { return }
        if let data = try? JSONEncoder().encode(words) {
            defaults.set(data, forKey: widgetWordsKey)
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    // Called when user opens app — refresh widget data from latest translate_history
    func syncWidgetData(from history: [TranslateHistoryEntry]) {
        let candidates = history
            .filter { $0.direction == "EN→VI" }
            .prefix(50)
            .map { WidgetWordStorage(sourceText: $0.sourceText, translatedText: $0.translatedText, direction: $0.direction) }
        saveWidgetWords(Array(candidates))
    }
}
