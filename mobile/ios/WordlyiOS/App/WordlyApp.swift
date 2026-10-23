import SwiftUI
import Combine
import TipKit

@main
struct WordlyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var themeManager = ThemeManager.shared
    @StateObject private var router = AppRouter()
    @StateObject private var push = PushManager.shared
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"

    init() {
        #if DEBUG
        if PreviewMode.isOn {
            if CommandLine.arguments.contains("-WordlyOnboarding") {
                // Như máy mới cài: xoá cờ "đã xem" của phần giới thiệu
                for k in UserDefaults.standard.dictionaryRepresentation().keys where k.hasPrefix("onboarding.") {
                    UserDefaults.standard.removeObject(forKey: k)
                }
            } else {
                Tips.hideAllTipsForTesting()   // gợi ý không che nút trong UI test khác
            }
        }
        #endif
        // Gợi ý tính năng (TipKit) — tối đa 1 gợi ý mỗi ngày (spec 2026-10-15 §6.5)
        try? Tips.configure([.displayFrequency(.daily)])
    }

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
                .onOpenURL {
                    // Mở từ widget → không chen quảng cáo mở app
                    AdsCenter.shared.noteOpenSource(.widget)
                    router.open($0)
                }
                // Bấm thông báo nhắc ôn → mở đúng từ như bấm widget
                .onReceive(push.$pendingURL.compactMap { $0 }) { url in
                    AdsCenter.shared.noteOpenSource(.push)
                    router.open(url)
                    push.pendingURL = nil
                }
        }
    }
}
