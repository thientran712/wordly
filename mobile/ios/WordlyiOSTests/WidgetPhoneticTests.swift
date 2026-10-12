import XCTest
@testable import Wordly

// Phiên âm US trên widget: chỉ cho từ/cụm từ, câu thì ẩn; tải bù đúng những từ sắp hiện.
final class WidgetPhoneticTests: XCTestCase {
    private func item(_ id: String, _ word: String) -> WidgetWordItem {
        WidgetWordItem(id: id, word: word, meaning: "nghĩa", isSaved: true)
    }

    func testWordsAndPhrasesAreEligible() {
        XCTAssertTrue(WidgetPhonetic.eligible("resilient"))
        XCTAssertTrue(WidgetPhonetic.eligible("give up"))
        XCTAssertTrue(WidgetPhonetic.eligible("take something for granted"))
        XCTAssertTrue(WidgetPhonetic.eligible("  page-turner "))
    }

    func testSentencesAreNotEligible() {
        XCTAssertFalse(WidgetPhonetic.eligible("I love you."))
        XCTAssertFalse(WidgetPhonetic.eligible("How are you?"))
        XCTAssertFalse(WidgetPhonetic.eligible("She is a resilient leader who never gives up"))
        XCTAssertFalse(WidgetPhonetic.eligible("Well, I think so"))
        XCTAssertFalse(WidgetPhonetic.eligible(""))
    }

    func testDisplayAddsSlashesAndHidesEmpty() {
        XCTAssertEqual(WidgetPhonetic.display("/rɪˈzɪljənt/"), "/rɪˈzɪljənt/")
        XCTAssertEqual(WidgetPhonetic.display(" rɪˈzɪljənt "), "/rɪˈzɪljənt/")
        XCTAssertNil(WidgetPhonetic.display(""))
        XCTAssertNil(WidgetPhonetic.display(nil))
    }

    // Bộ nhớ đệm theo từ đã chuẩn hoá — "Resilient" và "resilient " là một
    func testLookupUsesNormalizedKey() {
        let cache = ["resilient": "/rɪˈzɪljənt/"]
        XCTAssertEqual(WidgetPhonetic.phonetic(for: "Resilient ", cache: cache), "/rɪˈzɪljənt/")
        XCTAssertNil(WidgetPhonetic.phonetic(for: "I am resilient.", cache: ["i am resilient": "/x/"]))
    }

    // Chỉ tải từ chưa có trong cache (kể cả cache rỗng = đã tra mà không có), bỏ câu, bỏ trùng, có giới hạn
    func testWordsToFetch() {
        let upcoming = [item("1", "resilient"), item("2", "How are you?"), item("3", "diligent"),
                        item("4", "Diligent"), item("5", "cat"), item("6", "dog")]
        let cache = ["resilient": "/rɪˈzɪljənt/", "cat": ""]
        XCTAssertEqual(WidgetPhonetic.wordsToFetch(upcoming: upcoming, cache: cache, limit: 5), ["diligent", "dog"])
        XCTAssertEqual(WidgetPhonetic.wordsToFetch(upcoming: upcoming, cache: cache, limit: 1), ["diligent"])
    }
}
