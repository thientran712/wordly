import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isLoading {
                SplashView()
            } else if authManager.isAuthenticated {
                #if DEBUG
                if let screen = PreviewMode.screen {
                    NavigationStack { PreviewScreens.view(for: screen) }
                } else {
                    MainTabView()
                }
                #else
                MainTabView()
                #endif
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: authManager.isLoading)
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Color(WordlyColors.background).ignoresSafeArea()
            VStack(spacing: 16) {
                // Logo đặt thẳng, không khung gradient → nền xanh liền một màu
                WordlyLogo(size: 88)
                    .shadow(color: WordlyColors.logoGreen.opacity(0.35), radius: 16, y: 6)
                Text("Wordly")
                    .font(WordlyFonts.display(40))
                    .foregroundStyle(WordlyColors.electric)
                ProgressView()
                    .tint(WordlyColors.electric)
                    .padding(.top, 8)
            }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var router: AppRouter
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView(selection: $router.selectedTab) {
            TranslateView()
                .tabItem { Label("Dịch", systemImage: "character.bubble.fill") }
                .tag(AppRouter.Tab.translate)

            VocabularyHubView()
                .tabItem { Label("Từ vựng", systemImage: "books.vertical.fill") }
                .tag(AppRouter.Tab.vocab)

            ReviewHubView()
                .tabItem { Label("Ôn tập", systemImage: "bolt.fill") }
                .tag(AppRouter.Tab.review)

            SpeakHubView()
                .tabItem { Label("Luyện nói", systemImage: "mic.fill") }
                .tag(AppRouter.Tab.speak)

            ProfileView()
                .tabItem { Label("Cá nhân", systemImage: "person.crop.circle.fill") }
                .tag(AppRouter.Tab.profile)
        }
        .tint(WordlyColors.electric)
        // Mỗi lần mở app → cập nhật từ cho widget màn hình khoá
        .task(id: scenePhase) {
            if scenePhase == .active { await WidgetSync.refresh() }
        }
    }
}
