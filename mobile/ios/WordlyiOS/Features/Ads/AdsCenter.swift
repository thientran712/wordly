import Combine
import SwiftUI

/// Điều phối quảng cáo mở app: cấu hình từ /api/app-config, sổ lượt đã hiện
/// trên máy, quyết định ở AdsPolicy.
@MainActor
final class AdsCenter: ObservableObject {
    static let shared = AdsCenter()

    @Published var config: AdsConfig = .off

    private let defaults: UserDefaults
    private var store: AdLedgerStore { AdLedgerStore(defaults: defaults) }
    private var pendingSource: OpenSource?
    private var activation = ActivationTracker()
    private var bag: Set<AnyCancellable> = []

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        // Phiên có sẵn lúc mở app hay vừa đăng nhập — tạo AdsCenter sớm (WordlyApp.init)
        AuthManager.shared.$isLoading
            .filter { !$0 }
            .first()
            .sink { [weak self] _ in self?.activation.noteAuthResolved(authenticated: AuthManager.shared.isAuthenticated) }
            .store(in: &bag)
    }

    func refresh() async {
        #if DEBUG
        if PreviewMode.isOn && !CommandLine.arguments.contains("-WordlyAds") { return }
        #endif
        if let c = try? await APIClient.shared.adsConfig() { config = c }
    }

    /// Widget / thông báo vừa mở app — gọi trước hoặc ngay sau khi app active.
    func noteOpenSource(_ source: OpenSource) { pendingSource = source }

    func noteBackground() { activation.noteBackground(Date()) }

    /// App vừa active: xét quảng cáo mở app (chỉ lần mở lạnh).
    func handleBecameActive() async {
        // onOpenURL của widget/thông báo tới sau scenePhase .active một chút
        try? await Task.sleep(for: .milliseconds(600))
        let source = activation.becameActive(now: Date(), pending: pendingSource)
        pendingSource = nil
        guard let source, source == .launch else { return }
        await refresh()
        guard config.enabled else { return }
        let onboarding = OnboardingCenter.shared
        guard allowed(source) else {
            // Không hiện quảng cáo lần này — vẫn cập nhật đồng ý cho dòng "Tuỳ chọn quyền riêng tư"
            await AdsManager.shared.refreshConsentInfo()
            return
        }
        await AdsManager.shared.start()
        // Quảng cáo vừa bắt đầu tải — chờ tối đa 3 giây, không kịp thì thôi (không bắt người dùng chờ)
        guard await AdsManager.shared.waitForAppOpen(timeout: 3),
              // "Có gì mới" quyết định sau khi tải dữ liệu — chờ rồi xét lại, không chồng sheet
              await onboarding.waitIntroDecided(timeout: 3),
              UIApplication.shared.applicationState == .active,
              allowed(source) else { return }
        // Ghi sổ NGAY KHI sắp hiện (không đợi đóng): người dùng thoát app giữa quảng cáo vẫn tính lượt
        _ = await AdsManager.shared.showAppOpen {
            var ledger = self.store.load(now: Date())
            ledger.noteAppOpen(now: Date())
            self.store.save(ledger)
        }
    }

    private func allowed(_ source: OpenSource) -> Bool {
        AdsPolicy.shouldShowAppOpen(config: config, ledger: store.load(now: Date()), source: source,
                                    inOnboarding: OnboardingCenter.shared.intro != .none, now: Date())
    }
}
