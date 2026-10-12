import XCTest
@testable import Wordly

// Nghĩa tiếng Việt cho từ kho trên widget: kho chỉ có định nghĩa tiếng Anh
// (`def_en`), nên app tra /api/dictionary (cùng lượt tra phiên âm) lấy `def_vi`
// rồi lưu vào App Group; widget ưu tiên nghĩa Việt, chưa có thì dùng nghĩa cũ.
final class WidgetMeaningTests: XCTestCase {
    private func bankItem(_ word: String, meaning: String = "able to recover quickly") -> WidgetWordItem {
        WidgetWordItem(id: "bank-\(word)", word: word, meaning: meaning, isSaved: false, fromBank: true)
    }
    private func personal(_ word: String, meaning: String = "nghĩa của bạn") -> WidgetWordItem {
        WidgetWordItem(id: word, word: word, meaning: meaning, isSaved: true)
    }
    private func detail(_ meanings: [WordMeaning]) -> DictionaryDetail {
        DictionaryDetail(word: "resilient", phoneticUs: "rɪˈzɪljənt", phoneticUk: "", meanings: meanings, hasMoreMeanings: nil)
    }

    // MARK: Lấy nghĩa Việt từ kết quả tra từ điển

    func testShortMeaningIsFirstDefOfFirstMeaningTrimmed() {
        let d = detail([
            WordMeaning(pos: "adjective", defs: [
                WordSense(def: "able to recover", defVi: "  kiên cường, mau phục hồi \n", example: ""),
                WordSense(def: "elastic", defVi: "đàn hồi", example: ""),
            ]),
            WordMeaning(pos: "noun", defs: [WordSense(def: "x", defVi: "khác", example: "")]),
        ])
        XCTAssertEqual(d.shortMeaningVi, "kiên cường, mau phục hồi")
    }

    func testShortMeaningEmptyWhenNoVietnamese() {
        XCTAssertEqual(detail([]).shortMeaningVi, "")
        XCTAssertEqual(detail([WordMeaning(pos: "noun", defs: [])]).shortMeaningVi, "")
        XCTAssertEqual(detail([WordMeaning(pos: "noun", defs: [WordSense(def: "x", defVi: "   ", example: "")])]).shortMeaningVi, "")
    }

    // MARK: Nghĩa hiển thị trên widget

    func testBankWordShowsVietnameseWhenCached() {
        let cache = ["resilient": "kiên cường"]
        XCTAssertEqual(WidgetMeaning.meaning(for: bankItem("Resilient "), cache: cache), "kiên cường")
    }

    // Chưa đồng bộ lần nào / tra không có → giữ nghĩa cũ, widget không trống
    func testBankWordFallsBackToStoredMeaning() {
        XCTAssertEqual(WidgetMeaning.meaning(for: bankItem("resilient"), cache: [:]), "able to recover quickly")
        XCTAssertEqual(WidgetMeaning.meaning(for: bankItem("resilient"), cache: ["resilient": ""]), "able to recover quickly")
        XCTAssertEqual(WidgetMeaning.meaning(for: bankItem("resilient"), cache: ["resilient": "  "]), "able to recover quickly")
    }

    // Từ của người dùng đã có nghĩa Việt từ bản dịch → không đổi
    func testPersonalWordUnchanged() {
        let cache = ["resilient": "kiên cường"]
        XCTAssertEqual(WidgetMeaning.meaning(for: personal("resilient", meaning: "bền bỉ"), cache: cache), "bền bỉ")
    }

    func testLocalizedItemKeepsIdentity() {
        let item = bankItem("resilient")
        let shown = WidgetMeaning.localized(item, cache: ["resilient": "kiên cường"])
        XCTAssertEqual(shown.meaning, "kiên cường")
        XCTAssertEqual(shown.id, item.id)
        XCTAssertEqual(shown.word, item.word)
        XCTAssertTrue(shown.fromBank)
        XCTAssertEqual(WidgetMeaning.localized(personal("cat"), cache: ["cat": "mèo"]), personal("cat"))
    }

    // MARK: Chọn từ cần tra (không tăng số lượt gọi)

    // Từ kho đã có phiên âm (lưu từ trước bản này) nhưng chưa có nghĩa Việt → vẫn tra
    func testBankWordWithPhoneticButNoMeaningIsFetched() {
        let upcoming = [bankItem("resilient"), personal("cat"), bankItem("diligent")]
        let phonetics = ["resilient": "/rɪˈzɪljənt/", "cat": "/kæt/", "diligent": "/x/"]
        let meanings = ["diligent": "siêng năng"]
        XCTAssertEqual(WidgetPhonetic.wordsToFetch(upcoming: upcoming, cache: phonetics, meanings: meanings, limit: 12),
                       ["resilient"])
    }

    // Đã tra mà không có nghĩa (rỗng) → không tra lại; vẫn tôn trọng giới hạn
    func testEmptyMeaningIsNotRefetchedAndLimitHolds() {
        let upcoming = [bankItem("a"), bankItem("b"), bankItem("c"), personal("d")]
        let phonetics = ["a": "/a/", "b": "/b/", "c": "/c/", "d": "/d/"]
        XCTAssertEqual(WidgetPhonetic.wordsToFetch(upcoming: upcoming, cache: phonetics, meanings: ["a": ""], limit: 1), ["b"])
        // Từ của người dùng không cần nghĩa Việt → không tra chỉ vì thiếu nghĩa
        XCTAssertEqual(WidgetPhonetic.wordsToFetch(upcoming: [personal("d")], cache: phonetics, meanings: [:], limit: 12), [])
    }

    // MARK: Gộp + giới hạn bảng lưu trong App Group

    func testMergeOverwritesWithNewValues() {
        let merged = WidgetLookupCache.merged(["a": "1", "b": "2"], with: ["b": "3", "c": "4"], inUse: [])
        XCTAssertEqual(merged, ["a": "1", "b": "3", "c": "4"])
    }

    func testMergeCapsToWordsInUse() {
        let existing = Dictionary(uniqueKeysWithValues: (0..<5).map { ("w\($0)", "v") })
        let merged = WidgetLookupCache.merged(existing, with: ["new": "n"], inUse: ["w1", "new"], cap: 4)
        XCTAssertEqual(merged, ["w1": "v", "new": "n"])
        // Chưa vượt giới hạn → giữ hết
        XCTAssertEqual(WidgetLookupCache.merged(["a": "1"], with: ["b": "2"], inUse: [], cap: 4).count, 2)
    }

    func testMeaningCacheUsesDistinctKeyAndSameCap() {
        XCTAssertEqual(WidgetMeaning.cacheKey, "wordly.widget.meaningsVi")
        XCTAssertNotEqual(WidgetMeaning.cacheKey, WidgetPhonetic.cacheKey)
        XCTAssertEqual(WidgetLookupCache.maxEntries, 2000)
    }
}
