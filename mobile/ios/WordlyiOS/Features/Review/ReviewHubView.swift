import SwiftUI

// Tab Ôn tập: quiz từ đã lưu và sổ tay câu hay.
struct ReviewHubView: View {
    enum Mode: Hashable, CaseIterable { case quiz, journal }
    @State private var mode: Mode = .quiz
    @State private var inSession = false

    var body: some View {
        NavigationStack {
            Group {
                switch mode {
                case .quiz: QuizView()
                case .journal: JournalView()
                }
            }
            .onPreferenceChange(ReviewSessionActiveKey.self) { inSession = $0 }
            .safeAreaInset(edge: .top, spacing: 0) {
                if !inSession {
                    HubPicker(options: Mode.allCases, selection: $mode,
                              title: { $0 == .quiz ? "Quiz từ vựng" : "Sổ tay câu hay" },
                              icon: { $0 == .quiz ? "bolt.fill" : "book.closed.fill" })
                        .background(WordlyColors.background)
                }
            }
        }
    }
}
