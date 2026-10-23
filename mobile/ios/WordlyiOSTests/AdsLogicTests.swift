import XCTest
@testable import Wordly

/// Quảng cáo — logic quyết định (spec 2026-10-23-in-app-ads-design.md).
final class AdsLogicTests: XCTestCase {
    private let now = ISO8601DateFormatter().date(from: "2026-10-23T05:00:00Z")!
    private var cfg: AdsConfig {
        AdsConfig(enabled: true, appOpenPerDay: 2, interstitialMinGapSec: 180, interstitialPerDay: 6,
                  banner: true, graceHours: 0, premiumThemeIds: ["space_1", "luxury_2"])
    }
    private func ledger(open: Int = 0, inter: Int = 0, last: Date? = nil, day: String? = nil) -> AdLedger {
        AdLedger(day: day ?? AdLedger.vnDayKey(now), appOpenShown: open, interstitialShown: inter, lastFullscreenAt: last)
    }
    private func appOpen(_ l: AdLedger, _ source: OpenSource = .launch, config: AdsConfig? = nil, adFree: Bool = false,
                         onboarding: Bool = false, recording: Bool = false, firstOpenAt: Date? = nil) -> Bool {
        AdsPolicy.shouldShowAppOpen(config: config ?? cfg, ledger: l, source: source, adFree: adFree,
                                    inOnboarding: onboarding, isRecording: recording, firstOpenAt: firstOpenAt, now: now)
    }

    func testConfigDecodesFromAppConfig() throws {
        let json = #"{"min_build":22,"ads":{"enabled":true,"app_open_per_day":2,"interstitial_min_gap_sec":180,"interstitial_per_day":6,"banner":true,"grace_hours":0,"premium_theme_ids":["space_1","luxury_2"]}}"#
        struct Body: Decodable { let ads: AdsConfig }
        XCTAssertEqual(try JSONDecoder().decode(Body.self, from: Data(json.utf8)).ads, cfg)
        XCTAssertFalse(AdsConfig.off.enabled)
    }

    func testAppOpenTwicePerDay() {
        XCTAssertTrue(appOpen(ledger(open: 0)))
        XCTAssertTrue(appOpen(ledger(open: 1)))
        XCTAssertFalse(appOpen(ledger(open: 2)))
        XCTAssertTrue(appOpen(ledger(open: 2, day: "2026-10-22")), "ngày mới đếm lại")
    }

    func testAppOpenForegroundOnlyAfter30Seconds() {
        XCTAssertFalse(appOpen(ledger(), .foreground(awaySeconds: 20)))
        XCTAssertTrue(appOpen(ledger(), .foreground(awaySeconds: 30)))
    }

    func testAppOpenNeverFromWidgetPushOrBlockedStates() {
        XCTAssertFalse(appOpen(ledger(), .widget))
        XCTAssertFalse(appOpen(ledger(), .push))
        XCTAssertFalse(appOpen(ledger(), adFree: true))
        XCTAssertFalse(appOpen(ledger(), config: .off))
        XCTAssertFalse(appOpen(ledger(), onboarding: true))
        XCTAssertFalse(appOpen(ledger(), recording: true))
    }

    func testGracePeriodForNewInstalls() {
        var c = cfg
        c.graceHours = 48
        XCTAssertFalse(appOpen(ledger(), config: c, firstOpenAt: now.addingTimeInterval(-10 * 3600)))
        XCTAssertTrue(appOpen(ledger(), config: c, firstOpenAt: now.addingTimeInterval(-49 * 3600)))
        XCTAssertFalse(AdsPolicy.showsBanner(config: c, adFree: false, firstOpenAt: now.addingTimeInterval(-3600), now: now))
    }

    func testInterstitialGapAndDailyCap() {
        let inter = { (l: AdLedger) in AdsPolicy.shouldShowInterstitial(config: self.cfg, ledger: l, adFree: false, firstOpenAt: nil, now: self.now) }
        XCTAssertTrue(inter(ledger()))
        XCTAssertFalse(inter(ledger(last: now.addingTimeInterval(-120))))
        XCTAssertTrue(inter(ledger(last: now.addingTimeInterval(-200))))
        XCTAssertFalse(inter(ledger(inter: 6)))
        XCTAssertTrue(inter(ledger(inter: 6, day: "2026-10-22")))
        XCTAssertFalse(AdsPolicy.shouldShowInterstitial(config: cfg, ledger: ledger(), adFree: true, firstOpenAt: nil, now: now))
    }

    func testBanner() {
        XCTAssertTrue(AdsPolicy.showsBanner(config: cfg, adFree: false, firstOpenAt: nil, now: now))
        XCTAssertFalse(AdsPolicy.showsBanner(config: cfg, adFree: true, firstOpenAt: nil, now: now))
        var c = cfg
        c.banner = false
        XCTAssertFalse(AdsPolicy.showsBanner(config: c, adFree: false, firstOpenAt: nil, now: now))
    }

    func testLedgerRecordsAndRollsOverByVietnamDay() {
        XCTAssertEqual(AdLedger.vnDayKey(ISO8601DateFormatter().date(from: "2026-10-23T17:30:00Z")!), "2026-10-24")
        var l = ledger(open: 2, inter: 5, day: "2026-10-22")
        l.noteAppOpen(now: now)
        XCTAssertEqual(l, AdLedger(day: "2026-10-23", appOpenShown: 1, interstitialShown: 0, lastFullscreenAt: now))
        l.noteInterstitial(now: now)
        XCTAssertEqual(l.interstitialShown, 1)
    }

    func testThemeLock() {
        let lock = { (id: String, unlocked: Set<String>, adFree: Bool, current: Bool, config: AdsConfig) in
            ThemeLock.isLocked(themeId: id, config: config, unlocked: unlocked, adFree: adFree, isCurrent: current)
        }
        XCTAssertTrue(lock("space_1", [], false, false, cfg))
        XCTAssertFalse(lock("space_1", ["space_1"], false, false, cfg))
        XCTAssertFalse(lock("space_1", [], false, true, cfg), "theme đang dùng không bị khoá")
        XCTAssertFalse(lock("space_1", [], true, false, cfg))
        XCTAssertFalse(lock("space_1", [], false, false, .off))
        XCTAssertFalse(lock("ocean", [], false, false, cfg))
    }

    func testRewardData() {
        XCTAssertEqual(RewardData.translate, "translate")
        XCTAssertEqual(RewardData.theme("nature_1"), "theme:nature_1")
    }

    func testTrackingPromptFromSecondOpenAfterOnboarding() {
        XCTAssertFalse(AdsPolicy.shouldAskTracking(onboardingDone: false, launchCount: 5))
        XCTAssertFalse(AdsPolicy.shouldAskTracking(onboardingDone: true, launchCount: 1))
        XCTAssertTrue(AdsPolicy.shouldAskTracking(onboardingDone: true, launchCount: 2))
    }
}
