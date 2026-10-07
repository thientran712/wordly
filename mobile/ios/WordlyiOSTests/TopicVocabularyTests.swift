import XCTest
@testable import Wordly

// Từ vựng theo chủ đề — giống web /vocabulary-chat (lọc kỳ thi/chủ đề/trình độ,
// trang 40 từ, đếm số từ theo nhóm).
final class TopicVocabularyTests: XCTestCase {
    func testCatalogMatchesWeb() {
        XCTAssertEqual(VocabCatalog.exams.map(\.key), ["general", "toeic", "ielts", "toefl"])
        XCTAssertEqual(VocabCatalog.topics.count, 12)
        XCTAssertEqual(VocabCatalog.levels, ["A1", "A2", "B1", "B2", "C1", "C2"])
    }

    func testFilterLabelShowsCount() {
        let ielts = VocabCatalog.exams.first { $0.key == "ielts" }!
        XCTAssertEqual(ielts.label(count: 950), "🎓 IELTS (950)")
        XCTAssertEqual(ielts.label(count: nil), "🎓 IELTS")
    }

    func testPagerAppendsAndKnowsWhenDone() {
        var pager = WordPager<Int>()
        pager.reset(with: Array(0..<40), total: 90)
        XCTAssertTrue(pager.hasMore)
        XCTAssertEqual(pager.nextOffset, 40)
        pager.append(Array(40..<80))
        XCTAssertEqual(pager.nextOffset, 80)
        pager.append(Array(80..<90))
        XCTAssertFalse(pager.hasMore)
    }

    func testPagerStopsOnEmptyPageEvenIfTotalUnknown() {
        var pager = WordPager<Int>()
        pager.reset(with: Array(0..<40), total: nil)
        XCTAssertTrue(pager.hasMore)
        pager.append([])
        XCTAssertFalse(pager.hasMore)
    }
}
