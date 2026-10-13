import XCTest
@testable import Wordly

// Câu chữ widget giọng "bạn thân lầy" (mày–tao, chủ dự án duyệt 13/10/2026):
// câu khi ẩn nghĩa, trạng thái trống, dòng chọc trên widget màn hình chính.
final class WidgetCopyTests: XCTestCase {
    private let forbidden = ["ngu", "dốt", "đần", "đm", "vcl", "vl", "đéo", "địt", "cút"]

    private func emojiCount(_ s: String) -> Int {
        s.unicodeScalars.filter { $0.properties.isEmojiPresentation || ($0.properties.isEmoji && $0.value > 0x2000) }.count
    }

    private var allLines: [String] {
        WidgetCopy.hiddenMeaningPrompts + WidgetCopy.taglines
            + [WidgetCopy.restingTitle, WidgetCopy.restingSubtitle, WidgetCopy.emptyTitle, WidgetCopy.emptySubtitle,
               WidgetCopy.signedOutTitle, WidgetCopy.signedOutSubtitle, WidgetCopy.inlineEmpty, WidgetCopy.inlineResting,
               WidgetCopy.inlineSignedOut]
    }

    func testEnoughVariety() {
        XCTAssertGreaterThanOrEqual(WidgetCopy.hiddenMeaningPrompts.count, 5)
        XCTAssertGreaterThanOrEqual(WidgetCopy.taglines.count, 8)
    }

    func testTaglinesShortEnoughForOneLine() {
        for t in WidgetCopy.taglines { XCTAssertLessThanOrEqual(t.count, 28, t) }
    }

    func testNoForbiddenWordsAndAtMostTwoEmoji() {
        for line in allLines {
            let words = line.lowercased().components(separatedBy: CharacterSet.letters.inverted)
            for bad in forbidden { XCTAssertFalse(words.contains(bad), "\(line) chứa \(bad)") }
            XCTAssertLessThanOrEqual(emojiCount(line), 2, line)
        }
    }

    /// Widget chạy ở tiến trình khác app và mỗi lần nạp lại timeline — Swift
    /// `hashValue` đổi theo tiến trình nên KHÔNG được dùng; cùng từ phải ra cùng câu.
    func testPickIsStableAndSpreads() {
        XCTAssertEqual(WidgetCopy.pick(WidgetCopy.taglines, seed: "abc-123"), WidgetCopy.pick(WidgetCopy.taglines, seed: "abc-123"))
        let picks = Set((0..<40).map { WidgetCopy.pick(WidgetCopy.taglines, seed: "word-\($0)") })
        XCTAssertGreaterThan(picks.count, 4, "các từ khác nhau phải ra câu khác nhau")
        XCTAssertEqual(WidgetCopy.stableHash("abc"), WidgetCopy.stableHash("abc"))
        XCTAssertEqual(WidgetCopy.stableHash(""), 0)
    }

    /// Dòng chọc chỉ hiện khi còn chỗ — nghĩa dài thì ẩn, không bao giờ cắt nghĩa.
    func testTaglineOnlyWhenRoomLeft() {
        XCTAssertTrue(WidgetCopy.showsTagline(word: "resilient", meaning: "kiên cường", medium: true))
        XCTAssertTrue(WidgetCopy.showsTagline(word: "resilient", meaning: "kiên cường", medium: false))
        XCTAssertFalse(WidgetCopy.showsTagline(word: "resilient", meaning: String(repeating: "a", count: 81), medium: true))
        XCTAssertFalse(WidgetCopy.showsTagline(word: "resilient", meaning: String(repeating: "a", count: 36), medium: false))
        XCTAssertFalse(WidgetCopy.showsTagline(word: "take something for granted", meaning: "coi là đương nhiên", medium: false))
        XCTAssertTrue(WidgetCopy.showsTagline(word: "take something for granted", meaning: "coi là đương nhiên", medium: true))
    }
}
