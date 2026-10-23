import XCTest
@testable import Wordly

/// Hết lượt dịch → xem quảng cáo thưởng → chờ server cộng lượt (spec 2026-10-23).
final class RewardFlowTests: XCTestCase {
    func testAfterAd() {
        XCTAssertEqual(RewardFlow.afterAd(.earned), .poll)
        XCTAssertEqual(RewardFlow.afterAd(.dismissed), .stay)
        XCTAssertEqual(RewardFlow.afterAd(.failed), .fallback)
    }

    func testAfterPoll() {
        XCTAssertEqual(RewardFlow.afterPoll(creditsBefore: 5, creditsNow: 15, elapsed: 2), .retry)
        XCTAssertEqual(RewardFlow.afterPoll(creditsBefore: 5, creditsNow: 5, elapsed: 3), .poll)
        XCTAssertEqual(RewardFlow.afterPoll(creditsBefore: 5, creditsNow: nil, elapsed: 3), .poll)
        XCTAssertEqual(RewardFlow.afterPoll(creditsBefore: 5, creditsNow: 5, elapsed: 10), .fallback)
    }

    func testLimitTranslateFromServer() {
        let body = Data(#"{"error":"Bạn đã dùng hết lượt dịch hôm nay. Xem một quảng cáo ngắn để nhận thêm 10 lượt.","code":"limit_translate","limit":10,"ad_available":true}"#.utf8)
        guard case .limitReached(let code, let msg, let limit) = APIError.from(status: 402, body: body) else {
            return XCTFail("phải là limitReached")
        }
        XCTAssertEqual(code, .translate)
        XCTAssertTrue(msg.contains("10 lượt"))
        XCTAssertEqual(limit, 10)
    }

    // MARK: Theme đặc biệt (Task 11) — không có lượt dự phòng

    func testThemeAfterAd() {
        XCTAssertEqual(RewardFlow.themeAfterAd(.earned), .poll)
        XCTAssertEqual(RewardFlow.themeAfterAd(.dismissed), .stay)
        XCTAssertEqual(RewardFlow.themeAfterAd(.failed), .adFailed)
    }

    func testThemeAfterPoll() {
        XCTAssertEqual(RewardFlow.themeAfterPoll(themeId: "space_1", unlocked: ["space_1"], elapsed: 2), .apply)
        XCTAssertEqual(RewardFlow.themeAfterPoll(themeId: "space_1", unlocked: ["luxury_2"], elapsed: 3), .poll)
        XCTAssertEqual(RewardFlow.themeAfterPoll(themeId: "space_1", unlocked: [], elapsed: 10), .unconfirmed)
    }

}
