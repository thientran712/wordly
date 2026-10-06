import Foundation

// Shared model — keep in sync with AppGroupStorage in main app
struct WidgetWordEntry: Codable {
    let sourceText: String
    let translatedText: String
    let direction: String
}
