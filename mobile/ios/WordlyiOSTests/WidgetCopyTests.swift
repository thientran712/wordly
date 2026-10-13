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
               WidgetCopy.inlineSignedOut, WidgetCopy.homeSignedOut, WidgetCopy.homeResting, WidgetCopy.homeEmpty]
    }

    func testEnoughVariety() {
        XCTAssertGreaterThanOrEqual(WidgetCopy.hiddenMeaningPrompts.count, 8)
        XCTAssertGreaterThanOrEqual(WidgetCopy.taglines.count, 12)
        XCTAssertGreaterThanOrEqual(WidgetCopy.scatterEmoji.count, 10)
    }

    /// Bản v2 (13/10/2026): cùng bộ câu trend với push — có meme mạng.
    func testUsesTrendCopyLikePush() {
        let all = (WidgetCopy.hiddenMeaningPrompts + WidgetCopy.taglines).joined(separator: " ")
        for meme in ["Ét o ét", "cái nịt", "Đúng nhận sai cãi", "Ai sợ thì đi về"] {
            XCTAssertTrue(all.contains(meme), "thiếu \(meme)")
        }
    }

    /// Icon lộn xộn trên widget màn hình chính: cùng từ → cùng bố cục (widget vẽ
    /// lại không nhảy), từ khác → bố cục khác; nằm trong khung, không trùng chỗ.
    func testScatterStableInsideAndVaried() {
        let a = WidgetCopy.scatter(seed: "word-1")
        XCTAssertEqual(a, WidgetCopy.scatter(seed: "word-1"))
        XCTAssertEqual(a.count, 4)
        XCTAssertEqual(Set(a.map(\.emoji)).count, a.count, "không lặp emoji")
        XCTAssertEqual(Set(a.map { "\($0.x),\($0.y)" }).count, a.count, "không chồng chỗ")
        for icon in a {
            XCTAssertTrue(WidgetCopy.scatterEmoji.contains(icon.emoji))
            XCTAssertTrue((0...1).contains(icon.x) && (0...1).contains(icon.y))
            XCTAssertTrue((-30...30).contains(icon.rotation))
            XCTAssertTrue((14...24).contains(icon.size))
        }
        let layouts = Set((0..<20).map { WidgetCopy.scatter(seed: "w-\($0)").map(\.emoji).joined() })
        XCTAssertGreaterThan(layouts.count, 5)
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

    /// Widget màn hình chính đã có emoji to phía trên → câu dưới không lặp emoji,
    /// và trạng thái chưa đăng nhập vẫn phải nói rõ "đăng nhập".
    func testHomeEmptyStatesHaveNoEmojiAndSayWhatToDo() {
        for line in [WidgetCopy.homeSignedOut, WidgetCopy.homeResting, WidgetCopy.homeEmpty] {
            XCTAssertEqual(emojiCount(line), 0, line)
        }
        XCTAssertTrue(WidgetCopy.homeSignedOut.lowercased().contains("đăng nhập"))
    }
}
