import XCTest
import UserNotifications
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

    /// Thiết lập lần đầu (chủ dự án chốt 11/11/2026, thay thẻ "Bắt đầu"): tài khoản chưa có từ
    /// → 3 bước bắt buộc; đang làm dở thì mở lại đúng bước; số từ chưa biết (lỗi mạng) thì không bắt đầu.
    func testSetupStartsForAccountsWithoutWordsAndResumes() {
        XCTAssertEqual(Onboarding.setupStep(savedCount: 0, done: false, stored: nil), .saveWord)
        XCTAssertNil(Onboarding.setupStep(savedCount: 4, done: false, stored: nil), "tài khoản đã có từ")
        XCTAssertNil(Onboarding.setupStep(savedCount: 0, done: true, stored: nil), "đã xong")
        XCTAssertNil(Onboarding.setupStep(savedCount: nil, done: false, stored: nil), "chưa biết số từ → không bắt người cũ làm lại")
        XCTAssertEqual(Onboarding.setupStep(savedCount: 1, done: false, stored: Onboarding.SetupStep.widget.rawValue), .widget, "thoát app giữa chừng → mở lại đúng bước")
        XCTAssertEqual(Onboarding.setupStep(savedCount: nil, done: false, stored: Onboarding.SetupStep.reminder.rawValue), .reminder)
        XCTAssertNil(Onboarding.setupStep(savedCount: 1, done: true, stored: Onboarding.SetupStep.widget.rawValue))
    }

    func testSetupStepOrder() {
        XCTAssertEqual(Onboarding.nextSetupStep(after: .saveWord), .reminder)
        XCTAssertEqual(Onboarding.nextSetupStep(after: .reminder), .widget)
        XCTAssertNil(Onboarding.nextSetupStep(after: .widget))
    }

    /// Bước nhắc ôn: chưa hỏi → hộp quyền iOS; đã cho phép → bật luôn; đã từ chối / máy không có
    /// push → đi tiếp (Apple 4.5.4: không được chặn người dùng vì không bật thông báo).
    func testReminderStepAction() {
        XCTAssertEqual(Onboarding.reminderAction(status: .notDetermined, pushAvailable: true), .ask)
        XCTAssertEqual(Onboarding.reminderAction(status: .authorized, pushAvailable: true), .enable)
        XCTAssertEqual(Onboarding.reminderAction(status: .provisional, pushAvailable: true), .enable)
        XCTAssertEqual(Onboarding.reminderAction(status: .denied, pushAvailable: true), .proceed)
        XCTAssertEqual(Onboarding.reminderAction(status: .notDetermined, pushAvailable: false), .proceed)
    }

    /// Bước widget bắt buộc: chỉ qua khi đã có widget Wordly (màn hình chính hoặc khoá).
    func testWidgetStepNeedsAnInstalledWidget() {
        XCTAssertFalse(Onboarding.widgetStepDone(lock: false, home: false))
        XCTAssertTrue(Onboarding.widgetStepDone(lock: true, home: false))
        XCTAssertTrue(Onboarding.widgetStepDone(lock: false, home: true))
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

    /// Cờ theo TỪNG TÀI KHOẢN: tài khoản cũ đã xem không làm tài khoản mới trên cùng máy
    /// mất phần giới thiệu; đổi tài khoản trong cùng lần chạy app thì quyết định lại (lỗi build 19).
    @MainActor func testIntroIsPerAccountAndRedecidedOnAccountSwitch() {
        let d = UserDefaults(suiteName: "onb-\(UUID().uuidString)")!
        let center = OnboardingCenter(defaults: d)
        center.decideIntro(userId: "old", savedCount: 12)
        XCTAssertEqual(center.intro, .whatsNew)
        center.finishIntro()
        center.decideIntro(userId: "old", savedCount: 12)
        XCTAssertEqual(center.intro, .none, "cùng tài khoản: không hiện lại")

        center.decideIntro(userId: "other", savedCount: 3)
        XCTAssertEqual(center.intro, .whatsNew, "tài khoản khác trên cùng máy, cùng lần chạy → tự quyết định lại")
        center.decideIntro(userId: "new", savedCount: 0)
        XCTAssertEqual(center.intro, .setup(.saveWord), "tài khoản mới → thiết lập lần đầu, không 'Có gì mới'")
    }

    @MainActor func testSetupWalksThreeStepsAndResumesPerAccount() {
        let d = UserDefaults(suiteName: "onb-\(UUID().uuidString)")!
        let center = OnboardingCenter(defaults: d)
        center.decideIntro(userId: "new", savedCount: 0)
        center.completeSetupStep(.reminder)
        XCTAssertEqual(center.intro, .setup(.saveWord), "không nhảy bước")
        center.completeSetupStep(.saveWord)
        XCTAssertEqual(center.intro, .setup(.reminder))

        // Thoát app ở bước 2 → lần mở sau (đã có 1 từ) vẫn quay lại bước 2
        let again = OnboardingCenter(defaults: d)
        again.decideIntro(userId: "new", savedCount: 1)
        XCTAssertEqual(again.intro, .setup(.reminder))
        again.completeSetupStep(.reminder)
        XCTAssertEqual(again.intro, .setup(.widget))
        again.completeSetupStep(.widget)
        XCTAssertEqual(again.intro, .none)

        let third = OnboardingCenter(defaults: d)
        third.decideIntro(userId: "new", savedCount: 0)
        XCTAssertEqual(third.intro, .none, "xong rồi thì không hiện lại, kể cả xoá hết từ")
        third.decideIntro(userId: "other", savedCount: 0)
        XCTAssertEqual(third.intro, .setup(.saveWord), "tài khoản khác cùng máy vẫn thiết lập")
    }
}
