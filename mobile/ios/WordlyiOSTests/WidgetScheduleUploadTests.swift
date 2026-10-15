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
        let p = WidgetScheduleUpload.payload(entries, intervalMinutes: 15)
        XCTAssertEqual(p.count, 200)
        XCTAssertTrue(p.allSatisfy { $0.id == "s1" })
        XCTAssertEqual(p.first?.shownAt, now.addingTimeInterval(900), "ô nghỉ (word nil) không gửi")
    }

    func testBankIdsKeepPrefix() {
        let b = WidgetWordItem(id: "bank-42", word: "x", meaning: "m", isSaved: false, fromBank: true)
        XCTAssertEqual(WidgetScheduleUpload.payload([.init(date: now, word: b)], intervalMinutes: 60).first?.id, "bank-42")
    }

    func testOnlyWordlyWidgetCounts() {
        XCTAssertTrue(WidgetScheduleUpload.hasWordlyWidget(kinds: ["Other", "WordlyWidget"]))
        XCTAssertFalse(WidgetScheduleUpload.hasWordlyWidget(kinds: ["Other"]))
        XCTAssertFalse(WidgetScheduleUpload.hasWordlyWidget(kinds: []))
    }

    func testHorizonIs48Hours() {
        XCTAssertEqual(WidgetScheduleUpload.horizonHours, 48)
    }

    /// Từ đang hiện gửi giờ BẮT ĐẦU slot (không phải "bây giờ") → mở app nhiều lần
    /// trong một slot không tạo dòng "Đã nhắc" trùng (review 15/10).
    func testCurrentEntryUsesSlotStart() {
        let w = WidgetWordItem(id: "s1", word: "a", meaning: "m", isSaved: true)
        let slotStart = Date(timeIntervalSince1970: 1_760_004_000)          // chia hết cho 3600
        let opened = slotStart.addingTimeInterval(37 * 60)
        let p = WidgetScheduleUpload.payload([.init(date: opened, word: w),
                                              .init(date: slotStart.addingTimeInterval(3600), word: w)], intervalMinutes: 60)
        XCTAssertEqual(p[0].shownAt, slotStart)
        XCTAssertEqual(p[1].shownAt, slotStart.addingTimeInterval(3600))
    }

    /// Đồng bộ: danh sách đã lưu (200 từ mới nhất) gộp trước lịch sử → widget và push cùng tập từ.
    func testSyncMergesSavedListFirst() {
        func e(_ id: String, _ text: String, saved: Bool) -> TranslateHistoryEntry {
            TranslateHistoryEntry(id: id, sourceText: text, translatedText: "m", direction: "EN→VI", savedAt: "", isSaved: saved)
        }
        let items = AppGroupStorage.items(saved: [e("s9", "old", saved: true)],
                                          history: [e("h1", "new", saved: false), e("s9", "old", saved: true)])
        XCTAssertEqual(items.map(\.id).sorted(), ["h1", "s9"])
        XCTAssertTrue(items.first { $0.id == "s9" }!.isSaved)
    }
}
