import XCTest
@testable import Wordly

// Tab "Đã nhắc" (Từ vựng): từ app đã nhắc 7 ngày qua (push / widget / email cũ),
// lấy từ /api/suggestion-log. Logic thuần: lọc, gom theo ngày, gộp trùng.
final class RemindedLogicTests: XCTestCase {
    private var cal: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
        return c
    }
    // 13/10/2026 20:00 giờ VN (thứ Ba)
    private let now = ISO8601DateFormatter().date(from: "2026-10-13T13:00:00Z")!

    private func item(_ id: String, word: String, source: String, at iso: String,
                      type: String = "translate_history", meaning: String? = "nghĩa") -> RemindedItem {
        RemindedItem(id: id, source: source, entryType: type, entryId: type == "bank" ? nil : "e-\(word)",
                     bankWordId: type == "bank" ? "b-\(word)" : nil, shownAt: iso, word: word, meaning: meaning)
    }

    func testDecodesApiItem() throws {
        let json = #"{"items":[{"id":"1","source":"push","entry_type":"bank","bank_word_id":"uuid-1","shown_at":"2026-10-13T07:00:02.123+00:00","word":"go","meaning":"to move","state":null,"due_at":null,"review_count":null}],"hasMore":false}"#
        let r = try JSONDecoder().decode(RemindedPage.self, from: Data(json.utf8))
        XCTAssertEqual(r.items.first?.bankWordId, "uuid-1")
        XCTAssertEqual(r.items.first?.source, "push")
        XCTAssertFalse(r.hasMore)
    }

    func testGroupsByLocalDayNewestFirstAndDropsOldAndJournal() {
        let items = [
            item("1", word: "resilient", source: "push", at: "2026-10-13T07:00:00Z"),       // hôm nay 14:00
            item("2", word: "go", source: "widget", at: "2026-10-12T18:00:00Z", type: "bank"), // 13/10 01:00 VN → hôm nay
            item("3", word: "eager", source: "widget", at: "2026-10-12T03:00:00Z"),         // hôm qua
            item("4", word: "nhật ký dài", source: "email", at: "2026-10-12T03:00:00Z", type: "journal_entries"),
            item("5", word: "old", source: "push", at: "2026-10-06T03:00:00Z"),             // 8 ngày trước → bỏ
        ]
        let sections = RemindedLogic.group(items, now: now, calendar: cal)
        XCTAssertEqual(sections.map(\.title), ["Hôm nay", "Hôm qua"])
        XCTAssertEqual(sections[0].rows.map(\.word), ["resilient", "go"], "mới nhất trước")
        XCTAssertEqual(sections[1].rows.map(\.word), ["eager"])
    }

    func testSameWordSameDayMergedWithAllSources() {
        let items = [
            item("1", word: "Resilient", source: "widget", at: "2026-10-13T08:00:00Z"),
            item("2", word: "resilient", source: "push", at: "2026-10-13T07:00:00Z"),
            item("3", word: "resilient", source: "widget", at: "2026-10-13T06:00:00Z"),
        ]
        let rows = RemindedLogic.group(items, now: now, calendar: cal)[0].rows
        XCTAssertEqual(rows.count, 1)
        XCTAssertEqual(rows[0].sources, ["push", "widget"], "thứ tự cố định, không trùng")
        XCTAssertEqual(rows[0].timesShown, 3)
    }

    func testDayTitles() {
        let d = { (iso: String) in ISO8601DateFormatter().date(from: iso)! }
        XCTAssertEqual(RemindedLogic.dayTitle(d("2026-10-13T02:00:00Z"), now: now, calendar: cal), "Hôm nay")
        XCTAssertEqual(RemindedLogic.dayTitle(d("2026-10-12T02:00:00Z"), now: now, calendar: cal), "Hôm qua")
        XCTAssertEqual(RemindedLogic.dayTitle(d("2026-10-11T02:00:00Z"), now: now, calendar: cal), "Chủ nhật, 11/10")
        XCTAssertEqual(RemindedLogic.dayTitle(d("2026-10-09T02:00:00Z"), now: now, calendar: cal), "Thứ Sáu, 09/10")
    }

    func testSourceIconsAndLabels() {
        XCTAssertEqual(RemindedLogic.icon(for: "push"), "bell.fill")
        XCTAssertEqual(RemindedLogic.icon(for: "widget"), "lock.iphone")
        XCTAssertEqual(RemindedLogic.icon(for: "email"), "envelope.fill")
    }

    func testDetailEntryForSavedAndBankWords() {
        let saved = RemindedLogic.group([item("1", word: "eager", source: "push", at: "2026-10-13T07:00:00Z")], now: now, calendar: cal)[0].rows[0]
        XCTAssertEqual(saved.detailEntry.id, "e-eager")
        XCTAssertEqual(saved.detailEntry.direction, "EN→VI")
        let bank = RemindedLogic.group([item("2", word: "go", source: "push", at: "2026-10-13T07:00:00Z", type: "bank", meaning: nil)], now: now, calendar: cal)[0].rows[0]
        XCTAssertEqual(bank.detailEntry.id, "bank-b-go")
        XCTAssertEqual(bank.detailEntry.translatedText, "")
    }

    /// API trả mới nhất trước, mỗi trang 50: tải tiếp khi còn trang và mục cũ
    /// nhất vẫn trong 7 ngày; dừng hẳn sau 4 trang (chặn widget log quá nhiều).
    func testShouldLoadMore() {
        let recent = [item("1", word: "a", source: "widget", at: "2026-10-12T03:00:00Z")]
        let old = [item("2", word: "b", source: "widget", at: "2026-10-05T03:00:00Z")]
        XCTAssertTrue(RemindedLogic.shouldLoadMore(lastPage: recent, hasMore: true, pagesLoaded: 1, now: now, calendar: cal))
        XCTAssertFalse(RemindedLogic.shouldLoadMore(lastPage: recent, hasMore: false, pagesLoaded: 1, now: now, calendar: cal))
        XCTAssertFalse(RemindedLogic.shouldLoadMore(lastPage: old, hasMore: true, pagesLoaded: 1, now: now, calendar: cal))
        XCTAssertFalse(RemindedLogic.shouldLoadMore(lastPage: recent, hasMore: true, pagesLoaded: 4, now: now, calendar: cal))
    }
}
