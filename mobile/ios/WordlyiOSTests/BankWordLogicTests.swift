import XCTest
@testable import Wordly

// Review UI 11/11 (N2, N3): từ trong kho hiện nghĩa Việt là dòng chính, định nghĩa
// Anh là dòng phụ; nút "Lưu từ này" chỉ lưu khi đã có nghĩa Việt (quiz/widget của
// từ đã lưu dùng nghĩa Việt — lưu nghĩa Anh lại thành đáp án lẫn hai thứ tiếng).
final class BankWordLogicTests: XCTestCase {
    func testVietnameseFirstEnglishSecond() {
        let m = BankWordLogic.meanings(vi: "kiên cường", en: "able to recover quickly")
        XCTAssertEqual(m.main, "kiên cường")
        XCTAssertEqual(m.secondary, "able to recover quickly")
    }

    func testFallsBackToEnglishWhenNoVietnamese() {
        let m = BankWordLogic.meanings(vi: "  ", en: "able to recover quickly")
        XCTAssertEqual(m.main, "able to recover quickly")
        XCTAssertNil(m.secondary)
    }

    func testSaveNeedsVietnamese() {
        XCTAssertEqual(BankWordLogic.meaningToSave(vi: " kiên cường "), "kiên cường")
        XCTAssertNil(BankWordLogic.meaningToSave(vi: ""))
        XCTAssertNil(BankWordLogic.meaningToSave(vi: nil))
    }
}

// Review UI 11/11 (N1): 3 hàng chip → nút "Lọc" + 1 dòng tóm tắt bộ lọc đang chọn
final class VocabFilterSummaryTests: XCTestCase {
    func testSummaryListsActiveFilters() {
        XCTAssertEqual(VocabCatalog.filterSummary(exam: nil, topic: nil, level: nil), "Tất cả từ")
        XCTAssertEqual(VocabCatalog.filterSummary(exam: "ielts", topic: "business", level: "B2"),
                       "IELTS · Business & Strategy · B2")
        XCTAssertEqual(VocabCatalog.filterSummary(exam: nil, topic: nil, level: "C1"), "C1")
        XCTAssertEqual(VocabCatalog.activeFilterCount(exam: "toeic", topic: nil, level: "B1"), 2)
    }

    func testPagerExposesTotalForApplyButton() {
        var p = WordPager<Int>()
        p.reset(with: [1, 2], total: 120)
        XCTAssertEqual(p.total, 120)
    }
}
