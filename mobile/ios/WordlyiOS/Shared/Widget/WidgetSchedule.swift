import Foundation

// Dùng chung cho app + widget (cùng được biên dịch vào 2 target, xem project.yml).
// App lưu danh sách từ + cài đặt vào App Group; widget đọc ra và dựng lịch hiển thị.

/// Một từ hiện trên widget.
struct WidgetWordItem: Codable, Equatable, Identifiable {
    let id: String
    let word: String
    let meaning: String
    var isSaved: Bool
}

/// Cài đặt widget (Hồ sơ → Widget màn hình khoá).
struct WidgetSettings: Codable, Equatable {
    enum Source: String, Codable, CaseIterable {
        case saved      // từ đã bấm "Lưu"
        case recent     // mọi bản dịch Anh→Việt gần đây
        case custom     // tự chọn từng từ
    }

    var source: Source = .saved
    var selectedIds: [String] = []
    /// Chu kỳ đổi từ (phút)
    var intervalMinutes: Int = 60
    /// Khung giờ hiển thị, tính bằng phút từ 0h (cho phép qua đêm: start > end)
    var activeStartMinutes: Int = 7 * 60
    var activeEndMinutes: Int = 22 * 60
    /// Ẩn nghĩa để tự kiểm tra trí nhớ
    var showMeaning: Bool = true

    static let intervals = [15, 30, 60, 120]
}

enum WidgetSchedule {
    struct Entry: Equatable {
        let date: Date
        let word: WidgetWordItem?
    }

    /// Lọc từ theo nguồn. "Đã lưu" mà chưa lưu từ nào thì dùng từ gần đây để widget không trống.
    static func pool(from words: [WidgetWordItem], settings: WidgetSettings) -> [WidgetWordItem] {
        switch settings.source {
        case .recent:
            return words
        case .saved:
            let saved = words.filter(\.isSaved)
            return saved.isEmpty ? words : saved
        case .custom:
            let ids = Set(settings.selectedIds)
            return words.filter { ids.contains($0.id) }
        }
    }

    private static func minutes(_ date: Date, _ cal: Calendar) -> Int {
        let c = cal.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }

    static func isActive(_ date: Date, settings: WidgetSettings, calendar cal: Calendar = .current) -> Bool {
        let m = minutes(date, cal)
        let s = settings.activeStartMinutes, e = settings.activeEndMinutes
        if s == e { return true }                    // cả ngày
        return s < e ? (m >= s && m < e) : (m >= s || m < e)
    }

    /// Mốc thay đổi tiếp theo: hết slot hiện tại, hết khung giờ, hoặc lúc khung giờ mở lại.
    private static func nextChange(after date: Date, settings: WidgetSettings, calendar cal: Calendar) -> Date {
        let day = cal.startOfDay(for: date)
        let m = minutes(date, cal)
        func at(_ minute: Int, dayOffset: Int = 0) -> Date {
            cal.date(byAdding: .minute, value: minute, to: cal.date(byAdding: .day, value: dayOffset, to: day)!)!
        }
        let s = settings.activeStartMinutes, e = settings.activeEndMinutes
        if isActive(date, settings: settings, calendar: cal) {
            let interval = max(1, settings.intervalMinutes)
            var next = at((m / interval + 1) * interval)
            if s != e {
                let end = (s > e && m >= s) ? at(e, dayOffset: 1) : at(e)
                if end > date && end < next { next = end }
            }
            return next
        }
        return m < s ? at(s) : at(s, dayOffset: 1)
    }

    /// Lúc xin lịch mới: hết lịch, nhưng không sớm hơn 30 phút — pool rỗng chỉ
    /// có 1 entry tại `now`, xin lại ngay sẽ lặp liên tục và đốt lượt cập nhật.
    static func reloadDate(entries: [Entry], now: Date = Date()) -> Date {
        let minimum = now.addingTimeInterval(30 * 60)
        guard let last = entries.last?.date, last > minimum else { return minimum }
        return last
    }

    /// Lịch hiển thị ~24 giờ tới. Ngoài khung giờ → entry `word == nil` (màn nghỉ).
    static func entries(words: [WidgetWordItem], settings: WidgetSettings, now: Date = Date(),
                        calendar cal: Calendar = .current, horizonHours: Int = 24) -> [Entry] {
        let pool = pool(from: words, settings: settings)
        guard !pool.isEmpty else { return [Entry(date: now, word: nil)] }

        let horizon = now.addingTimeInterval(TimeInterval(horizonHours * 3600))
        // Xoay vòng theo số slot kể từ mốc cố định → mỗi slot một từ, lần sau mở app không lặp lại từ đầu
        var index = Int(now.timeIntervalSince1970 / 60) / max(1, settings.intervalMinutes)
        var result: [Entry] = []
        var t = now
        while t < horizon && result.count < 200 {
            if isActive(t, settings: settings, calendar: cal) {
                result.append(Entry(date: t, word: pool[index % pool.count]))
                index += 1
            } else {
                result.append(Entry(date: t, word: nil))
            }
            t = nextChange(after: t, settings: settings, calendar: cal)
        }
        return result
    }
}
