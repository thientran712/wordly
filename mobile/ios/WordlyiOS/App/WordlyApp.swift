import SwiftUI

@main
struct WordlyApp: App {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var themeManager = ThemeManager.shared
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authManager)
                .environmentObject(themeManager)
                .preferredColorScheme(themeManager.colorScheme)
                .onAppear {
                    themeManager.apply(savedTheme)
                }
        }
    }
}
