import Foundation
import UserNotifications

/// Luật giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6).
/// Cờ lưu trên máy (UserDefaults chuẩn), không gửi server.
enum Onboarding {
    /// Phiên bản có nội dung "Có gì mới" — đổi khi có đợt tính năng mới cần giới thiệu.
    static let whatsNewVersion = "1.0.1"

    enum Intro: Equatable { case whatsNew, setup(SetupStep), none }

    enum LaunchFlow: Equatable { case show, markSeen, none }

    /// Onboarding 4 màn gắn với LẦN CÀI APP (chủ dự án chốt 15/10: bắt buộc, không bỏ qua).
    /// Cài mới + chưa đăng nhập → hiện; đang đăng nhập sẵn (cập nhật từ bản cũ) → đánh dấu
    /// đã xem, không bắt người dùng cũ xem lại.
    static func launchFlow(flowSeen: Bool, authenticated: Bool) -> LaunchFlow {
        if flowSeen { return .none }
        return authenticated ? .markSeen : .show
    }

    /// "Có gì mới": tài khoản đã có từ, một lần mỗi phiên bản (theo tài khoản).
    static func showWhatsNew(savedCount: Int, seenVersion: String?) -> Bool {
        savedCount > 0 && seenVersion != whatsNewVersion
    }

    // MARK: Thiết lập lần đầu (chủ dự án chốt 11/11/2026, thay thẻ "Bắt đầu với Wordly")
    // Tài khoản chưa có từ: lưu từ đầu tiên → nhắc ôn → thêm widget, bắt buộc theo thứ tự
    // rồi mới vào màn chính (thông báo + widget là tính năng lõi).

    enum SetupStep: Int, Equatable, CaseIterable { case saveWord = 0, reminder, widget }

    /// Bước cần hiện khi vào app; nil = không thiết lập. `savedCount` nil = chưa biết (lỗi mạng)
    /// → chỉ mở lại bước đang làm dở, không bắt đầu mới (tránh bắt người dùng cũ làm lại).
    static func setupStep(savedCount: Int?, done: Bool, stored: Int?) -> SetupStep? {
        if done { return nil }
        if let stored, let step = SetupStep(rawValue: stored) { return step }
        return savedCount == 0 ? .saveWord : nil
    }

    static func nextSetupStep(after step: SetupStep) -> SetupStep? {
        SetupStep(rawValue: step.rawValue + 1)
    }

    enum ReminderAction: Equatable { case ask, enable, proceed }

    /// Nút ở bước nhắc ôn. Đã từ chối quyền / máy không có push → vẫn đi tiếp
    /// (App Store 4.5.4: không được bắt bật thông báo mới cho dùng app).
    static func reminderAction(status: UNAuthorizationStatus, pushAvailable: Bool) -> ReminderAction {
        guard pushAvailable else { return .proceed }
        switch status {
        case .notDetermined: return .ask
        case .authorized, .provisional, .ephemeral: return .enable
        default: return .proceed
        }
    }

    /// Bước widget chỉ qua khi đã có widget Wordly (màn hình chính hoặc màn hình khoá).
    static func widgetStepDone(lock: Bool, home: Bool) -> Bool { lock || home }

    /// Gợi ý thêm widget: lưu từ thứ 3 trở đi, chưa có widget, chưa gợi ý lần nào,
    /// khác ngày với lời mời nhắc ôn, không trong lần mở có màn chào / "Có gì mới".
    static func shouldNudgeWidget(savedCount: Int, hasWidget: Bool, nudgeShown: Bool, pushInviteDay: Date?,
                                  now: Date, introThisSession: Bool, calendar: Calendar = .current) -> Bool {
        guard savedCount >= 3, !hasWidget, !nudgeShown, !introThisSession else { return false }
        if let pushInviteDay, calendar.isDate(pushInviteDay, inSameDayAs: now) { return false }
        return true
    }

    // MARK: Cờ
    enum Key {
        /// Theo MÁY (lần cài): đã xem onboarding 4 màn
        static let flowSeen = "onboarding.flowSeen"
        // Theo TÀI KHOẢN — dùng qua OnboardingCenter.key(_:) (thêm ".<userId>")
        static let whatsNewSeen = "onboarding.whatsNewSeen"
        static let setupStep = "onboarding.setupStep"
        static let setupDone = "onboarding.setupDone"
        static let widgetNudgeShown = "onboarding.widgetNudgeShown"
        static let pushInviteDay = "onboarding.pushInviteDay"
    }
}
