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
                ZStack {
                    RoundedRectangle(cornerRadius: 20)
                        .fill(
                            LinearGradient(
                                colors: [WordlyColors.electric, WordlyColors.electricDark],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 72, height: 72)
                        .shadow(color: WordlyColors.electric.opacity(0.4), radius: 16, y: 6)
                    WordlyLogo(size: 57.6)
                }
                Text("Wordly")
                    .font(WordlyFonts.display(40))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [WordlyColors.electric, WordlyColors.electric],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
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
            HomeView()
                .tabItem { Label("Trang chủ", systemImage: "house.fill") }
                .tag(AppRouter.Tab.home)

            TranslateView()
                .tabItem { Label("Dịch", systemImage: "character.book.closed.fill") }
                .tag(AppRouter.Tab.translate)

            PracticeView()
                .tabItem { Label("Luyện nói", systemImage: "mic.fill") }
                .tag(AppRouter.Tab.speak)

            ProfileView()
                .tabItem { Label("Hồ sơ", systemImage: "person.crop.circle.fill") }
                .tag(AppRouter.Tab.profile)
        }
        .tint(WordlyColors.electric)
        // Mỗi lần mở app → cập nhật từ cho widget màn hình khoá
        .task(id: scenePhase) {
            if scenePhase == .active { await WidgetSync.refresh() }
        }
    }
}
