import SwiftUI

@main
struct WordlyApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var themeManager = ThemeManager.shared
    @StateObject private var router = AppRouter()
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(themeManager)
                .environmentObject(router)
                .preferredColorScheme(themeManager.colorScheme)
                // Vuốt cuộn ở mọi màn kéo bàn phím xuống
                .scrollDismissesKeyboard(.interactively)
                .onAppear {
                    themeManager.apply(savedTheme)
                    KeyboardDismiss.install()
                }
        }
    }
}
