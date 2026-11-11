import XCTest
@testable import Wordly

/// Quảng cáo mở app (chủ dự án chốt 11/11/2026): chỉ khi mở app lạnh, tối đa
/// `app_open_per_day` lần/ngày, ai cũng thấy (kể cả Pro).
final class AdsLogicTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-11-11T05:00:00Z")!
    private let cfg = AdsConfig(enabled: true, appOpenPerDay: 1)

    private func ledger(_ shown: Int = 0, day: String? = nil) -> AdLedger {
        AdLedger(day: day ?? AdLedger.vnDayKey(now), appOpenShown: shown)
    }

    private func show(_ l: AdLedger, _ source: OpenSource = .launch, config: AdsConfig? = nil, onboarding: Bool = false) -> Bool {
        AdsPolicy.shouldShowAppOpen(config: config ?? cfg, ledger: l, source: source, inOnboarding: onboarding, now: now)
    }

    func testConfigDecodesFromAppConfig() throws {
        struct Body: Decodable { let ads: AdsConfig? }
        let on = #"{"min_build":22,"ads":{"enabled":true,"app_open_per_day":2}}"#
        XCTAssertEqual(try JSONDecoder().decode(Body.self, from: Data(on.utf8)).ads, AdsConfig(enabled: true, appOpenPerDay: 2))
        let missing = #"{"ads":{}}"#
        XCTAssertEqual(try JSONDecoder().decode(Body.self, from: Data(missing.utf8)).ads, AdsConfig(enabled: false, appOpenPerDay: 1))
        let old = #"{"min_build":22}"#
        XCTAssertNil(try JSONDecoder().decode(Body.self, from: Data(old.utf8)).ads, "server cũ không có khối ads → app dùng .off")
        XCTAssertFalse(AdsConfig.off.enabled)
    }

    func testOncePerDayOnColdLaunch() {
        XCTAssertTrue(show(ledger(0)))
        XCTAssertFalse(show(ledger(1)), "đã hiện hôm nay")
        XCTAssertTrue(show(ledger(1, day: "2026-11-10")), "ngày mới đếm lại")
        XCTAssertTrue(show(ledger(1), config: AdsConfig(enabled: true, appOpenPerDay: 2)), "server nới trần")
        XCTAssertFalse(show(ledger(0), config: AdsConfig(enabled: true, appOpenPerDay: 0)))
    }

    func testOnlyColdLaunch() {
        XCTAssertFalse(show(ledger(), .foreground(awaySeconds: 3600)), "quay lại từ nền không tính")
        XCTAssertFalse(show(ledger(), .widget))
        XCTAssertFalse(show(ledger(), .push))
    }

    func testOffOrOnboarding() {
        XCTAssertFalse(show(ledger(), config: .off))
        XCTAssertFalse(show(ledger(), onboarding: true))
    }

    func testVietnamDayBoundary() {
        // 16:59Z = 23:59 giờ VN; 17:00Z = 00:00 ngày hôm sau ở VN
        let late = ISO8601DateFormatter().date(from: "2026-11-11T16:59:00Z")!
        let next = ISO8601DateFormatter().date(from: "2026-11-11T17:00:00Z")!
        XCTAssertEqual(AdLedger.vnDayKey(late), "2026-11-11")
        XCTAssertEqual(AdLedger.vnDayKey(next), "2026-11-12")
    }

    func testLedgerStoreRollsAndPersists() {
        let defaults = UserDefaults(suiteName: "ads-test-\(UUID().uuidString)")!
        let store = AdLedgerStore(defaults: defaults)
        var l = store.load(now: now)
        XCTAssertEqual(l.appOpenShown, 0)
        l.noteAppOpen(now: now)
        store.save(l)
        XCTAssertEqual(store.load(now: now).appOpenShown, 1)
        XCTAssertEqual(store.load(now: now.addingTimeInterval(86_400)).appOpenShown, 0, "sang ngày mới")
    }

    /// GDPR / luật tiểu bang Mỹ: người dùng phải đổi được lựa chọn đồng ý trong app —
    /// chỉ hiện khi Google (UMP) báo người dùng này cần, và quảng cáo đang bật.
    func testPrivacyOptionsRowOnlyWhenRequired() {
        XCTAssertTrue(AdsPolicy.showsPrivacyOptions(adsEnabled: true, required: true))
        XCTAssertFalse(AdsPolicy.showsPrivacyOptions(adsEnabled: true, required: false), "người dùng VN")
        XCTAssertFalse(AdsPolicy.showsPrivacyOptions(adsEnabled: false, required: true), "quảng cáo tắt")
    }

    func testActivationTracker() {
        // Đăng nhập sẵn lúc mở app → lần active đầu là mở lạnh
        var t = ActivationTracker()
        t.noteAuthResolved(authenticated: true)
        XCTAssertEqual(t.becameActive(now: now, pending: nil), .launch)
        XCTAssertNil(t.becameActive(now: now, pending: nil), "chớp inactive không phải lần mở")
        t.noteBackground(now)
        XCTAssertEqual(t.becameActive(now: now.addingTimeInterval(60), pending: nil), .foreground(awaySeconds: 60))

        // Mở từ widget
        var w = ActivationTracker()
        w.noteAuthResolved(authenticated: true)
        XCTAssertEqual(w.becameActive(now: now, pending: .widget), .widget)

        // Chưa đăng nhập lúc mở → vừa đăng nhập xong không chen quảng cáo
        var g = ActivationTracker()
        g.noteAuthResolved(authenticated: false)
        g.noteAuthResolved(authenticated: true)
        XCTAssertNil(g.becameActive(now: now, pending: nil))
    }
}
