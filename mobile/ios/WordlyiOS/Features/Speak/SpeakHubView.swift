import SwiftUI

// Tab Luyện nói: trò chuyện với Alex và vòng quay chủ đề. Phiên chat với Alex
// được giữ khi chuyển qua lại (view model nằm ở đây, không nằm trong PracticeView).
struct SpeakHubView: View {
    @EnvironmentObject private var router: AppRouter
    @StateObject private var practice = PracticeViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch router.speakMode {
                case .alex: PracticeView(vm: practice)
                case .spinner: SpeakSpinnerView()
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                HubPicker(options: AppRouter.SpeakMode.allCases, selection: $router.speakMode,
                          title: \.title,
                          icon: { $0 == .alex ? "waveform" : "dice.fill" })
                    .background(WordlyColors.background)
            }
        }
    }
}
