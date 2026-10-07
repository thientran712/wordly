import Foundation

/// Logic thuần của Cài đặt email nhắc học — giống web /profile/email.
enum EmailSettingsLogic {
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

    /// "08:00:00" / "8:05" → Date hôm nay giờ đó (cho DatePicker).
    static func date(from time: String, calendar cal: Calendar = .current) -> Date {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        let h = parts.first ?? 8, m = parts.count > 1 ? parts[1] : 0
        return cal.date(bySettingHour: h, minute: m, second: 0, of: Date()) ?? Date()
    }

    /// Date → "HH:MM" (định dạng server nhận).
    static func timeString(from date: Date, calendar cal: Calendar = .current) -> String {
        let c = cal.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
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
