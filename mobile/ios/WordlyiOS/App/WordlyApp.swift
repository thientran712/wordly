import SwiftUI
import Combine

@main
struct WordlyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var themeManager = ThemeManager.shared
    @StateObject private var router = AppRouter()
    @StateObject private var push = PushManager.shared
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
                // Bấm widget (wordly://word?...) → mở đúng từ trong tab Từ vựng
                .onOpenURL { router.open($0) }
                // Bấm thông báo nhắc ôn → mở đúng từ như bấm widget
                .onReceive(push.$pendingURL.compactMap { $0 }) { url in
                    router.open(url)
                    push.pendingURL = nil
                }
        }
    }
}
