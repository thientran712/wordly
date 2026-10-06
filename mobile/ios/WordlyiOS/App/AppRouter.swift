import SwiftUI

/// Điều hướng giữa các tab — dùng cho lối tắt kiểu "Hỏi Alex về từ này" (từ
/// màn Dịch, Từ vựng theo chủ đề) giống web /practice?word=… .
@MainActor
final class AppRouter: ObservableObject {
    enum Tab: String, Hashable {
        case home, translate, speak, classes, profile
    }

    @Published var selectedTab: Tab = AppRouter.startTab

    private static var startTab: Tab {
        #if DEBUG
        if let name = PreviewMode.initialTab, let tab = Tab(rawValue: name) { return tab }
        #endif
        return .home
    }
    /// Từ cần luyện với Alex — tab Luyện nói đọc rồi xoá.
    @Published var practiceWord: PracticeWord?

    struct PracticeWord: Equatable {
        let word: String
        let wordId: String?
    }

    func practice(word: String, wordId: String? = nil) {
        practiceWord = PracticeWord(word: word, wordId: wordId)
        selectedTab = .speak
    }
}
