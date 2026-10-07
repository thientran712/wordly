import XCTest
@testable import Wordly

// Widget trộn từ đã lưu với từ trong kho 7.5k từ: không trùng từ, mỗi vòng hiện
// đủ mọi từ đúng một lần, thứ tự mỗi vòng khác nhau và không lặp từ ở chỗ nối vòng.
final class WordMixTests: XCTestCase {
    private func item(_ id: String, _ word: String, bank: Bool = false) -> WidgetWordItem {
        WidgetWordItem(id: id, word: word, meaning: "nghĩa \(word)", isSaved: !bank, fromBank: bank)
    }

    private lazy var personal = (1...5).map { item("p\($0)", "saved\($0)") }
    private lazy var bank = (1...4).map { item("b\($0)", "bank\($0)", bank: true) }

    func testNormalize() {
        XCTAssertEqual(WordMix.normalize("  Hello   World! "), "hello world")
        XCTAssertEqual(WordMix.normalize("Resilient."), "resilient")
    }

    func testBankSkipsWordsUserAlreadyHas() {
        let mine = [item("p1", "Resilient"), item("p2", "eager")]
        let bank = [item("b1", " resilient ", bank: true), item("b2", "diligent", bank: true),
                    item("b3", "Diligent.", bank: true), item("b4", "EAGER", bank: true)]
        XCTAssertEqual(WordMix.bank(bank, excluding: mine).map(\.id), ["b2"])
    }

    func testDedupeKeepsFirst() {
        let list = [item("1", "Run"), item("2", "run "), item("3", "walk")]
        XCTAssertEqual(WordMix.dedupe(list).map(\.id), ["1", "3"])
    }

    // 5 từ của bạn + 3 từ kho (≈ một nửa) mỗi vòng, không lặp trong vòng
    func testEachCycleHasNoRepeats() {
        for cycle in 0..<20 {
            let seq = WordMix.rotation(personal: personal, bank: bank, cycle: cycle)
            XCTAssertEqual(seq.count, 8)
            XCTAssertEqual(Set(seq.map(\.id)).count, 8, "vòng \(cycle) lặp từ")
            XCTAssertEqual(seq.filter { !$0.fromBank }.count, 5, "mỗi vòng đủ mọi từ của bạn")
        }
    }

    // Kho nhiều hơn hẳn từ đã lưu: từ kho không được hiện liền nhau, át từ của bạn
    func testBigBankNeverCrowdsOutYourWords() {
        let mine = Array(personal.prefix(3))
        let big = (1...30).map { item("b\($0)", "bank\($0)", bank: true) }
        var prevBank = false
        for slot in 0..<300 {
            let w = WordMix.item(at: slot, personal: mine, bank: big)!
            XCTAssertFalse(prevBank && w.fromBank, "slot \(slot): hai từ kho liền nhau")
            prevBank = w.fromBank
        }
        // Qua nhiều vòng thì mọi từ kho đều được hiện
        let shown = Set((0..<300).compactMap { WordMix.item(at: $0, personal: mine, bank: big) }.filter(\.fromBank).map(\.id))
        XCTAssertEqual(shown.count, 30)
    }

    func testOrderChangesBetweenCycles() {
        let orders = Set((0..<6).map { WordMix.rotation(personal: personal, bank: bank, cycle: $0).map(\.id) })
        XCTAssertGreaterThan(orders.count, 3, "các vòng phải có thứ tự khác nhau")
    }

    func testMixesTwoSavedThenOneBank() {
        let seq = WordMix.rotation(personal: personal, bank: bank, cycle: 3)
        XCTAssertEqual(seq.map(\.fromBank), [false, false, true, false, false, true, false, true])
    }

    func testNoSameWordTwiceInARowAcrossCycles() {
        var last: String?
        for slot in 0..<(8 * 30) {
            let w = WordMix.item(at: slot, personal: personal, bank: bank)!
            XCTAssertNotEqual(w.id, last, "slot \(slot) lặp từ liền kề")
            last = w.id
        }
    }

    func testInputOrderDoesNotChangeRotation() {
        let a = WordMix.rotation(personal: personal, bank: bank, cycle: 2).map(\.id)
        let b = WordMix.rotation(personal: personal.reversed(), bank: bank.reversed(), cycle: 2).map(\.id)
        XCTAssertEqual(a, b)
    }

    func testBankOnlyAndEmpty() {
        XCTAssertEqual(WordMix.item(at: 0, personal: [], bank: bank)?.fromBank, true)
        XCTAssertNil(WordMix.item(at: 0, personal: [], bank: []))
    }

    // MARK: Lịch widget

    func testEntriesIncludeBankWhenEnabled() {
        var s = WidgetSettings()
        s.intervalMinutes = 15
        s.activeStartMinutes = 0
        s.activeEndMinutes = 0
        let words = WidgetSchedule.entries(words: personal, bank: bank, settings: s).compactMap(\.word)
        XCTAssertTrue(words.contains { $0.fromBank })
        s.includeBank = false
        let noBank = WidgetSchedule.entries(words: personal, bank: bank, settings: s).compactMap(\.word)
        XCTAssertFalse(noBank.contains { $0.fromBank })
    }

    func testCustomSourceNeverAddsBankWords() {
        var s = WidgetSettings()
        s.source = .custom
        s.selectedIds = ["p1", "p2"]
        s.activeStartMinutes = 0
        s.activeEndMinutes = 0
        let words = WidgetSchedule.entries(words: personal, bank: bank, settings: s).compactMap(\.word)
        XCTAssertEqual(Set(words.map(\.id)), ["p1", "p2"])
    }

    // MARK: Tương thích dữ liệu cũ trong App Group

    func testDecodesOldStoredData() throws {
        let oldSettings = #"{"source":"recent","selectedIds":[],"intervalMinutes":30,"activeStartMinutes":0,"activeEndMinutes":0,"showMeaning":false}"#
        let s = try JSONDecoder().decode(WidgetSettings.self, from: Data(oldSettings.utf8))
        XCTAssertEqual(s.source, .recent)
        XCTAssertEqual(s.intervalMinutes, 30)
        XCTAssertFalse(s.showMeaning)
        XCTAssertTrue(s.includeBank)

        let oldItem = #"{"id":"1","word":"run","meaning":"chạy","isSaved":true}"#
        let w = try JSONDecoder().decode(WidgetWordItem.self, from: Data(oldItem.utf8))
        XCTAssertFalse(w.fromBank)
    }
}
