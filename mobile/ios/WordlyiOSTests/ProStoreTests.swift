import XCTest
@testable import Wordly

/// StoreKit giả — điều khiển được giao dịch để test quy tắc an toàn tiền (spec Pro §9).
/// (SKTestSession.buyProduct trên simulator ném notEntitled — Apple forum thread 836842,
/// nên mua thật chỉ kiểm bằng sandbox trên máy thật trước khi phát hành.)
private final class FakeGateway: StoreGateway, @unchecked Sendable {
    var available: [PaywallPlan] = [
        PaywallPlan(id: "wordly.pro.monthly", displayName: "Tháng", displayPrice: "29.000 ₫", price: 29_000, period: .month),
        PaywallPlan(id: "wordly.pro.yearly", displayName: "Năm", displayPrice: "249.000 ₫", price: 249_000, period: .year),
    ]
    var entitlements: [StoreEntitlement] = []
    var nextResult: StorePurchaseResult = .cancelled
    var purchaseCalls: [(String, UUID?)] = []
    var finished: [UInt64] = []

    func plans(ids: [String]) async -> [PaywallPlan] {
        ids.compactMap { id in available.first { $0.id == id } }
    }
    func purchase(planId: String, accountToken: UUID?) async throws -> StorePurchaseResult {
        purchaseCalls.append((planId, accountToken))
        if case .purchased(let e) = nextResult { entitlements.append(e) }
        return nextResult
    }
    func currentEntitlements() async -> [StoreEntitlement] { entitlements }
    func finish(transactionId: UInt64) async { finished.append(transactionId) }
}

private func entitlement(_ id: String = "wordly.pro.yearly", tx: UInt64 = 1, expires: TimeInterval? = 86_400 * 365,
                         revoked: Bool = false) -> StoreEntitlement {
    StoreEntitlement(productId: id, transactionId: tx, jws: "jws-\(tx)",
                     expiration: expires.map { Date().addingTimeInterval($0) }, revoked: revoked)
}

private struct ServerDown: Error {}

@MainActor
final class ProStoreTests: XCTestCase {
    private var gateway: FakeGateway!
    private let user = UUID()

    override func setUp() async throws { gateway = FakeGateway() }

    private func store(sync: @escaping (String) async throws -> BillingStatus = { _ in throw ServerDown() }) -> ProStore {
        let u = user
        return ProStore(userId: { u }, gateway: gateway, syncToServer: sync)
    }

    func testLoadsTwoPlansYearlyFirstWithAppleDisplayPrice() async {
        let s = store()
        await s.loadPlans()
        XCTAssertEqual(s.plans.map(\.id), ["wordly.pro.yearly", "wordly.pro.monthly"], "gói năm chọn sẵn, đứng đầu")
        XCTAssertEqual(s.plans.first?.displayPrice, "249.000 ₫", "giá lấy từ StoreKit, không viết cứng")
    }

    /// Đã trả là có Pro ngay — kể cả khi server Wordly lỗi; giao dịch vẫn được finish.
    func testPaidUserIsProEvenWhenServerSyncFails() async {
        let s = store()
        gateway.nextResult = .purchased(entitlement(tx: 7))
        let outcome = await s.purchase(PaywallPlan(id: "wordly.pro.yearly", displayName: "", displayPrice: "", price: 0, period: .year))
        XCTAssertEqual(outcome, .purchased)
        XCTAssertTrue(s.isPro, "server lỗi không được làm mất Pro người dùng vừa trả")
        XCTAssertEqual(gateway.finished, [7])
    }

    /// Giao dịch gắn với đúng tài khoản Wordly (appAccountToken = user id).
    func testPurchaseCarriesAccountToken() async {
        let s = store()
        gateway.nextResult = .cancelled
        _ = await s.purchase(PaywallPlan(id: "wordly.pro.monthly", displayName: "", displayPrice: "", price: 0, period: .month))
        XCTAssertEqual(gateway.purchaseCalls.first?.1, user)
    }

    /// Đang Pro → không bao giờ mở thanh toán lần nữa (tránh trả hai lần).
    func testNeverChargesTwice() async {
        gateway.entitlements = [entitlement()]
        let s = store()
        await s.refreshLocal()
        XCTAssertTrue(s.isPro)
        gateway.nextResult = .purchased(entitlement(tx: 9))
        let outcome = await s.purchase(PaywallPlan(id: "wordly.pro.monthly", displayName: "", displayPrice: "", price: 0, period: .month))
        guard case .failed = outcome else { return XCTFail("\(outcome)") }
        XCTAssertTrue(gateway.purchaseCalls.isEmpty, "không gọi Apple")
    }

