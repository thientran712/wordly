import XCTest
@testable import Wordly

// Widget màn hình khoá: chọn từ để hiện + khung giờ + chu kỳ đổi từ.
final class WidgetScheduleTests: XCTestCase {
    private let words = [
        WidgetWordItem(id: "1", word: "resilient", meaning: "kiên cường", isSaved: true),
        WidgetWordItem(id: "2", word: "diligent", meaning: "chăm chỉ", isSaved: false),
        WidgetWordItem(id: "3", word: "meticulous", meaning: "tỉ mỉ", isSaved: true),
    ]
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        return c
    }
    private func at(_ h: Int, _ m: Int = 0) -> Date {
        cal.date(from: DateComponents(year: 2026, month: 10, day: 7, hour: h, minute: m))!
    }

    func testSourceFiltering() {
        var s = WidgetSettings()
        s.source = .saved
        XCTAssertEqual(WidgetSchedule.pool(from: words, settings: s).map(\.id), ["1", "3"])
        s.source = .recent
        XCTAssertEqual(WidgetSchedule.pool(from: words, settings: s).count, 3)
        s.source = .custom
        s.selectedIds = ["3", "2"]
        XCTAssertEqual(WidgetSchedule.pool(from: words, settings: s).map(\.id), ["2", "3"])
    }

    // Chưa lưu từ nào thì vẫn hiện từ gần đây thay vì widget trống
    func testSavedFallsBackToRecentWhenNothingSaved() {
        var s = WidgetSettings()
        s.source = .saved
        let unsaved = words.map { WidgetWordItem(id: $0.id, word: $0.word, meaning: $0.meaning, isSaved: false) }
        XCTAssertEqual(WidgetSchedule.pool(from: unsaved, settings: s).count, 3)
    }

    func testActiveWindow() {
        var s = WidgetSettings()
        s.activeStartMinutes = 7 * 60
        s.activeEndMinutes = 22 * 60
        XCTAssertTrue(WidgetSchedule.isActive(at(7), settings: s, calendar: cal))
        XCTAssertTrue(WidgetSchedule.isActive(at(21, 59), settings: s, calendar: cal))
        XCTAssertFalse(WidgetSchedule.isActive(at(22), settings: s, calendar: cal))
        XCTAssertFalse(WidgetSchedule.isActive(at(3), settings: s, calendar: cal))
    }

    // Khung giờ qua đêm (vd 20:00 → 02:00)
    func testOvernightWindow() {
        var s = WidgetSettings()
        s.activeStartMinutes = 20 * 60
        s.activeEndMinutes = 2 * 60
        XCTAssertTrue(WidgetSchedule.isActive(at(23), settings: s, calendar: cal))
        XCTAssertTrue(WidgetSchedule.isActive(at(1), settings: s, calendar: cal))
        XCTAssertFalse(WidgetSchedule.isActive(at(12), settings: s, calendar: cal))
    }

    func testEntriesRotateEveryIntervalInsideWindow() {
        var s = WidgetSettings()
        s.intervalMinutes = 60
        s.activeStartMinutes = 7 * 60
        s.activeEndMinutes = 22 * 60
        s.source = .recent
        let entries = WidgetSchedule.entries(words: words, settings: s, now: at(9, 20), calendar: cal)
        XCTAssertEqual(entries.first?.date, at(9, 20))
        XCTAssertEqual(entries[1].date, at(10))
        let shown = entries.prefix(4).compactMap(\.word?.id)
        XCTAssertEqual(Set(shown).count, 3)                       // đi qua đủ các từ
        XCTAssertNotEqual(entries[0].word?.id, entries[1].word?.id)
    }

    func testOutsideWindowShowsRestUntilWindowOpens() {
        var s = WidgetSettings()
        s.intervalMinutes = 30
        s.activeStartMinutes = 7 * 60
        s.activeEndMinutes = 22 * 60
        let entries = WidgetSchedule.entries(words: words, settings: s, now: at(23), calendar: cal)
        XCTAssertNil(entries[0].word)                              // ngoài giờ → màn nghỉ
        let firstWord = entries.first { $0.word != nil }
        XCTAssertEqual(firstWord?.date, cal.date(byAdding: .day, value: 1, to: at(7)))
    }

    func testNoWordsMeansSingleEmptyEntry() {
        let entries = WidgetSchedule.entries(words: [], settings: WidgetSettings(), now: at(9), calendar: cal)
        XCTAssertEqual(entries.count, 1)
        XCTAssertNil(entries[0].word)
    }

    func testSettingsRoundTripAndDefaults() throws {
        let d = WidgetSettings()
        XCTAssertEqual(d.source, .saved)
        XCTAssertEqual(d.intervalMinutes, 60)
        XCTAssertTrue(d.showMeaning)
        let back = try JSONDecoder().decode(WidgetSettings.self, from: JSONEncoder().encode(d))
        XCTAssertEqual(back, d)
    }
}
