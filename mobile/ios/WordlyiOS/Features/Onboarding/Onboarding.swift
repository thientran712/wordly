import Foundation

/// Luật giới thiệu tính năng (spec 2026-10-15-shared-word-source-design.md §6).
/// Cờ lưu trên máy (UserDefaults chuẩn), không gửi server.
enum Onboarding {
    /// Phiên bản có nội dung "Có gì mới" — đổi khi có đợt tính năng mới cần giới thiệu.
    static let whatsNewVersion = "1.0.1"

    enum Intro: Equatable { case welcome, whatsNew, none }

    /// Tài khoản mới (chưa lưu từ, chưa thấy màn chào) → màn chào; còn lại → "Có gì mới"
    /// một lần mỗi phiên bản có nội dung. Xem màn chào thì đánh dấu luôn "Có gì mới".
    static func intro(savedCount: Int, welcomeSeen: Bool, whatsNewSeen: String?) -> Intro {
        if !welcomeSeen && savedCount == 0 { return .welcome }
        return whatsNewSeen == whatsNewVersion ? .none : .whatsNew
    }

    struct Checklist: Equatable {
        let savedWord: Bool
        let lockWidget: Bool
        let homeWidget: Bool
        let push: Bool
        var doneCount: Int { [savedWord, lockWidget, homeWidget, push].filter { $0 }.count }
        var allDone: Bool { doneCount == 4 }
    }

    static func checklist(savedCount: Int, hasLockWidget: Bool, hasHomeWidget: Bool, pushOn: Bool) -> Checklist {
        Checklist(savedWord: savedCount > 0, lockWidget: hasLockWidget, homeWidget: hasHomeWidget, push: pushOn)
    }

    enum CardState: Equatable { case hidden, show, celebrate }

    /// ✕ ẩn vĩnh viễn; xong hết → chúc mừng một lần rồi ẩn.
    static func card(dismissed: Bool, allDone: Bool, celebrated: Bool) -> CardState {
        if dismissed { return .hidden }
        if allDone { return celebrated ? .hidden : .celebrate }
        return .show
    }

    /// Gợi ý thêm widget: lưu từ thứ 3 trở đi, chưa có widget, chưa gợi ý lần nào,
    /// khác ngày với lời mời nhắc ôn, không trong lần mở có màn chào / "Có gì mới".
    static func shouldNudgeWidget(savedCount: Int, hasWidget: Bool, nudgeShown: Bool, pushInviteDay: Date?,
                                  now: Date, introThisSession: Bool, calendar: Calendar = .current) -> Bool {
        guard savedCount >= 3, !hasWidget, !nudgeShown, !introThisSession else { return false }
        if let pushInviteDay, calendar.isDate(pushInviteDay, inSameDayAs: now) { return false }
        return true
    }

    // MARK: Cờ trên máy
    enum Key {
        static let welcomeSeen = "onboarding.welcomeSeen"
        static let whatsNewSeen = "onboarding.whatsNewSeen"
        static let cardDismissed = "onboarding.cardDismissed"
        static let cardCelebrated = "onboarding.cardCelebrated"
        static let widgetNudgeShown = "onboarding.widgetNudgeShown"
        static let pushInviteDay = "onboarding.pushInviteDay"
    }
}
