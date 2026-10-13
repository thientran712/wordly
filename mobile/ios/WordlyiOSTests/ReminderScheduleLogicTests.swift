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
}
