import SwiftUI

/// Điều hướng giữa các tab — dùng cho lối tắt kiểu "Hỏi Alex về từ này" (từ
/// màn Dịch, Từ vựng theo chủ đề) giống web /practice?word=… .
@MainActor
final class AppRouter: ObservableObject {
    /// Tạm ẩn tính năng Luyện nói với Alex (quyết định 11/10/2026) — đổi lại
    /// `true` để mở lại, không xoá code. Ẩn mọi nút "Hỏi Alex"/"Học từ này
    /// với Alex" ở các màn xem chi tiết từ vựng, và ẩn luôn chế độ Alex
    /// trong tab Luyện nói (chỉ còn Vòng quay chủ đề).
    static let alexPracticeEnabled = false

    /// Tab đầu tiên là Dịch — mở app là dịch ngay, không qua trang tổng quan.
    enum Tab: String, Hashable {
        case translate, vocab, review, speak, profile
    }

    /// Hai chế độ trong tab Luyện nói
    enum SpeakMode: String, Hashable, CaseIterable {
        case alex, spinner
        var title: String { self == .alex ? "Luyện với Alex" : "Vòng quay chủ đề" }
    }

    @Published var selectedTab: Tab = AppRouter.startTab

    /// Hai chế độ trong tab Từ vựng (đặt ở router để link từ widget chọn được)
    enum VocabMode: Hashable, CaseIterable { case saved, topics }
    @Published var vocabMode: VocabMode = .saved
    /// Từ vừa bấm trên widget — màn Đã lưu / Từ mới mở popup rồi xoá.
    @Published var widgetWord: WidgetDeepLink?

    /// `wordly://word?...` từ widget → tab Từ vựng, đúng chế độ, mở popup từ đó.
    func open(_ url: URL) {
        guard let link = WidgetDeepLink(url: url) else { return }
        vocabMode = link.fromBank ? .topics : .saved
        selectedTab = .vocab
        widgetWord = link
    }
    @Published var speakMode: SpeakMode = alexPracticeEnabled ? .alex : .spinner

    private static var startTab: Tab {
        #if DEBUG
        if let name = PreviewMode.initialTab, let tab = Tab(rawValue: name) { return tab }
        #endif
        return .translate
    }
    /// Từ cần luyện với Alex — tab Luyện nói đọc rồi xoá.
    @Published var practiceWord: PracticeWord?

    struct PracticeWord: Equatable {
        let word: String
        let wordId: String?
    }

    func practice(word: String, wordId: String? = nil) {
        practiceWord = PracticeWord(word: word, wordId: wordId)
        speakMode = .alex
        selectedTab = .speak
    }
}
