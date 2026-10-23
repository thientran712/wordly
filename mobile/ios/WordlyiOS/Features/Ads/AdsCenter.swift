import Combine
import SwiftUI

/// Điều phối quảng cáo trong app (spec 2026-10-23-in-app-ads-design.md):
/// cấu hình từ /api/app-config, không quảng cáo/theme đã mở từ
/// /api/billing/status, sổ lượt đã hiện theo tài khoản. Quyết định ở AdsPolicy.
@MainActor
final class AdsCenter: ObservableObject {
    static let shared = AdsCenter()

    @Published var config: AdsConfig = .off
    @Published var adFree = false
    @Published var unlockedThemeIds: Set<String> = []
    @Published private(set) var translate: AdsStatus.Translate?
    /// Đang ghi âm dịch — không chen quảng cáo mở app
    var isRecording = false

    private let defaults: UserDefaults
    private var store: AdLedgerStore { AdLedgerStore(defaults: defaults) }
    private var pendingSource: OpenSource?
    private var backgroundAt: Date?
    private var bag: Set<AnyCancellable> = []

    private enum Key {
        static let firstOpenAt = "ads.firstOpenAt"
        static let launchCount = "ads.launchCount"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if defaults.object(forKey: Key.firstOpenAt) == nil { defaults.set(Date(), forKey: Key.firstOpenAt) }
        ProStore.shared.$status
            .sink { [weak self] status in self?.apply(status) }
            .store(in: &bag)
    }

    private var userId: String { AuthManager.shared.currentUser?.id.uuidString.lowercased() ?? "guest" }
    private var firstOpenAt: Date? { defaults.object(forKey: Key.firstOpenAt) as? Date }

    var showsBanner: Bool {
        AdsPolicy.showsBanner(config: config, adFree: adFree, firstOpenAt: firstOpenAt, now: Date())
    }

    func apply(_ status: BillingStatus) {
        adFree = AdsStatus.adFree(status)
        unlockedThemeIds = AdsStatus.unlocked(status)
        translate = status.ads?.translate
    }

    func refresh() async {
        #if DEBUG
        if PreviewMode.isOn && !CommandLine.arguments.contains("-WordlyAds") { return }
        #endif
        if let c = try? await APIClient.shared.adsConfig() { config = c }
    }

    /// Widget / thông báo vừa mở app — gọi trước hoặc ngay sau khi app active.
    func noteOpenSource(_ source: OpenSource) { pendingSource = source }

    func noteBackground() { backgroundAt = Date() }

    /// App vừa active: lần đầu khởi động SDK, hỏi ATT khi tới lượt, rồi xét quảng cáo mở app.
    func handleBecameActive(onboardingDone: Bool, inOnboarding: Bool) async {
        let isLaunch = backgroundAt == nil
        if isLaunch { defaults.set(defaults.integer(forKey: Key.launchCount) + 1, forKey: Key.launchCount) }
        await refresh()
        guard config.enabled, !adFree else { backgroundAt = nil; return }
        if AdsPolicy.shouldAskTracking(onboardingDone: onboardingDone, launchCount: defaults.integer(forKey: Key.launchCount)) {
            await AdsManager.shared.requestTrackingIfNeeded()
        }
        await AdsManager.shared.start()
        // onOpenURL của widget/thông báo tới sau scenePhase .active một chút
        try? await Task.sleep(nanoseconds: 600_000_000)
        let source = OpenSourceTracker.resolve(pending: pendingSource, backgroundAt: backgroundAt, now: Date())
        pendingSource = nil
        backgroundAt = nil
        var ledger = store.load(userId: userId, now: Date())
        guard AdsPolicy.shouldShowAppOpen(config: config, ledger: ledger, source: source, adFree: adFree,
                                          inOnboarding: inOnboarding, isRecording: isRecording,
                                          firstOpenAt: firstOpenAt, now: Date()) else { return }
        // Mở lạnh: quảng cáo vừa bắt đầu tải — chờ tối đa 3 giây, không kịp thì thôi
        guard await AdsManager.shared.waitForAppOpen(timeout: source == .launch ? 3 : 0) else { return }
        // Ghi sổ NGAY KHI sắp hiện (không đợi đóng): người dùng thoát app giữa quảng cáo vẫn tính lượt
        _ = await AdsManager.shared.showAppOpen {
            ledger.noteAppOpen(now: Date())
            self.store.save(ledger, userId: self.userId)
        }
    }

    /// Điểm chuyển màn tự nhiên (xong quiz, đóng thẻ từ) — hiện nếu đủ khoảng cách.
    func maybeInterstitial() async {
        var ledger = store.load(userId: userId, now: Date())
        guard AdsPolicy.shouldShowInterstitial(config: config, ledger: ledger, adFree: adFree,
                                               firstOpenAt: firstOpenAt, now: Date()) else { return }
        _ = await AdsManager.shared.showInterstitial {
            ledger.noteInterstitial(now: Date())
            self.store.save(ledger, userId: self.userId)
        }
    }
}
