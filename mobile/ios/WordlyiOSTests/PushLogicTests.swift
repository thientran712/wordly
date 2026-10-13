import XCTest
import UserNotifications
@testable import Wordly

final class PushLogicTests: XCTestCase {
    func testShouldSyncOncePerDayUnlessForced() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(PushLogic.shouldSync(lastSync: nil, now: now, force: false))
        XCTAssertFalse(PushLogic.shouldSync(lastSync: now.addingTimeInterval(-3600), now: now, force: false))
        XCTAssertTrue(PushLogic.shouldSync(lastSync: now.addingTimeInterval(-24 * 3600), now: now, force: false))
        XCTAssertTrue(PushLogic.shouldSync(lastSync: now, now: now, force: true))
    }

    /// Chuỗi y hệt server tạo (web/tests/unit/push-build-message.test.mjs) — Review Focus #1.
    func testLinkFromServerDecodesSpecialCharacters() throws {
        let info: [AnyHashable: Any] = ["link": "wordly://word?id=1&w=make%20up&m=a%2Bb%20%26%20c%20%23%20d&bank=0"]
        let url = try XCTUnwrap(PushLogic.linkURL(from: info))
        let link = try XCTUnwrap(WidgetDeepLink(url: url))
        XCTAssertEqual(link.word, "make up")
        XCTAssertEqual(link.meaning, "a+b & c # d")
        XCTAssertFalse(link.fromBank)
    }

    func testLinkVietnameseAndBank() throws {
        let info: [AnyHashable: Any] = ["link": "wordly://word?id=bank-42&w=go&m=%C4%91i&bank=1"]
        let link = try XCTUnwrap(WidgetDeepLink(url: XCTUnwrap(PushLogic.linkURL(from: info))))
        XCTAssertEqual(link.meaning, "đi")
        XCTAssertEqual(link.bankWordId, "42")
    }

    func testLinkRejectsMissingOrForeign() {
        XCTAssertNil(PushLogic.linkURL(from: [:]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": 5]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": "https://evil.example/word?id=1&w=x"]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": "wordly://word?id=&w=x"]))
    }

    func testOfferPromptOnlyOnceAndOnlyWhenUndecided() {
        XCTAssertTrue(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .notDetermined, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: true, status: .notDetermined, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .authorized, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .denied, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .notDetermined, pushAvailable: false))
    }

    func testMissingFirebasePlistIsDetected() {
        XCTAssertFalse(PushLogic.hasFirebaseConfig(Bundle(for: PushLogicTests.self)))
    }
}
