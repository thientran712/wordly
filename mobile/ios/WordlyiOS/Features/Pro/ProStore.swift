import Foundation
import StoreKit
import UIKit

/// Một gói trong paywall (từ StoreKit — giá luôn do Apple trả về, không viết cứng).
struct PaywallPlan: Identifiable, Equatable {
    enum Period: Equatable { case month, year }
    let id: String
    let displayName: String
    let displayPrice: String
    let price: Decimal
    let period: Period
}

enum PaywallMode: Equatable {
    case purchase   // chưa Pro: hiện gói + nút mua
    case manage     // đang Pro: không có nút mua (tránh trả hai lần) — chỉ quản lý gói

    static func `for`(isPro: Bool) -> PaywallMode { isPro ? .manage : .purchase }
}

/// Một giao dịch còn hiệu lực (đã được Apple xác thực).
struct StoreEntitlement: Equatable {
    let productId: String
    let transactionId: UInt64
    let jws: String
    let expiration: Date?
    let revoked: Bool
}

enum StorePurchaseResult: Equatable {
    case purchased(StoreEntitlement)
    case cancelled
    case pending
    case unverified
}

/// Lớp trung gian giữa ProStore và StoreKit — test quy tắc an toàn tiền bằng bản giả
/// (StoreKitTest trên simulator đang lỗi notEntitled — diễn đàn Apple thread 836842).
protocol StoreGateway {
    func plans(ids: [String]) async -> [PaywallPlan]
    func purchase(planId: String, accountToken: UUID?) async throws -> StorePurchaseResult
    func currentEntitlements() async -> [StoreEntitlement]
    func finish(transactionId: UInt64) async
}

/// StoreKit 2 thật.
struct AppStoreGateway: StoreGateway {
    func plans(ids: [String]) async -> [PaywallPlan] {
        guard let loaded = try? await Product.products(for: ids) else { return [] }
        let byId = Dictionary(loaded.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return ids.compactMap { id in
            guard let p = byId[id] else { return nil }
            let period: PaywallPlan.Period = p.subscription?.subscriptionPeriod.unit == .month ? .month : .year
            return PaywallPlan(id: p.id, displayName: p.displayName, displayPrice: p.displayPrice, price: p.price, period: period)
        }
    }

    func purchase(planId: String, accountToken: UUID?) async throws -> StorePurchaseResult {
        guard let product = try await Product.products(for: [planId]).first else { return .cancelled }
        var options: Set<Product.PurchaseOption> = []
        if let accountToken { options.insert(.appAccountToken(accountToken)) }
        switch try await product.purchase(options: options) {
        case .success(let result):
            guard case .verified(let t) = result else { return .unverified }
            return .purchased(StoreEntitlement(productId: t.productID, transactionId: t.id, jws: result.jwsRepresentation,
                                               expiration: t.expirationDate, revoked: t.revocationDate != nil))
        case .userCancelled: return .cancelled
        case .pending: return .pending
        @unknown default: return .cancelled
        }
    }

    func currentEntitlements() async -> [StoreEntitlement] {
        var out: [StoreEntitlement] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let t) = result else { continue }
            out.append(StoreEntitlement(productId: t.productID, transactionId: t.id, jws: result.jwsRepresentation,
                                        expiration: t.expirationDate, revoked: t.revocationDate != nil))
        }
        return out
    }

    func finish(transactionId: UInt64) async {
        for await result in Transaction.unfinished {
            if case .verified(let t) = result, t.id == transactionId { await t.finish() }
        }
    }
}

enum ProAccess {
    /// Giao dịch còn cho Pro: đúng sản phẩm, chưa thu hồi (hoàn tiền), chưa hết hạn.
    static func grantsPro(_ e: StoreEntitlement, now: Date) -> Bool {
        ProStore.productIds.contains(e.productId) && !e.revoked && (e.expiration.map { $0 > now } ?? true)
    }

    /// Xoá tài khoản KHÔNG huỷ gói trên App Store → cảnh báo nếu còn gói (spec Pro §9.4).
    static func warnBeforeDelete(status: BillingStatus, localEntitled: Bool) -> Bool {
        localEntitled || status.hasActiveSubscription
    }
}

