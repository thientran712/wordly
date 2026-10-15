import XCTest
@testable import Wordly

// Giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6).
final class OnboardingTests: XCTestCase {
    /// Onboarding 4 màn gắn với LẦN CÀI APP (chủ dự án chốt 15/10, bắt buộc, không bỏ qua):
    /// cài mới + chưa đăng nhập → onboarding; đang đăng nhập sẵn (cập nhật app) → không.
    func testFlowOnlyOnFreshInstall() {
        XCTAssertEqual(Onboarding.launchFlow(flowSeen: false, authenticated: false), .show)
        XCTAssertEqual(Onboarding.launchFlow(flowSeen: false, authenticated: true), .markSeen, "người dùng cũ cập nhật app")
        XCTAssertEqual(Onboarding.launchFlow(flowSeen: true, authenticated: false), .none)
        XCTAssertEqual(Onboarding.launchFlow(flowSeen: true, authenticated: true), .none)
    }

    /// "Có gì mới" chỉ cho tài khoản đã có từ, một lần mỗi phiên bản; tài khoản mới không có.
    func testWhatsNewOnlyForAccountsWithWords() {
        XCTAssertTrue(Onboarding.showWhatsNew(savedCount: 5, seenVersion: nil))
        XCTAssertFalse(Onboarding.showWhatsNew(savedCount: 5, seenVersion: Onboarding.whatsNewVersion))
        XCTAssertTrue(Onboarding.showWhatsNew(savedCount: 5, seenVersion: "1.0.0"))
        XCTAssertFalse(Onboarding.showWhatsNew(savedCount: 0, seenVersion: nil))
    }

    func testChecklist() {
        let c = Onboarding.checklist(savedCount: 1, hasLockWidget: false, hasHomeWidget: true, pushOn: false)
        XCTAssertEqual(c.doneCount, 2)
        XCTAssertFalse(c.allDone)
        XCTAssertTrue(Onboarding.checklist(savedCount: 2, hasLockWidget: true, hasHomeWidget: true, pushOn: true).allDone)
    }

    func testCardState() {
        XCTAssertEqual(Onboarding.card(dismissed: true, allDone: false, celebrated: false), .hidden)
        XCTAssertEqual(Onboarding.card(dismissed: false, allDone: false, celebrated: false), .show)
        XCTAssertEqual(Onboarding.card(dismissed: false, allDone: true, celebrated: false), .celebrate)
        XCTAssertEqual(Onboarding.card(dismissed: false, allDone: true, celebrated: true), .hidden)
    }

    func testWidgetNudge() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        let now = Date(timeIntervalSince1970: 1_760_500_000)
        let yesterday = now.addingTimeInterval(-86_400)
        func nudge(saved: Int = 3, widget: Bool = false, shown: Bool = false, invite: Date? = yesterday, intro: Bool = false) -> Bool {
            Onboarding.shouldNudgeWidget(savedCount: saved, hasWidget: widget, nudgeShown: shown,
                                         pushInviteDay: invite, now: now, introThisSession: intro, calendar: cal)
        }
        XCTAssertTrue(nudge())
        XCTAssertTrue(nudge(invite: nil))
        XCTAssertFalse(nudge(saved: 2), "chưa đủ 3 từ")
        XCTAssertFalse(nudge(widget: true), "đã có widget")
        XCTAssertFalse(nudge(shown: true), "chỉ một lần")
        XCTAssertFalse(nudge(invite: now), "cùng ngày với lời mời nhắc ôn")
        XCTAssertFalse(nudge(intro: true), "không chồng lên màn chào / Có gì mới")
    }

    /// Cờ theo TỪNG TÀI KHOẢN: tài khoản cũ đã xem/ẩn không làm tài khoản mới trên cùng máy
    /// mất phần giới thiệu; đổi tài khoản trong cùng lần chạy app thì quyết định lại (lỗi build 19).
    @MainActor func testIntroIsPerAccountAndRedecidedOnAccountSwitch() {
        let d = UserDefaults(suiteName: "onb-\(UUID().uuidString)")!
        let center = OnboardingCenter(defaults: d)
        center.decideIntro(userId: "old", savedCount: 12)
        XCTAssertEqual(center.intro, .whatsNew)
        center.finishIntro()
        center.dismissCard()
        center.decideIntro(userId: "old", savedCount: 12)
        XCTAssertEqual(center.intro, .none, "cùng tài khoản: không hiện lại")

        center.decideIntro(userId: "other", savedCount: 3)
        XCTAssertEqual(center.intro, .whatsNew, "tài khoản khác trên cùng máy, cùng lần chạy → tự quyết định lại")
        center.decideIntro(userId: "new", savedCount: 0)
        XCTAssertEqual(center.intro, .none, "tài khoản mới không có 'Có gì mới'")
        XCTAssertFalse(center.isCardDismissed, "ẩn thẻ ở tài khoản cũ không ẩn thẻ của tài khoản mới")
    }
}
