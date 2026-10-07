import XCTest
@testable import Wordly

// "Xoá hết" chỉ bỏ mục CHƯA lưu — từ đã lưu luôn được giữ (khớp server).
final class HistoryLogicTests: XCTestCase {
    private func entry(_ id: String, saved: Bool) -> TranslateHistoryEntry {
        TranslateHistoryEntry(id: id, sourceText: "w\(id)", translatedText: "n\(id)",
                              direction: "EN→VI", savedAt: "2026-10-07T12:00:00Z", isSaved: saved)
    }

    private var groups: [HistoryGroup] {
        [HistoryGroup(day: "2026-10-07", dateLabel: "Hôm nay", entries: [entry("1", saved: false), entry("2", saved: true)]),
         HistoryGroup(day: "2026-10-06", dateLabel: "Hôm qua", entries: [entry("3", saved: false)])]
    }

    func testRemovingUnsavedKeepsSavedAndDropsEmptyDays() {
        let left = HistoryLogic.removingUnsaved(groups)
        XCTAssertEqual(left.map(\.day), ["2026-10-07"])
        XCTAssertEqual(left.flatMap(\.entries).map(\.id), ["2"])
    }

    func testUnsavedCount() {
        XCTAssertEqual(HistoryLogic.unsavedCount(groups), 2)
        XCTAssertEqual(HistoryLogic.unsavedCount([]), 0)
    }
}