/// Thanh toán StoreKit 2 + trạng thái Pro (spec 2026-10-16-pro-paywall-design.md §4, §9).
/// Pro = server xác nhận HOẶC giao dịch StoreKit đã xác thực trên máy — đã trả thì có
/// Pro ngay, kể cả khi server Wordly lỗi; đồng bộ server thử lại khi mở app.
@MainActor
final class ProStore: ObservableObject {
    static let shared = ProStore(userId: { AuthManager.shared.currentUser?.id })
    static let productIds = ["wordly.pro.yearly", "wordly.pro.monthly"]

    enum Outcome: Equatable { case purchased, cancelled, pending, failed(String) }

    @Published private(set) var status: BillingStatus = .unlimited
    @Published private(set) var plans: [PaywallPlan] = []
    @Published private(set) var localEntitled = false
    @Published var message: String?
    /// Paywall đang mở (một chỗ trình bày cho cả app — MainTabView gắn sheet)
    @Published var paywall: PaywallReason?

    /// Mở paywall khi người dùng chạm vào tính năng Pro / chạm giới hạn.
    func present(_ reason: PaywallReason) { paywall = reason }

    // MARK: Mời nâng cấp nhẹ (spec §4) — theo từng tài khoản

    private func key(_ name: String) -> String { "pro.\(name).\(userId()?.uuidString ?? "anon")" }

    /// Gọi sau mỗi lần lưu từ: ghi ngày lưu đầu tiên + cập nhật bộ đếm.
    func noteSaved(now: Date = Date(), defaults: UserDefaults = .standard) async {
        if defaults.object(forKey: key("firstSave")) == nil { defaults.set(now, forKey: key("firstSave")) }
        await refreshStatus()
    }

    /// Gọi khi mở app (không chen ngang lúc đang lưu / dịch).
    func maybeShowSoftPaywall(now: Date = Date(), defaults: UserDefaults = .standard) {
        let shown = defaults.integer(forKey: key("softShown"))
        guard paywall == nil,
              SoftPaywall.shouldShow(isPro: isPro, enforced: status.enforced,
                                     firstSave: defaults.object(forKey: key("firstSave")) as? Date,
                                     now: now, shownCount: shown) else { return }
        defaults.set(shown + 1, forKey: key("softShown"))
        paywall = .general
    }

    /// Lỗi 402 từ server → mở paywall đúng ngữ cảnh. Trả true nếu đã xử lý.
    @discardableResult
    func handle(_ error: Error) -> Bool {
        guard case APIError.limitReached(let code, _, let limit) = error else { return false }
        // Hết lượt dịch → màn xem quảng cáo (TranslateViewModel), không phải paywall
        guard code != .translate else { return false }
        paywall = .limit(code, limit)
        Task { await refreshStatus() }
        return true
    }

    private let userId: () -> UUID?
    private let gateway: StoreGateway
    private let syncToServer: (String) async throws -> BillingStatus
    private var updatesTask: Task<Void, Never>?

    init(userId: @escaping () -> UUID?, gateway: StoreGateway = AppStoreGateway(),
         syncToServer: @escaping (String) async throws -> BillingStatus = { try await APIClient.shared.syncTransaction($0) }) {
        self.userId = userId
        self.gateway = gateway
        self.syncToServer = syncToServer
    }

    var isPro: Bool { status.isPro || localEntitled }
    /// Hiện bộ đếm / khoá chỉ khi server đang chặn và người dùng chưa Pro.
    var showsLimits: Bool { status.enforced && !isPro }
    var mode: PaywallMode { .for(isPro: isPro) }

