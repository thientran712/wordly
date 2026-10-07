import XCTest
@testable import Wordly

// Email nhắc học — giống web /profile/email (api/email-preferences, api/email-slots).
final class EmailSettingsLogicTests: XCTestCase {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        return c
    }

    func testTimeStringRoundTrip() {
        let d = EmailSettingsLogic.date(from: "20:30:00", calendar: cal)
        XCTAssertEqual(EmailSettingsLogic.timeString(from: d, calendar: cal), "20:30")
        XCTAssertEqual(EmailSettingsLogic.timeString(from: EmailSettingsLogic.date(from: "8:05", calendar: cal), calendar: cal), "08:05")
    }

    // Server: tối đa 10 khung giờ, phải còn ít nhất 1
    func testSlotLimits() {
        XCTAssertTrue(EmailSettingsLogic.canAddSlot(count: 9))
        XCTAssertFalse(EmailSettingsLogic.canAddSlot(count: 10))
        XCTAssertTrue(EmailSettingsLogic.canDeleteSlot(count: 2))
        XCTAssertFalse(EmailSettingsLogic.canDeleteSlot(count: 1))
    }

    // custom_days theo web: 0 = Chủ nhật … 6 = Thứ bảy
    func testDayLabelsFollowWebNumbering() {
        XCTAssertEqual(EmailSettingsLogic.days.map(\.value), [1, 2, 3, 4, 5, 6, 0])
        XCTAssertEqual(EmailSettingsLogic.days.first { $0.value == 0 }?.label, "CN")
    }

    func testToggleDayKeepsSortedAndAtLeastOne() {
        XCTAssertEqual(EmailSettingsLogic.toggle(day: 6, in: [1, 2]), [1, 2, 6])
        XCTAssertEqual(EmailSettingsLogic.toggle(day: 1, in: [1, 2]), [2])
        XCTAssertEqual(EmailSettingsLogic.toggle(day: 2, in: [2]), [2])   // không cho bỏ ngày cuối cùng
    }

    func testFrequencySummary() {
        XCTAssertEqual(EmailSettingsLogic.summary(EmailPreferences(enabled: false, frequency: "daily", customDays: [])), "Đang tắt")
        XCTAssertEqual(EmailSettingsLogic.summary(EmailPreferences(enabled: true, frequency: "daily", customDays: [])), "Mỗi ngày")
        XCTAssertEqual(EmailSettingsLogic.summary(EmailPreferences(enabled: true, frequency: "weekdays", customDays: [])), "Thứ 2–6")
        XCTAssertEqual(EmailSettingsLogic.summary(EmailPreferences(enabled: true, frequency: "custom", customDays: [0, 6])), "T7, CN")
    }
}
