import AppTrackingTransparency
import GoogleMobileAds
import UIKit
import UserMessagingPlatform

/// Kết quả xem quảng cáo thưởng. `earned` = Google báo xem đủ; lượt/theme vẫn
/// chỉ được cộng khi server nhận callback SSV (app không tự cộng).
enum RewardOutcome: Equatable { case earned, dismissed, failed }

/// Lớp mỏng quanh Google Mobile Ads (spec 2026-10-23-in-app-ads-design.md):
/// đồng ý (UMP) → khởi động SDK → tải sẵn một quảng cáo mỗi loại toàn màn,
/// hiện rồi tải lại. Khi nào được hiện do `AdsPolicy` (AdsLogic.swift) quyết.
@MainActor
final class AdsManager: NSObject, ObservableObject {
    static let shared = AdsManager()

    @Published private(set) var isFullscreenShowing = false
    /// UMP cho phép xin quảng cáo (ngoài EU luôn true sau khi cập nhật đồng ý)
    @Published private(set) var canRequestAds = false

    private var started = false
    private var starting = false
    private var appOpen: AppOpenAd?
    private var appOpenLoadedAt: Date?
    private var interstitial: InterstitialAd?
    private var rewarded: RewardedAd?
    private var loading: Set<String> = []
    private var dismissed: CheckedContinuation<Bool, Never>?

    /// Quảng cáo mở app hết hạn sau 4 giờ (Google).
    private static let appOpenTTL: TimeInterval = 4 * 3600

    /// Chỉ chốt "đã khởi động" khi xong hẳn — lỗi mạng / chưa đồng ý thì lần sau thử lại.
    func start() async {
        guard !started, !starting, WordlyConfig.adMobAppId != nil else { return }
        starting = true
        defer { starting = false }
        _ = try? await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
        var showForm = true
        #if DEBUG
        // Chế độ xem trước (chụp màn hình tự động): không có ai bấm form đồng ý
        showForm = !PreviewMode.isOn
        #endif
        if showForm, let vc = Self.topViewController() {
            try? await ConsentForm.loadAndPresentIfRequired(from: vc)
        }
        canRequestAds = ConsentInformation.shared.canRequestAds
        guard canRequestAds else { return }
        _ = await MobileAds.shared.start()
        started = true
        preloadAll()
    }

    /// Hộp thoại "Cho phép theo dõi" của iOS — chỉ hỏi một lần (hệ thống nhớ).
    func requestTrackingIfNeeded() async {
        #if DEBUG
        if PreviewMode.isOn { return }
        #endif
        guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { return }
        _ = await ATTrackingManager.requestTrackingAuthorization()
    }

    // MARK: Hiện quảng cáo

    /// Chờ quảng cáo mở app tải xong (mở lạnh) — tối đa `timeout` giây.
    func waitForAppOpen(timeout: TimeInterval) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while appOpen == nil && Date() < deadline {
            do { try await Task.sleep(nanoseconds: 200_000_000) } catch { return false }
        }
        return appOpen != nil
    }

    /// `willPresent`: gọi ngay trước khi hiện (để ghi sổ kể cả khi người dùng thoát app giữa chừng).
    func showAppOpen(willPresent: () -> Void = {}) async -> Bool {
        if let at = appOpenLoadedAt, Date().timeIntervalSince(at) > Self.appOpenTTL { appOpen = nil }
        guard let ad = appOpen, let vc = presentable() else { preloadAll(); return false }
        appOpen = nil
        ad.fullScreenContentDelegate = self
        willPresent()
        let ok = await present { ad.present(from: vc) }
        loadAppOpen()
        return ok
    }

    func showInterstitial(willPresent: () -> Void = {}) async -> Bool {
        guard let ad = interstitial, let vc = presentable() else { preloadAll(); return false }
        interstitial = nil
        ad.fullScreenContentDelegate = self
        willPresent()
        let ok = await present { ad.present(from: vc) }
        loadInterstitial()
        return ok
    }

    /// `customData`: "translate" | "theme:<id>" — server đọc trong callback SSV.
    func showRewarded(userId: UUID, customData: String) async -> RewardOutcome {
        // Người dùng chủ động xem → khởi động nếu lúc mở app chưa xong (quảng cáo tắt, mạng lỗi…)
        await start()
        if rewarded == nil { await loadRewardedNow() }
        guard let ad = rewarded, let vc = presentable() else { return .failed }
        rewarded = nil
        let options = ServerSideVerificationOptions()
        options.userIdentifier = userId.uuidString.lowercased()
        options.customRewardText = customData
        ad.serverSideVerificationOptions = options
        ad.fullScreenContentDelegate = self
        var earned = false
        let shown = await present { ad.present(from: vc) { earned = true } }
        loadRewarded()
        if !shown { return .failed }
        return earned ? .earned : .dismissed
    }

    /// Đang hiện quảng cáo khác / chưa sẵn sàng → không chồng lên.
    private func presentable() -> UIViewController? {
        guard canRequestAds, !isFullscreenShowing else { return nil }
        return Self.topViewController()
    }

    /// Hiện và chờ người dùng đóng. false = không hiện được.
    private func present(_ show: () -> Void) async -> Bool {
        TTSManager.shared.stop()
        isFullscreenShowing = true
        let ok = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            dismissed = c
            show()
        }
        isFullscreenShowing = false
        return ok
    }

    private func finish(_ ok: Bool) {
        dismissed?.resume(returning: ok)
        dismissed = nil
    }

    // MARK: Tải sẵn

    private func preloadAll() {
        guard canRequestAds else { return }
        if appOpen == nil { loadAppOpen() }
        if interstitial == nil { loadInterstitial() }
        if rewarded == nil { loadRewarded() }
    }

    private func loadAppOpen() {
        guard let unit = WordlyConfig.adUnitAppOpen, begin("open") else { return }
        Task {
            defer { loading.remove("open") }
            if let ad = try? await AppOpenAd.load(with: unit, request: Request()) {
                appOpen = ad
                appOpenLoadedAt = Date()
            }
        }
    }

    private func loadInterstitial() {
        guard let unit = WordlyConfig.adUnitInterstitial, begin("inter") else { return }
        Task {
            defer { loading.remove("inter") }
            interstitial = try? await InterstitialAd.load(with: unit, request: Request())
        }
    }

    private func loadRewarded() {
        Task { await loadRewardedNow() }
    }

    private func loadRewardedNow() async {
        guard canRequestAds, let unit = WordlyConfig.adUnitRewarded, begin("reward") else { return }
        defer { loading.remove("reward") }
        rewarded = try? await RewardedAd.load(with: unit, request: Request())
    }

    private func begin(_ kind: String) -> Bool {
        guard canRequestAds, !loading.contains(kind) else { return false }
        loading.insert(kind)
        return true
    }

    static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive } ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
        var vc = scene?.keyWindow?.rootViewController
        while let next = vc?.presentedViewController { vc = next }
        return vc
    }
}

extension AdsManager: FullScreenContentDelegate {
    nonisolated func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        Task { @MainActor in self.finish(true) }
    }

    nonisolated func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        Task { @MainActor in self.finish(false) }
    }
}