    /// Gọi một lần khi app chạy: nghe giao dịch mới (gia hạn, mua trên máy khác, Ask to Buy duyệt).
    func start() {
        guard updatesTask == nil else { return }
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if case .verified(let t) = result {
                    await self.sync(jws: result.jwsRepresentation)
                    await t.finish()
                }
                await self.refreshLocal()
                await self.refreshStatus()
            }
        }
    }

    func refreshAll() async {
        await loadPlans()
        await refreshLocal()
        await syncCurrentEntitlements()
        await refreshStatus()
    }

    func loadPlans() async {
        #if DEBUG
        if PreviewMode.isOn {
            plans = [PaywallPlan(id: "wordly.pro.yearly", displayName: "Wordly Pro năm", displayPrice: "249.000 ₫", price: 249_000, period: .year),
                     PaywallPlan(id: "wordly.pro.monthly", displayName: "Wordly Pro tháng", displayPrice: "29.000 ₫", price: 29_000, period: .month)]
            return
        }
        #endif
        plans = await gateway.plans(ids: Self.productIds)
    }

    /// Giao dịch đã xác thực trên máy (Transaction.currentEntitlements): còn hạn, chưa bị thu hồi.
    func refreshLocal() async {
        #if DEBUG
        if PreviewMode.isOn {
            localEntitled = CommandLine.arguments.contains("-WordlyProPlan") || localEntitled
            return
        }
        #endif
        let valid = await gateway.currentEntitlements().filter { ProAccess.grantsPro($0, now: Date()) }
        localEntitled = !valid.isEmpty
    }

    func refreshStatus() async {
        #if DEBUG
        if PreviewMode.isOn {
            // Ảnh chụp màn hình: bản miễn phí đang bị chặn (-WordlyBillingOff = chưa bật chặn)
            let pro = CommandLine.arguments.contains("-WordlyProPlan")
            let on = !CommandLine.arguments.contains("-WordlyBillingOff")
            typealias C = BillingStatus.Counter
            status = BillingStatus(pro: pro, expiresAt: pro ? "2027-10-16T00:00:00Z" : nil, source: pro ? "app_store" : nil,
                                   inGrace: false, enforced: on,
                                   limits: .init(savedWords: C(used: 24, limit: pro ? nil : 30),
                                                 advancedTranslate: C(used: 2, limit: pro ? nil : 5),
                                                 dictionary: C(used: 3, limit: pro ? nil : 5),
                                                 pushSlots: .init(limit: pro ? 10 : 1)),
                                   hasActiveSubscription: pro)
            return
        }
        #endif
        if let s = try? await APIClient.shared.billingStatus() { status = s }
    }

    /// Gửi mọi giao dịch còn hiệu lực lên server (thử lại mỗi lần mở app).
    func syncCurrentEntitlements() async {
        #if DEBUG
        if PreviewMode.isOn { return }
        #endif
        for e in await gateway.currentEntitlements() where Self.productIds.contains(e.productId) {
            await sync(jws: e.jws)
        }
    }

    private func sync(jws: String) async {
        do {
            status = try await syncToServer(jws)
        } catch APIError.serverError(let raw) where raw.contains("subscription_other_account") {
            message = "Gói Pro này đang gắn với một tài khoản Wordly khác. Hãy đăng nhập đúng tài khoản đã mua."
        } catch {
            // Server lỗi → giữ Pro theo giao dịch trên máy, lần mở app sau đồng bộ lại
        }
    }

    /// Người dùng tự bấm mua → bảng thanh toán của Apple (không có thanh toán tự động nào).
    func purchase(_ plan: PaywallPlan) async -> Outcome {
        #if DEBUG
        if PreviewMode.isOn {
            localEntitled = true
            return .purchased
        }
        #endif
        guard !isPro else { return .failed("Bạn đang dùng Wordly Pro.") }   // không bao giờ cho mua trùng
        do {
            // Gắn giao dịch với đúng tài khoản Wordly (server kiểm, spec §9.5)
            switch try await gateway.purchase(planId: plan.id, accountToken: userId()) {
            case .purchased(let e):
                localEntitled = ProAccess.grantsPro(e, now: Date())   // đã trả → Pro ngay
                await sync(jws: e.jws)                                // server lỗi cũng không mất Pro
                await gateway.finish(transactionId: e.transactionId)
                return .purchased
            case .cancelled: return .cancelled
            case .pending: return .pending   // Ask to Buy / xác thực ngân hàng — chưa trừ tiền
            case .unverified: return .failed("Apple chưa xác thực được giao dịch.")
            }
        } catch {
            return .failed("Không mua được, thử lại sau.")
        }
    }

    /// Khôi phục giao dịch (bắt buộc có — App Store 3.1.1).
    func restore() async {
        #if DEBUG
        if PreviewMode.isOn { message = "Không tìm thấy gói nào để khôi phục."; return }
        #endif
        try? await AppStore.sync()
        await refreshLocal()
        await syncCurrentEntitlements()
        await refreshStatus()
        if message == nil { message = isPro ? "Đã khôi phục Wordly Pro." : "Không tìm thấy gói nào để khôi phục." }
    }

    /// Trang quản lý gói của Apple (huỷ / đổi gói).
    func manageSubscriptions() async {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return }
        try? await AppStore.showManageSubscriptions(in: scene)
    }
}
