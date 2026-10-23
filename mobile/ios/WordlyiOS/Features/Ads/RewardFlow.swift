import Foundation

/// Hết lượt dịch → xem quảng cáo thưởng → chờ server cộng lượt qua callback
/// SSV của Google (spec 2026-10-23-in-app-ads-design.md). App không tự cộng:
/// chỉ hỏi lại số lượt; quá hạn chờ thì xin lượt dự phòng (≤ 5/ngày, server giữ trần).
enum RewardFlow {
    enum Next: Equatable {
        /// Đã có lượt → dịch lại đúng lần đang chờ
        case retry
        /// Chờ callback SSV — hỏi lại số lượt
        case poll
        /// Quảng cáo lỗi / callback trễ → xin lượt dự phòng
        case fallback
        /// Người dùng đóng quảng cáo trước khi xong — giữ nguyên màn
        case stay
    }

    static let pollTimeout: TimeInterval = 10

    static func afterAd(_ outcome: RewardOutcome) -> Next {
        switch outcome {
        case .earned: .poll
        case .dismissed: .stay
        case .failed: .fallback
        }
    }

    /// Chỉ gọi sau 402 hết lượt: lúc đó lượt thưởng = 0, nên có lượt là đã được cộng
    /// (không so với số cũ trong app — số đó có thể đã cũ từ lần thưởng trước).
    static func afterPoll(creditsNow: Int?, elapsed: TimeInterval, timeout: TimeInterval = pollTimeout) -> Next {
        if let now = creditsNow, now > 0 { return .retry }
        return elapsed < timeout ? .poll : .fallback
    }

    // MARK: Theme đặc biệt — chỉ mở khi server xác nhận, không có lượt dự phòng

    enum ThemeNext: Equatable {
        /// Server đã ghi mở khoá → áp dụng theme
        case apply
        case poll
        /// Đóng quảng cáo trước khi xong
        case stay
        /// Không tải / hiện được quảng cáo
        case adFailed
        /// Chờ hết hạn mà server chưa xác nhận
        case unconfirmed
    }

    static func themeAfterAd(_ outcome: RewardOutcome) -> ThemeNext {
        switch outcome {
        case .earned: .poll
        case .dismissed: .stay
        case .failed: .adFailed
        }
    }

    static func themeAfterPoll(themeId: String, unlocked: Set<String>, elapsed: TimeInterval,
                               timeout: TimeInterval = pollTimeout) -> ThemeNext {
        if unlocked.contains(themeId) { return .apply }
        return elapsed < timeout ? .poll : .unconfirmed
    }

}
