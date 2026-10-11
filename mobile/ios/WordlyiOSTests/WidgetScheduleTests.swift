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

    // "Dịch gần đây" (bỏ chọn "Đã lưu") = chỉ những từ đã dịch mà chưa bấm Lưu
    func testUnsavedSourceShowsOnlyUnsavedWords() {
        var s = WidgetSettings()
        s.source = .unsaved
        XCTAssertEqual(WidgetSchedule.pool(from: words, settings: s).map(\.id), ["2"])
    }

    // Từ nào cũng đã lưu mà chỉ chọn "Dịch gần đây" → vẫn hiện từ, không để widget trống
    func testUnsavedFallsBackToAllWhenEverythingSaved() {
        var s = WidgetSettings()
        s.source = .unsaved
        let saved = words.map { WidgetWordItem(id: $0.id, word: $0.word, meaning: $0.meaning, isSaved: true) }
        XCTAssertEqual(WidgetSchedule.pool(from: saved, settings: s).count, 3)
    }

    // Hai ô chọn "Đã lưu" / "Dịch gần đây" ↔ source
    func testSourceCheckboxes() {
        var s = WidgetSettings()
        s.setSources(saved: true, recent: true)
        XCTAssertEqual(s.source, .recent)
        XCTAssertTrue(s.includesSaved && s.includesRecent)
        s.setSources(saved: true, recent: false)
        XCTAssertEqual(s.source, .saved)
        XCTAssertTrue(s.includesSaved && !s.includesRecent)
        s.setSources(saved: false, recent: true)
        XCTAssertEqual(s.source, .unsaved)
        XCTAssertTrue(!s.includesSaved && s.includesRecent)
    }

    // Không cho bỏ chọn cả hai — widget sẽ không còn nguồn nào
    func testSourceCheckboxesKeepAtLeastOne() {
        var s = WidgetSettings()
        s.source = .saved
        s.setSources(saved: false, recent: false)
        XCTAssertEqual(s.source, .saved)
    }

    func testCustomSourceChecksNeitherBox() {
        var s = WidgetSettings()
        s.source = .custom
        XCTAssertFalse(s.includesSaved || s.includesRecent)
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

    // Cài đặt cũ (trước khi thêm lockStyle/homeTheme) lưu trong App Group phải
    // decode được bình thường, 2 khoá mới lấy mặc định thay vì lỗi/crash.
    func testSettingsDecodeOldDataWithoutStyleKeys() throws {
        let oldJSON = """
        {"source":"saved","selectedIds":[],"intervalMinutes":30,
         "activeStartMinutes":420,"activeEndMinutes":1320,"showMeaning":true,"includeBank":true}
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(WidgetSettings.self, from: oldJSON)
        XCTAssertEqual(decoded.lockStyle, .full)
        XCTAssertEqual(decoded.homeTheme, .defaultTheme)
        XCTAssertEqual(decoded.homeStyle, WidgetSettings.HomeStyle(), "dữ liệu cũ (trước khi có homeStyle) decode ra mặc định, không lỗi")
        XCTAssertEqual(decoded.intervalMinutes, 30, "các field cũ vẫn giữ nguyên giá trị đã lưu")
    }

    func testSettingsStyleRoundTrip() throws {
        var s = WidgetSettings()
        s.lockStyle = .compact
        s.homeTheme = .sunset
        s.homeStyle.bgHex1 = "#FF0000"
        s.homeStyle.wordWeight = .light
        s.homeStyle.wordItalic = true
        s.textAlign = .center
        let back = try JSONDecoder().decode(WidgetSettings.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(back.lockStyle, .compact)
        XCTAssertEqual(back.homeTheme, .sunset)
        XCTAssertEqual(back.homeStyle, s.homeStyle)
        XCTAssertEqual(back.textAlign, .center)
    }

    // Build 9–10 lưu homeStyle có imageOverlay (tính năng ảnh nền đã bỏ) và
    // chưa có textAlign — phải đọc được, giữ nguyên màu người dùng đã chọn.
    func testSettingsDecodeBuild10DataAfterImageBackgroundRemoved() throws {
        let json = """
        {"source":"saved","selectedIds":[],"intervalMinutes":60,"activeStartMinutes":420,
         "activeEndMinutes":1320,"showMeaning":true,"includeBank":true,"lockStyle":"full",
         "homeTheme":"defaultTheme","homeStyle":{"bgHex1":"#FF0000","bgHex2":"#00FF00",
         "wordColorHex":"#FFFFFF","meaningColorHex":"#EEEEEE","wordWeight":"bold",
         "meaningWeight":"regular","wordItalic":false,"meaningItalic":true,"imageOverlay":"dark"}}
        """.data(using: .utf8)!
        let s = try JSONDecoder().decode(WidgetSettings.self, from: json)
        XCTAssertEqual(s.homeStyle.bgHex1, "#FF0000")
        XCTAssertTrue(s.homeStyle.meaningItalic)
        XCTAssertEqual(s.textAlign, .leading)
    }

    // HomeStyle thiếu khoá (thêm trường mới sau này) không được làm hỏng cả
    // WidgetSettings — trước đây bộ giải mã tự sinh báo lỗi → mất hết cài đặt.
    func testHomeStyleMissingKeysFallsBackPerField() throws {
        let json = ##"{"homeStyle":{"bgHex1":"#123456"}}"##.data(using: .utf8)!
        let s = try JSONDecoder().decode(WidgetSettings.self, from: json)
        XCTAssertEqual(s.homeStyle.bgHex1, "#123456")
        XCTAssertEqual(s.homeStyle.wordColorHex, WidgetSettings.HomeStyle().wordColorHex)
    }

    // Review: pool rỗng → entries chỉ có 1 entry tại `now` → xin lịch mới ngay lập tức,
    // lặp liên tục, đốt hết lượt cập nhật của widget. Phải chờ ít nhất 30 phút.
    func testReloadDateNeverImmediate() {
        let now = at(9)
        let empty = WidgetSchedule.entries(words: [], settings: WidgetSettings(), now: now, calendar: cal)
        XCTAssertEqual(WidgetSchedule.reloadDate(entries: empty, now: now), now.addingTimeInterval(30 * 60))
        let full = WidgetSchedule.entries(words: words, settings: WidgetSettings(), now: now, calendar: cal)
        XCTAssertEqual(WidgetSchedule.reloadDate(entries: full, now: now), full.last?.date)
    }
}
