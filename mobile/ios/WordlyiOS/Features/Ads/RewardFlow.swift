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

    static func afterPoll(creditsBefore: Int, creditsNow: Int?, elapsed: TimeInterval, timeout: TimeInterval = pollTimeout) -> Next {
        if let now = creditsNow, now > creditsBefore { return .retry }
        return elapsed < timeout ? .poll : .fallback
    }
}
