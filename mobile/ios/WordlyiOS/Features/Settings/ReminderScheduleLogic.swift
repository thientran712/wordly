import Foundation

/// Logic thuần lịch thông báo nhắc ôn (mốc :00/:30 — spec 2026-10-13 mục 9).
enum ReminderScheduleLogic {
    struct Day: Identifiable, Hashable {
        let value: Int      // web custom_days: 0 = CN … 6 = T7
        let label: String
        var id: Int { value }
    }

    /// Hiển thị từ Thứ 2 → Chủ nhật như lịch Việt Nam.
    static let days: [Day] = [
        .init(value: 1, label: "T2"), .init(value: 2, label: "T3"), .init(value: 3, label: "T4"),
        .init(value: 4, label: "T5"), .init(value: 5, label: "T6"), .init(value: 6, label: "T7"),
        .init(value: 0, label: "CN"),
    ]

    static let maxSlots = 10

    static func canAddSlot(count: Int) -> Bool { count < maxSlots }
    static func canDeleteSlot(count: Int) -> Bool { count > 1 }

    static let halfHourError = "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)"

    /// 48 mốc 00:00 … 23:30 — chỉ được chọn các giờ này (khớp server).
    static let halfHourTimes: [String] = (0..<48).map { String(format: "%02d:%02d", $0 / 2, ($0 % 2) * 30) }

    /// "08:30" / "08:30:00" → phút trong ngày; sai → nil.
    static func minutes(_ time: String) -> Int? {
        let p = time.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2, (0...23).contains(p[0]), (0...59).contains(p[1]) else { return nil }
        return p[0] * 60 + p[1]
    }

    private static func hhmm(_ m: Int) -> String { String(format: "%02d:%02d", m / 60, m % 60) }
    private static func short(_ time: String) -> String { String(time.prefix(5)) }

    static func isHalfHour(_ time: String) -> Bool {
        guard let m = minutes(time) else { return false }
        return m % 30 == 0 && (time.count <= 5 || time.hasSuffix(":00"))
    }

    /// Lỗi khi đặt giờ này (nil = được) — cùng câu chữ với server. Chọn lại
    /// đúng giờ hiện tại của chính khung (`current`, kể cả giờ lẻ cũ) → được.
    static func conflict(for time: String, others: [String], current: String? = nil) -> String? {
        if let current, short(current) == short(time) { return nil }
        guard isHalfHour(time) else { return halfHourError }
        let t = short(time)
        return others.map(short).contains(t) ? "Đã có khung giờ \(t)" : nil
    }

    /// Mốc cho menu chọn giờ của một khung: mọi mốc chưa dùng ở khung khác;
    /// giờ lẻ cũ của chính khung (đặt trước bản này) đứng đầu để vẫn thấy nó.
    static func options(current: String?, others: [String]) -> [String] {
        let used = Set(others.map(short))
        var list = halfHourTimes.filter { !used.contains($0) }
        if let c = current.map(short), !isHalfHour(c) { list.insert(c, at: 0) }
        return list
    }

    /// Giờ gợi ý cho khung mới: mốc trống đầu tiên sau khung muộn nhất (vòng
    /// qua nửa đêm); chưa có khung nào → fallback; hết mốc → nil.
    static func suggestedNewTime(existing: [String], fallback: String) -> String? {
        let used = Set(existing.map(short))
        guard let last = existing.compactMap(minutes).max() else { return fallback }
        let base = last / 30 * 30
        for k in 1...48 {
            let c = hhmm((base + 30 * k) % 1440)
            if !used.contains(c) { return c }
        }
        return nil
    }

    /// Bật/tắt một ngày; luôn giữ ít nhất một ngày, sắp theo thứ tự hiển thị.
    static func toggle(day: Int, in current: [Int]) -> [Int] {
        var set = Set(current)
        if set.contains(day) {
            guard set.count > 1 else { return current }
            set.remove(day)
        } else {
            set.insert(day)
        }
        return set.sorted { order($0) < order($1) }
    }

    private static func order(_ d: Int) -> Int { d == 0 ? 7 : d }

    static func summary(_ p: EmailPreferences) -> String {
        guard p.enabled else { return "Đang tắt" }
        switch p.frequency {
        case "daily": return "Mỗi ngày"
        case "weekdays": return "Thứ 2–6"
        default:
            return days.filter { p.customDays.contains($0.value) }.map(\.label).joined(separator: ", ")
        }
    }
}
