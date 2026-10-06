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
                    Text("🌈")
                        .font(.system(size: 36))
                }
                Text("Wordly")
                    .font(.custom("Fraunces-BlackItalic", size: 40))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [WordlyColors.electric, Color(hex: "#86EFAC")],
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
    @State private var selectedTab: Tab = .translate

    enum Tab: Int {
        case translate, words, journal, practice, profile
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            TranslateView()
                .tabItem {
                    Label("Dịch", systemImage: "translate")
                }
                .tag(Tab.translate)

            WordsView()
                .tabItem {
                    Label("Từ vựng", systemImage: "book.fill")
                }
                .tag(Tab.words)

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
