import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isLoading {
                SplashView()
            } else if authManager.isAuthenticated {
                TermsGate {
                    #if DEBUG
                    if let screen = PreviewMode.screen {
                        NavigationStack { PreviewScreens.view(for: screen) }
                    } else {
                        MainTabView()
                    }
                    #else
                    MainTabView()
                    #endif
                }
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
    @ObservedObject private var onboarding = OnboardingCenter.shared

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
        // Đăng nhập (kể cả người khác trên cùng máy) → token chuyển sang người này
        .task { await PushManager.shared.syncIfNeeded(force: true) }
        // Mỗi lần mở app → cập nhật từ cho widget màn hình khoá + làm mới token push (≤ 1 lần/ngày)
        .task(id: scenePhase) {
            if scenePhase == .active {
                await WidgetSync.refreshIfStale()
                // Sau khi đồng bộ mới biết tài khoản mới hay cũ (spec 2026-10-15 §6)
                onboarding.decideIntro()
                await onboarding.refreshChecklist()
                await PushManager.shared.syncIfNeeded()
            }
        }
        .fullScreenCover(isPresented: Binding(get: { onboarding.intro == .welcome },
                                              set: { if !$0 { onboarding.finishIntro() } })) {
            WelcomeView { onboarding.finishIntro() }
        }
        .sheet(isPresented: Binding(get: { onboarding.intro == .whatsNew },
                                    set: { if !$0 { onboarding.finishIntro() } })) {
            WhatsNewView { onboarding.finishIntro() }
        }
    }
}