    /// Huỷ / chờ duyệt (Ask to Buy) → không Pro, không báo lỗi sai.
    func testCancelledAndPendingDoNotGrantPro() async {
        let s = store()
        let plan = PaywallPlan(id: "wordly.pro.yearly", displayName: "", displayPrice: "", price: 0, period: .year)
        gateway.nextResult = .cancelled
        let cancelled = await s.purchase(plan)
        XCTAssertEqual(cancelled, .cancelled)
        gateway.nextResult = .pending
        let pending = await s.purchase(plan)
        XCTAssertEqual(pending, .pending)
        XCTAssertFalse(s.isPro)
    }

    /// Có giao dịch còn hạn → khôi phục được; hết hạn hoặc đã hoàn tiền → không Pro.
    func testOnlyValidTransactionsGrantPro() async {
        let s = store()
        await s.refreshLocal()
        XCTAssertFalse(s.isPro)

        gateway.entitlements = [entitlement(expires: -60)]
        await s.refreshLocal()
        XCTAssertFalse(s.isPro, "hết hạn")

        gateway.entitlements = [entitlement(revoked: true)]
        await s.refreshLocal()
        XCTAssertFalse(s.isPro, "đã hoàn tiền")

        gateway.entitlements = [entitlement("other.product")]
        await s.refreshLocal()
        XCTAssertFalse(s.isPro, "sản phẩm lạ")

        gateway.entitlements = [entitlement(tx: 3)]
        await s.refreshLocal()
        XCTAssertTrue(s.isPro)
    }

    /// Gói đang gắn tài khoản khác → báo rõ, không cấp Pro cho tài khoản này qua server.
    func testOtherAccountSubscriptionIsExplained() async {
        gateway.entitlements = [entitlement()]
        let s = store(sync: { _ in throw APIError.serverError(#"{"code":"subscription_other_account"}"#) })
        await s.syncCurrentEntitlements()
        XCTAssertNotNil(s.message)
        XCTAssertFalse(s.status.isPro)
    }

    /// Mời nâng cấp nhẹ: chỉ khi server đang chặn, sau ngày đầu kể từ lần lưu đầu, tối đa 2 lần.
    func testSoftPaywallIsCountedPerAccount() async throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "pro-soft-\(UUID())"))
        let s = store(sync: { _ in throw ServerDown() })
        let start = Date()
        await s.noteSaved(now: start, defaults: defaults)
        await s.noteSaved(now: start.addingTimeInterval(3600), defaults: defaults)  // không ghi đè ngày đầu
        s.maybeShowSoftPaywall(now: start.addingTimeInterval(2 * 86_400), defaults: defaults)
        XCTAssertNil(s.paywall, "server chưa bật chặn (status .unlimited) → không mời")
    }

    func testPaywallModeNeverOffersPurchaseToProUser() {
        XCTAssertEqual(PaywallMode.for(isPro: true), .manage)
        XCTAssertEqual(PaywallMode.for(isPro: false), .purchase)
    }

    /// Xoá tài khoản khi còn gói → phải cảnh báo (xoá tài khoản không huỷ gói Apple).
    func testDeleteAccountWarnsWhenSubscribed() throws {
        let s = try JSONDecoder().decode(BillingStatus.self, from: Data(#"""
        {"pro": true, "expires_at": "2027-01-01T00:00:00Z", "source": "app_store", "in_grace": false, "enforced": true,
         "has_active_subscription": true,
         "limits": {"saved_words": {"used": 1, "limit": null}, "advanced_translate": {"used": 0, "limit": null},
                    "dictionary": {"used": 0, "limit": null}, "push_slots": {"limit": 10}}}
        """#.utf8))
        XCTAssertTrue(ProAccess.warnBeforeDelete(status: s, localEntitled: false))
        XCTAssertTrue(ProAccess.warnBeforeDelete(status: .unlimited, localEntitled: true))
        XCTAssertFalse(ProAccess.warnBeforeDelete(status: .unlimited, localEntitled: false))
    }
}
