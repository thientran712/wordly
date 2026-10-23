import XCTest
@testable import Wordly

// Chống bấm dồn: nút phát âm / mic / lưu / tra nghĩa không nhận chạm liên tục,
// và chỉ một nguồn phát âm tại một thời điểm.
final class TapControlTests: XCTestCase {
    func testThrottleAllowsFirstTapThenBlocksUntilIntervalPasses() {
        var throttle = TapThrottle(interval: 0.5)
        let t0 = Date(timeIntervalSince1970: 1000)
        XCTAssertTrue(throttle.allow(at: t0))
        XCTAssertFalse(throttle.allow(at: t0.addingTimeInterval(0.1)))
        XCTAssertFalse(throttle.allow(at: t0.addingTimeInterval(0.49)))
        XCTAssertTrue(throttle.allow(at: t0.addingTimeInterval(0.5)))
    }

    func testBlockedTapDoesNotExtendTheWindow() {
        var throttle = TapThrottle(interval: 0.5)
        let t0 = Date(timeIntervalSince1970: 1000)
        XCTAssertTrue(throttle.allow(at: t0))
        XCTAssertFalse(throttle.allow(at: t0.addingTimeInterval(0.4)))
        XCTAssertTrue(throttle.allow(at: t0.addingTimeInterval(0.6)))
    }

    func testSpeakGateStartsWhenIdle() {
        XCTAssertEqual(SpeakGate.decide(requested: "en-US|run", active: nil), .start)
    }

    func testSpeakGateSameButtonStopsPlayback() {
        XCTAssertEqual(SpeakGate.decide(requested: "en-US|run", active: "en-US|run"), .stop)
    }

    func testSpeakGateOtherButtonIsIgnoredWhilePlaying() {
        XCTAssertEqual(SpeakGate.decide(requested: "en-GB|run", active: "en-US|run"), .ignore)
        XCTAssertEqual(SpeakGate.decide(requested: "en-US|walk", active: "en-US|run"), .ignore)
    }

    func testSpeakKeyCombinesLangAndTrimmedText() {
        XCTAssertEqual(SpeakGate.key(text: " run ", lang: "en-US"), "en-US|run")
        XCTAssertNotEqual(SpeakGate.key(text: "run", lang: "en-US"), SpeakGate.key(text: "run", lang: "en-GB"))
    }

    func testDictationLimitIs30Seconds() {
        XCTAssertEqual(DictationLimit.maxSeconds, 30)
    }

    func testDictationRemainingCountsDownAndStopsAtZero() {
        let start = Date(timeIntervalSince1970: 1000)
        XCTAssertEqual(DictationLimit.remaining(startedAt: start, now: start), 30)
        XCTAssertEqual(DictationLimit.remaining(startedAt: start, now: start.addingTimeInterval(6.2)), 24)
        XCTAssertEqual(DictationLimit.remaining(startedAt: start, now: start.addingTimeInterval(29.5)), 1)
        XCTAssertEqual(DictationLimit.remaining(startedAt: start, now: start.addingTimeInterval(30)), 0)
        XCTAssertEqual(DictationLimit.remaining(startedAt: start, now: start.addingTimeInterval(45)), 0)
        XCTAssertFalse(DictationLimit.isOver(startedAt: start, now: start.addingTimeInterval(29.9)))
        XCTAssertTrue(DictationLimit.isOver(startedAt: start, now: start.addingTimeInterval(30)))
    }

    func testDictationLabelFormatsMinutesSeconds() {
        XCTAssertEqual(DictationLimit.label(remaining: 30), "0:30")
        XCTAssertEqual(DictationLimit.label(remaining: 5), "0:05")
    }
}
