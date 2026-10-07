import XCTest
@testable import Wordly

// Từ kho cho widget: đúng trình độ (khớp email trên web) và đổi lô mỗi ngày.
final class BankWordsTests: XCTestCase {
    func testLevelsMatchWeb() {
        XCTAssertEqual(BankWords.levels(for: "B1"), ["B1", "B2"])
        XCTAssertEqual(BankWords.levels(for: "C2"), ["C2"])
        XCTAssertEqual(BankWords.levels(for: nil), ["B1", "B2"])
        XCTAssertEqual(BankWords.levels(for: "beginner"), ["B1", "B2"])
    }

    func testRefreshOncePerDayOrWhenLevelChanges() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        XCTAssertTrue(BankWords.needsRefresh(fetchedAt: nil, level: "B1", lastLevel: nil, now: now))
        XCTAssertFalse(BankWords.needsRefresh(fetchedAt: now.addingTimeInterval(-3600), level: "B1", lastLevel: "B1", now: now))
        XCTAssertTrue(BankWords.needsRefresh(fetchedAt: now.addingTimeInterval(-25 * 3600), level: "B1", lastLevel: "B1", now: now))
        XCTAssertTrue(BankWords.needsRefresh(fetchedAt: now.addingTimeInterval(-60), level: "C1", lastLevel: "B1", now: now))
    }

    func testOffsetStaysInRange() {
        for day in 0..<50 {
            let o = BankWords.offset(total: 500, batch: 30, day: day)
            XCTAssertTrue((0...470).contains(o))
        }
        XCTAssertEqual(BankWords.offset(total: 10, batch: 30, day: 3), 0)
        // Ngày khác nhau → lô khác nhau
        XCTAssertGreaterThan(Set((0..<10).map { BankWords.offset(total: 5000, batch: 30, day: $0) }).count, 5)
    }
}
