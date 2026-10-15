import XCTest
@testable import Wordly

// Lịch widget 48 giờ gửi lên server để push tránh trùng / đố lại đúng lúc
// (spec 2026-10-15-shared-word-source-design.md §3). Thay cho log cả pool.
final class WidgetScheduleUploadTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_760_000_000)

    func testPayloadSkipsRestEntriesAndCapsAt200() {
        let w = WidgetWordItem(id: "s1", word: "a", meaning: "m", isSaved: true)
        let entries = (0..<300).map { i in
            WidgetSchedule.Entry(date: now.addingTimeInterval(Double(i) * 900), word: i % 10 == 0 ? nil : w)
        }
        let p = WidgetScheduleUpload.payload(entries)
        XCTAssertEqual(p.count, 200)
        XCTAssertTrue(p.allSatisfy { $0.id == "s1" })
        XCTAssertEqual(p.first?.shownAt, now.addingTimeInterval(900), "ô nghỉ (word nil) không gửi")
    }

    func testBankIdsKeepPrefix() {
        let b = WidgetWordItem(id: "bank-42", word: "x", meaning: "m", isSaved: false, fromBank: true)
        XCTAssertEqual(WidgetScheduleUpload.payload([.init(date: now, word: b)]).first?.id, "bank-42")
    }

    func testOnlyWordlyWidgetCounts() {
        XCTAssertTrue(WidgetScheduleUpload.hasWordlyWidget(kinds: ["Other", "WordlyWidget"]))
        XCTAssertFalse(WidgetScheduleUpload.hasWordlyWidget(kinds: ["Other"]))
        XCTAssertFalse(WidgetScheduleUpload.hasWordlyWidget(kinds: []))
    }

    func testHorizonIs48Hours() {
        XCTAssertEqual(WidgetScheduleUpload.horizonHours, 48)
    }
}
