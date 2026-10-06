import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authManager: AuthManager

    var body: some View {
        Group {
            if authManager.isLoading {
                SplashView()
            } else if authManager.isAuthenticated {
                MainTabView()
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
    @State private var selectedTab: Tab = Self.startTab

    enum Tab: String {
        case translate, journal, practice, profile
    }

    private static var startTab: Tab {
        #if DEBUG
        if let name = PreviewMode.initialTab, let tab = Tab(rawValue: name) { return tab }
        #endif
        return .translate
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            TranslateView()
                .tabItem {
                    Label("Dịch", systemImage: "translate")
                }
                .tag(Tab.translate)

            JournalView()
                .tabItem {
                    Label("Journal", systemImage: "note.text")
                }
                .tag(Tab.journal)

            PracticeView()
                .tabItem {
                    Label("Luyện nói", systemImage: "mic.fill")
                }
                .tag(Tab.practice)

            ProfileView()
                .tabItem {
                    Label("Hồ sơ", systemImage: "person.fill")
                }
                .tag(Tab.profile)
        }
        .tint(WordlyColors.electric)
    }
}
