import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager
    @ObservedObject private var onboarding = OnboardingCenter.shared
    @ObservedObject private var updateGate = AppUpdateGate.shared
    @State private var loginStartsWithSignup = false

    var body: some View {
        Group {
            if updateGate.required {
                ForceUpdateView()
            } else if authManager.isLoading {
                SplashView()
            } else if authManager.isAuthenticated {
                TermsGate {
                    #if DEBUG
                    if let screen = PreviewMode.screen {
                        NavigationStack { PreviewScreens.view(for: screen) }
                            .task { await ProStore.shared.refreshStatus() }
                    } else {
                        MainTabView()
                    }
                    #else
                    MainTabView()
                    #endif
                }
            } else if !onboarding.flowSeen {
                // Cài mới: onboarding 4 màn bắt buộc trước màn đăng nhập
                OnboardingFlowView { choice in
                    loginStartsWithSignup = choice == .signup
                    onboarding.markFlowSeen()
                }
            } else {
                LoginView(startWithSignup: loginStartsWithSignup)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: authManager.isAuthenticated)
        .animation(.easeInOut(duration: 0.3), value: authManager.isLoading)
        .task { await updateGate.check() }
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
    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var onboarding = OnboardingCenter.shared
    @ObservedObject private var pro = ProStore.shared

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
        // Nghe giao dịch Apple (gia hạn, Ask to Buy duyệt) + đồng bộ quyền Pro
        .task {
            pro.start()
            await pro.refreshAll()
        }
        // Mỗi lần mở app → cập nhật từ cho widget màn hình khoá + làm mới token push (≤ 1 lần/ngày)
        .task(id: scenePhase) {
            if scenePhase == .active {
                // Đang đăng nhập sẵn (cập nhật từ bản cũ) → không bắt xem onboarding 4 màn
                if Onboarding.launchFlow(flowSeen: onboarding.flowSeen, authenticated: true) == .markSeen {
                    onboarding.markFlowSeen()
                }
                // Quyết định "Có gì mới" + thẻ Bắt đầu TRƯỚC đồng bộ widget (đồng bộ có thể chậm),
                // theo tài khoản đang đăng nhập (đổi tài khoản trong cùng lần chạy cũng đúng)
                let uid = authManager.currentUser?.id.uuidString ?? "preview"
                let saved = (try? await APIClient.shared.fetchSavedHistory().filter { $0.isSaved == true }.count)
                    ?? AppGroupStorage.shared.words.filter(\.isSaved).count
                onboarding.decideIntro(userId: uid, savedCount: saved)
                await onboarding.refreshChecklist()
                await WidgetSync.refreshIfStale()
                await onboarding.refreshChecklist()
                await PushManager.shared.syncIfNeeded()
                await AppUpdateGate.shared.check()
                await pro.refreshStatus()
                if onboarding.intro != .whatsNew { pro.maybeShowSoftPaywall() }
            }
        }
        // Quảng cáo mở app (spec 2026-10-23): theo chuyển trạng thái, không theo task bị huỷ giữa chừng
        .task { if scenePhase == .active { await AdsCenter.shared.handleBecameActive() } }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: Task { await AdsCenter.shared.handleBecameActive() }
            case .background: AdsCenter.shared.noteBackground()
            default: break
            }
        }
        .sheet(isPresented: Binding(get: { onboarding.intro == .whatsNew },
                                    set: { if !$0 { onboarding.finishIntro() } })) {
            WhatsNewView { onboarding.finishIntro() }
        }
        .sheet(item: $pro.paywall) { reason in PaywallView(reason: reason) }
    }
}
