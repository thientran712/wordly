import XCTest
@testable import Wordly

// Lịch nhắc dùng chung Email + Thông báo (api/email-*, api/push/*) — mốc :00/:30.
final class ReminderScheduleLogicTests: XCTestCase {
    // Server: tối đa 10 khung giờ, phải còn ít nhất 1
    func testSlotLimits() {
        XCTAssertTrue(ReminderScheduleLogic.canAddSlot(count: 9))
        XCTAssertFalse(ReminderScheduleLogic.canAddSlot(count: 10))
        XCTAssertTrue(ReminderScheduleLogic.canDeleteSlot(count: 2))
        XCTAssertFalse(ReminderScheduleLogic.canDeleteSlot(count: 1))
    }

    // custom_days theo web: 0 = Chủ nhật … 6 = Thứ bảy
    func testDayLabelsFollowWebNumbering() {
        XCTAssertEqual(ReminderScheduleLogic.days.map(\.value), [1, 2, 3, 4, 5, 6, 0])
        XCTAssertEqual(ReminderScheduleLogic.days.first { $0.value == 0 }?.label, "CN")
    }

    func testToggleDayKeepsSortedAndAtLeastOne() {
        XCTAssertEqual(ReminderScheduleLogic.toggle(day: 6, in: [1, 2]), [1, 2, 6])
        XCTAssertEqual(ReminderScheduleLogic.toggle(day: 1, in: [1, 2]), [2])
        XCTAssertEqual(ReminderScheduleLogic.toggle(day: 2, in: [2]), [2])   // không cho bỏ ngày cuối cùng
    }

    func testFrequencySummary() {
        XCTAssertEqual(ReminderScheduleLogic.summary(EmailPreferences(enabled: false, frequency: "daily", customDays: [])), "Đang tắt")
        XCTAssertEqual(ReminderScheduleLogic.summary(EmailPreferences(enabled: true, frequency: "daily", customDays: [])), "Mỗi ngày")
        XCTAssertEqual(ReminderScheduleLogic.summary(EmailPreferences(enabled: true, frequency: "weekdays", customDays: [])), "Thứ 2–6")
        XCTAssertEqual(ReminderScheduleLogic.summary(EmailPreferences(enabled: true, frequency: "custom", customDays: [0, 6])), "T7, CN")
    }

    func testHalfHourTimes() {
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.count, 48)
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.first, "00:00")
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes[17], "08:30")
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.last, "23:30")
    }

    func testIsHalfHour() {
        XCTAssertTrue(ReminderScheduleLogic.isHalfHour("08:00"))
        XCTAssertTrue(ReminderScheduleLogic.isHalfHour("20:30:00"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("08:15"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("08:01:00"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("08:30:15"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("25:00"))
    }

    func testConflictMatchesServerMessages() {
        XCTAssertEqual(ReminderScheduleLogic.conflict(for: "08:15", others: []),
                       "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)")
        XCTAssertEqual(ReminderScheduleLogic.conflict(for: "08:30", others: ["08:30:00"]), "Đã có khung giờ 08:30")
        XCTAssertNil(ReminderScheduleLogic.conflict(for: "09:00", others: ["08:30:00", "08:15:00"]))
    }

    func testOptionsHideUsedAndKeepLegacyCurrent() {
        let opts = ReminderScheduleLogic.options(current: "08:15:00", others: ["20:00:00"])
        XCTAssertEqual(opts.first, "08:15", "giờ lẻ cũ của chính khung đứng đầu")
        XCTAssertFalse(opts.contains("20:00"))
        XCTAssertTrue(opts.contains("08:00"))
        XCTAssertEqual(opts.count, 48)  // 48 mốc − 20:00 + 08:15
        XCTAssertEqual(ReminderScheduleLogic.options(current: "08:30:00", others: []).count, 48)
    }

    func testSuggestedNewTimeWrapsMidnightAndSkipsUsed() {
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: [], fallback: "20:00"), "20:00")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["08:00:00"], fallback: "20:00"), "08:30")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["23:30:00", "00:00:00"], fallback: "20:00"), "00:30")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["08:15:00"], fallback: "20:00"), "08:30")
    }

    /// Review #4: chọn lại đúng giờ lẻ cũ của chính khung (menu hiện "08:15" đầu tiên) → không lỗi.
    func testPickingOwnLegacyTimeIsNoConflict() {
        XCTAssertNil(ReminderScheduleLogic.conflict(for: "08:15", others: ["20:00:00"], current: "08:15:00"))
        XCTAssertEqual(ReminderScheduleLogic.conflict(for: "08:45", others: [], current: "08:15:00"),
                       ReminderScheduleLogic.halfHourError)
    }

    // MARK: - "Lần tới" trên thẻ trạng thái trang Nhắc ôn (spec 2026-10-15 §5.4)
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        return c
    }
    private func at(_ s: String) -> Date {   // "2026-10-15 19:00" (thứ 5)
        let f = DateFormatter(); f.calendar = cal; f.timeZone = cal.timeZone; f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: s)!
    }
    private func prefs(_ freq: String, _ days: [Int] = [1, 2, 3, 4, 5], on: Bool = true) -> EmailPreferences {
        EmailPreferences(enabled: on, frequency: freq, customDays: days)
    }

    func testNextSendTodayLaterSlot() {
        let d = ReminderScheduleLogic.nextSend(prefs("daily"), slots: ["12:00:00", "20:00:00"], now: at("2026-10-15 19:00"), calendar: cal)
        XCTAssertEqual(d, at("2026-10-15 20:00"))
        XCTAssertEqual(ReminderScheduleLogic.nextSendLabel(d!, now: at("2026-10-15 19:00"), calendar: cal), "20:00 hôm nay")
    }

    func testNextSendTomorrowAndWeekdaysSkipWeekend() {
        let d = ReminderScheduleLogic.nextSend(prefs("daily"), slots: ["08:00:00"], now: at("2026-10-15 19:00"), calendar: cal)
        XCTAssertEqual(ReminderScheduleLogic.nextSendLabel(d!, now: at("2026-10-15 19:00"), calendar: cal), "08:00 ngày mai")
        // Thứ 6 tối, chỉ thứ 2–6 → thứ 2
        let w = ReminderScheduleLogic.nextSend(prefs("weekdays"), slots: ["08:00:00"], now: at("2026-10-16 21:00"), calendar: cal)
        XCTAssertEqual(w, at("2026-10-19 08:00"))
        XCTAssertEqual(ReminderScheduleLogic.nextSendLabel(w!, now: at("2026-10-16 21:00"), calendar: cal), "Thứ 2, 08:00")
    }

    func testNextSendCustomDaysAndOff() {
        // Chỉ CN (0) → CN 18/10
        let c = ReminderScheduleLogic.nextSend(prefs("custom", [0]), slots: ["09:30:00"], now: at("2026-10-15 10:00"), calendar: cal)
        XCTAssertEqual(c, at("2026-10-18 09:30"))
        XCTAssertNil(ReminderScheduleLogic.nextSend(prefs("daily", on: false), slots: ["09:30:00"], now: at("2026-10-15 10:00"), calendar: cal))
        XCTAssertNil(ReminderScheduleLogic.nextSend(prefs("daily"), slots: [], now: at("2026-10-15 10:00"), calendar: cal))
        XCTAssertNil(ReminderScheduleLogic.nextSend(prefs("custom", []), slots: ["09:30:00"], now: at("2026-10-15 10:00"), calendar: cal))
    }
}
