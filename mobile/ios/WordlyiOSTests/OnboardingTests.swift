import XCTest
@testable import Wordly

// Giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6).
final class OnboardingTests: XCTestCase {
    func testIntroChoice() {
        // Tài khoản mới (chưa lưu từ, chưa thấy màn chào) → màn chào
        XCTAssertEqual(Onboarding.intro(savedCount: 0, welcomeSeen: false, whatsNewSeen: nil), .welcome)
        // Tài khoản cũ / cài lại app với tài khoản có từ → "Có gì mới" một lần
        XCTAssertEqual(Onboarding.intro(savedCount: 5, welcomeSeen: false, whatsNewSeen: nil), .whatsNew)
        XCTAssertEqual(Onboarding.intro(savedCount: 5, welcomeSeen: false, whatsNewSeen: Onboarding.whatsNewVersion), .none)
        // Đã xem màn chào (đánh dấu luôn bản "Có gì mới") → không gì nữa
        XCTAssertEqual(Onboarding.intro(savedCount: 0, welcomeSeen: true, whatsNewSeen: Onboarding.whatsNewVersion), .none)
        // Bản "Có gì mới" cũ hơn → hiện bản mới
        XCTAssertEqual(Onboarding.intro(savedCount: 3, welcomeSeen: true, whatsNewSeen: "1.0.0"), .whatsNew)
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
}
