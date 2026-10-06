import XCTest
@testable import Wordly

// Vòng quay luyện nói — giống web /speak (useSpinHistory, excludeSpun, TimerModal).
final class SpinnerLogicTests: XCTestCase {
    private func items(_ ids: [Int], category: String? = "part1") -> [SpinnerItem] {
        ids.map { SpinnerItem(id: $0, text: "Q\($0)", category: category, framework: nil) }
    }

    // Đã quay thì bỏ khỏi vòng tới khi xoá khỏi lịch sử; quay hết thì dùng lại cả pool
    func testExcludeSpunRemovesHistoryButNeverEmptiesWheel() {
        XCTAssertEqual(SpinnerLogic.excludeSpun(items([1, 2, 3]), excluded: [2]).map(\.id), [1, 3])
        XCTAssertEqual(SpinnerLogic.excludeSpun(items([1, 2]), excluded: [1, 2]).map(\.id), [1, 2])
        XCTAssertEqual(SpinnerLogic.excludeSpun(items([1, 2]), excluded: []).map(\.id), [1, 2])
    }

    func testFilterByCategoryFallsBackToAll() {
        let pool = items([1, 2], category: "part1") + items([3], category: "part2")
        XCTAssertEqual(SpinnerLogic.filter(pool, category: "part2").map(\.id), [3])
        XCTAssertEqual(SpinnerLogic.filter(pool, category: nil).count, 3)
        XCTAssertEqual(SpinnerLogic.filter(pool, category: "part3").count, 3)
    }

    func testTimerSecondsByIeltsPart() {
        XCTAssertEqual(SpinnerLogic.defaultSeconds(mode: .ielts, item: items([1], category: "part2")[0]), 120)
        XCTAssertEqual(SpinnerLogic.defaultSeconds(mode: .ielts, item: items([1], category: "part1")[0]), 60)
        XCTAssertEqual(SpinnerLogic.defaultSeconds(mode: .interview, item: nil), 60)
    }

    func testRecommendedFramework() {
        XCTAssertEqual(SpinnerLogic.recommendedFramework(mode: .ielts, item: items([1], category: "part2")[0])?.id, "area")
        let star = SpinnerItem(id: 9, text: "x", category: "behavioral", framework: "star")
        XCTAssertEqual(SpinnerLogic.recommendedFramework(mode: .interview, item: star)?.id, "star")
        XCTAssertNil(SpinnerLogic.recommendedFramework(mode: .deepTalk, item: star))
    }

    func testModeMetadataMatchesWeb() {
        XCTAssertEqual(SpinnerMode.ielts.itemType, "topic")
        XCTAssertEqual(SpinnerMode.interview.itemType, "interview")
        XCTAssertEqual(SpinnerMode.deepTalk.itemType, "deep_talk")
        XCTAssertEqual(SpinnerMode.ielts.vocabKind, "ielts")
        XCTAssertEqual(SpinnerMode.deepTalk.categories.count, 5)
        XCTAssertEqual(SpinnerMode.interview.categories.map(\.code), ["behavioral", "consulting"])
    }

    func testCountdownTicksAndFinishes() {
        var t = CountdownTimer(total: 3)
        t.start()
        t.tick(); t.tick()
        XCTAssertEqual(t.remaining, 1)
        XCTAssertFalse(t.finished)
        t.tick()
        XCTAssertEqual(t.remaining, 0)
        XCTAssertTrue(t.finished)
        XCTAssertFalse(t.running)
        t.tick()
        XCTAssertEqual(t.remaining, 0)
    }

    func testCountdownAdjustWithinBounds() {
        var t = CountdownTimer(total: 60)
        t.adjust(by: 15)
        XCTAssertEqual(t.total, 75)
        t.adjust(by: -100)
        XCTAssertEqual(t.total, 15)
        XCTAssertEqual(t.remaining, 15)
    }
}
