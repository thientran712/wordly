import GoogleMobileAds
import UIKit
import UserMessagingPlatform

/// Lớp mỏng quanh Google Mobile Ads: đồng ý (UMP) → khởi động SDK → tải sẵn
/// một quảng cáo mở app, hiện rồi tải lại. Khi nào được hiện do `AdsPolicy` quyết.
/// Hộp thoại ATT do UMP hiện (sau thông báo giải thích IDFA cấu hình trên AdMob) —
/// app không tự gọi, để màn giải thích luôn đi trước.
@MainActor
final class AdsManager: NSObject, ObservableObject {
    static let shared = AdsManager()

    @Published private(set) var isShowing = false
    /// UMP cho phép xin quảng cáo (ngoài EU luôn true sau khi cập nhật đồng ý)
    @Published private(set) var canRequestAds = false
    /// UMP báo người dùng này phải đổi được lựa chọn đồng ý (EU/Anh, tiểu bang Mỹ)
    @Published private(set) var privacyOptionsRequired = false

    private var started = false
    private var starting = false
    private var loading = false
    private var appOpen: AppOpenAd?
    private var appOpenLoadedAt: Date?
    private var dismissed: CheckedContinuation<Bool, Never>?

    /// Quảng cáo mở app hết hạn sau 4 giờ (Google).
    private static let appOpenTTL: TimeInterval = 4 * 3600

    /// Chỉ chốt "đã khởi động" khi xong hẳn — lỗi mạng / chưa đồng ý thì lần sau thử lại.
    func start() async {
        guard !started, !starting, WordlyConfig.adMobAppId != nil else { return }
        starting = true
        defer { starting = false }
        await refreshConsentInfo()
        var showForm = true
        #if DEBUG
        // Chế độ xem trước (chụp màn hình tự động): không có ai bấm form đồng ý —
        // trừ khi thử quảng cáo bằng tay (`-WordlyAds`)
        showForm = !PreviewMode.isOn || CommandLine.arguments.contains("-WordlyAds")
        #endif
        if showForm, let vc = Self.topViewController() {
            try? await ConsentForm.loadAndPresentIfRequired(from: vc)
        }
        canRequestAds = ConsentInformation.shared.canRequestAds
        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
        guard canRequestAds else { return }
        _ = await MobileAds.shared.start()
        started = true
        loadAppOpen()
    }

    /// Cập nhật trạng thái đồng ý (không hiện form) — gọi mỗi lần mở app để biết
    /// có cần dòng "Tuỳ chọn quyền riêng tư" không, kể cả hôm đã hết lượt quảng cáo.
    func refreshConsentInfo() async {
        _ = try? await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
        privacyOptionsRequired = ConsentInformation.shared.privacyOptionsRequirementStatus == .required
    }

    /// Mở lại form của Google để người dùng đổi lựa chọn đồng ý.
    func presentPrivacyOptions() async {
        guard let vc = Self.topViewController() else { return }
        try? await ConsentForm.presentPrivacyOptionsForm(from: vc)
        canRequestAds = ConsentInformation.shared.canRequestAds
    }

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
        guard canRequestAds, !isShowing, let ad = appOpen, let vc = Self.topViewController() else {
            loadAppOpen()
            return false
        }
        appOpen = nil
        ad.fullScreenContentDelegate = self
        willPresent()
        TTSManager.shared.stop()
        isShowing = true
        let ok = await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            dismissed = c
            ad.present(from: vc)
        }
        isShowing = false
        loadAppOpen()
        return ok
    }

    private func finish(_ ok: Bool) {
        dismissed?.resume(returning: ok)
        dismissed = nil
    }

    private func loadAppOpen() {
        guard canRequestAds, appOpen == nil, !loading, let unit = WordlyConfig.adUnitAppOpen else { return }
        loading = true
        Task {
            defer { loading = false }
            if let ad = try? await AppOpenAd.load(with: unit, request: Request()) {
                appOpen = ad
                appOpenLoadedAt = Date()
            }
        }
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
