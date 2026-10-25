import XCTest
@testable import Wordly

// Wordly Pro (spec docs/superpowers/specs/2026-10-16-pro-paywall-design.md).
final class ProTests: XCTestCase {
    // MARK: Lỗi giới hạn / bắt buộc cập nhật (§8)

    func testParsesLimitAndUpdateErrors() {
        let limit = APIError.from(status: 402, body: Data(#"{"error":"Bản miễn phí lưu tối đa 30 từ.","code":"limit_saved_words","limit":30}"#.utf8))
        guard case .limitReached(let code, let message, let n) = limit else { return XCTFail("\(limit)") }
        XCTAssertEqual(code, .savedWords)
        XCTAssertEqual(message, "Bản miễn phí lưu tối đa 30 từ.")
        XCTAssertEqual(n, 30)
        XCTAssertEqual(limit.errorDescription, "Bản miễn phí lưu tối đa 30 từ.", "chỗ cũ hiện câu lỗi vẫn ra câu của server")

        let update = APIError.from(status: 426, body: Data(#"{"error":"Phiên bản Wordly này đã cũ.","code":"update_required"}"#.utf8))
        guard case .updateRequired = update else { return XCTFail("\(update)") }

        guard case .serverError = APIError.from(status: 500, body: Data("oops".utf8)) else { return XCTFail() }
        guard case .serverError = APIError.from(status: 402, body: Data("không phải json".utf8)) else { return XCTFail() }
    }

    // MARK: Trạng thái gói

    func testDecodesBillingStatus() throws {
        let free = try JSONDecoder().decode(BillingStatus.self, from: Data(#"""
        {"pro": false, "expires_at": null, "source": null, "in_grace": false, "enforced": true,
         "limits": {"saved_words": {"used": 24, "limit": 30}, "advanced_translate": {"used": 2, "limit": 5},
                    "dictionary": {"used": 5, "limit": 5}, "push_slots": {"limit": 1}}}
        """#.utf8))
        XCTAssertFalse(free.isPro)
        XCTAssertEqual(free.limits.savedWords.remaining, 6)
        XCTAssertEqual(free.limits.advancedTranslate.remaining, 3)
        XCTAssertEqual(free.limits.dictionary.remaining, 0)
        XCTAssertEqual(free.limits.pushSlots.limit, 1)

        let off = try JSONDecoder().decode(BillingStatus.self, from: Data(#"""
        {"pro": false, "expires_at": null, "source": null, "in_grace": false, "enforced": false,
         "limits": {"saved_words": {"used": 80, "limit": null}, "advanced_translate": {"used": 0, "limit": null},
                    "dictionary": {"used": 0, "limit": null}, "push_slots": {"limit": 10}}}
        """#.utf8))
        XCTAssertNil(off.limits.savedWords.remaining, "không giới hạn")
        XCTAssertFalse(off.showsLimits, "chưa bật chặn → không hiện bộ đếm / khoá")
        XCTAssertTrue(free.showsLimits)
        XCTAssertFalse(BillingStatus.unlimited.showsLimits, "chưa tải được trạng thái → không khoá gì")
    }

    // MARK: Bắt buộc cập nhật

    func testForceUpdateRule() {
        XCTAssertTrue(ForceUpdate.required(build: 21, minBuild: 22))
        XCTAssertFalse(ForceUpdate.required(build: 22, minBuild: 22))
        XCTAssertFalse(ForceUpdate.required(build: 21, minBuild: 0))
    }

    // MARK: Theme

    func testFreeThemesAndGrandfathering() {
        let free = WidgetTheme.all.filter { ThemeAccess.isFree($0) }.map(\.id)
        XCTAssertEqual(Set(free), ["wordly", "midnight", "ink", "paper", "ocean"])
        let galaxy = WidgetTheme.all.first { $0.id == "space-milkyway" }!
        XCTAssertFalse(ThemeAccess.canApply(galaxy, isPro: false, current: WidgetSettings.HomeStyle()))
        XCTAssertTrue(ThemeAccess.canApply(galaxy, isPro: true, current: WidgetSettings.HomeStyle()))
        // Đang dùng sẵn theme Pro (build 19/20, hoặc hết Pro) → giữ, chạm lại không bị chặn
        var using = WidgetSettings.HomeStyle()
        using.apply(galaxy)
        XCTAssertTrue(ThemeAccess.canApply(galaxy, isPro: false, current: using))
        XCTAssertTrue(ThemeAccess.canApply(WidgetTheme.all.first { $0.id == "wordly" }!, isPro: false, current: using))
    }

    // MARK: Giá

    func testYearlyPerMonthIsSmallerHint() {
        XCTAssertEqual(PaywallPricing.perMonth(yearly: 249_000), 20_750)
        XCTAssertEqual(PaywallPricing.savingPercent(monthly: 29_000, yearly: 249_000), 28)
    }

    // MARK: Bộ đếm luôn thấy (§2)

    func testCounterLabels() {
        let c = BillingStatus.Counter.self
        XCTAssertEqual(ProCopy.advanced(c.init(used: 2, limit: 5)), "Còn 3/5 lượt dịch câu, ảnh, giọng nói hôm nay")
        XCTAssertEqual(ProCopy.saved(c.init(used: 24, limit: 30)), "Đã lưu 24/30 từ")
        XCTAssertEqual(ProCopy.dictionary(c.init(used: 3, limit: 5)), "Còn 2 lượt tra từ mới hôm nay")
        XCTAssertNil(ProCopy.advanced(c.init(used: 2, limit: nil)), "không giới hạn → không hiện")
    }

    // MARK: Paywall đúng ngữ cảnh — nói rõ đang chặn gì

    func testPaywallReasonHeadlines() {
        XCTAssertEqual(PaywallReason.limit(.savedWords, 30).headline, "Bạn đã lưu đủ 30 từ")
        XCTAssertEqual(PaywallReason.limit(.advancedTranslate, 5).headline, "Hết 5 lượt dịch nâng cao hôm nay")
        XCTAssertEqual(PaywallReason.limit(.dictionary, 5).headline, "Hết 5 lượt tra từ mới hôm nay")
        XCTAssertEqual(PaywallReason.limit(.pushSlots, 1).headline, "Thêm khung giờ nhắc ôn với Pro")
        XCTAssertEqual(PaywallReason.theme.headline, "Mở khoá toàn bộ theme")
        XCTAssertTrue(PaywallReason.limit(.savedWords, 30).offersUnsaveHint, "đủ 30 từ → gợi ý bỏ lưu bớt, không xoá gì")
        XCTAssertFalse(PaywallReason.theme.offersUnsaveHint)
    }

    // MARK: Khung giờ nhắc ôn (miễn phí 1, Pro tối đa 10)

    func testReminderSlotLocks() {
        XCTAssertFalse(ReminderAccess.isLocked(index: 0, limit: 1))
        XCTAssertTrue(ReminderAccess.isLocked(index: 1, limit: 1), "hết Pro còn nhiều khung → khung sau 🔒, giữ dữ liệu")
        XCTAssertTrue(ReminderAccess.canAdd(count: 0, limit: 1))
        XCTAssertFalse(ReminderAccess.canAdd(count: 1, limit: 1))
        XCTAssertFalse(ReminderAccess.canAdd(count: 10, limit: 10))
    }

    // MARK: Cờ gửi server để tính lượt đúng (§3)

    func testRequestFlags() throws {
        func json<T: Encodable>(_ v: T) throws -> String { String(data: try JSONEncoder().encode(v), encoding: .utf8)! }
        XCTAssertFalse(try json(TranslateRequest(text: "hi", source: "EN", target: "VI")).contains("input"),
                       "gõ tay → không gửi cờ, server tự phân biệt câu / từ")
        XCTAssertTrue(try json(TranslateRequest(text: "hi", source: "EN", target: "VI", input: "voice")).contains(#""input":"voice""#))
        XCTAssertTrue(try json(TranslateRequest(text: "hi there you all", source: "EN", target: "VI", quotaKey: "k1"))
            .contains(#""quota_key":"k1""#), "một lần nhập (gõ dần / nói dần) chỉ tính 1 lượt")
        XCTAssertFalse(try json(DictionaryRequest(word: "run")).contains("purpose"))
        XCTAssertTrue(try json(DictionaryRequest(word: "run", purpose: "widget")).contains(#""purpose":"widget""#),
                      "tra ngầm cho widget không tính lượt")
    }

    func testExpiryDateDisplay() {
        XCTAssertEqual(ProDates.display("2027-01-01T05:00:00Z"), "01/01/2027")
        XCTAssertEqual(ProDates.display("2027-01-01T20:00:00.123Z"), "02/01/2027", "giờ Việt Nam")
        XCTAssertNil(ProDates.display(nil))
    }

    @MainActor
    func testLimitErrorOpensMatchingPaywall() {
        let store = ProStore(userId: { nil })
        XCTAssertTrue(store.handle(APIError.limitReached(.dictionary, "x", 5)))
        XCTAssertEqual(store.paywall, .limit(.dictionary, 5))
        XCTAssertFalse(store.handle(APIError.serverError("HTTP 500")), "lỗi khác không mở paywall")
    }

    // MARK: Lịch mời nâng cấp (một lần sau ngày đầu dùng, nhắc lại ngày 7)

    func testSoftPaywallSchedule() {
        let first = Date(timeIntervalSince1970: 1_760_000_000)
        func show(_ days: Double, shown: Int, pro: Bool = false, enforced: Bool = true) -> Bool {
            SoftPaywall.shouldShow(isPro: pro, enforced: enforced, firstSave: first,
                                   now: first.addingTimeInterval(days * 86_400), shownCount: shown)
        }
        XCTAssertFalse(show(0.5, shown: 0), "chưa qua ngày đầu")
        XCTAssertTrue(show(1.2, shown: 0))
        XCTAssertFalse(show(3, shown: 1))
        XCTAssertTrue(show(7.1, shown: 1))
        XCTAssertFalse(show(30, shown: 2), "tối đa 2 lần")
        XCTAssertFalse(show(2, shown: 0, pro: true))
        XCTAssertFalse(show(2, shown: 0, enforced: false))
        XCTAssertFalse(SoftPaywall.shouldShow(isPro: false, enforced: true, firstSave: nil, now: first, shownCount: 0))
    }
}
