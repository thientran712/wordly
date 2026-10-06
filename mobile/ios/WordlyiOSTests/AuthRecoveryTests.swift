import XCTest
@testable import Wordly

// 401 từ web API: thử làm mới phiên 1 lần rồi gọi lại; vẫn 401 thì đăng xuất
// để người dùng về màn đăng nhập thay vì kẹt với thông báo lỗi chung.
final class AuthRecoveryTests: XCTestCase {
    private final class Counter: @unchecked Sendable {
        var performs = 0, refreshes = 0, signOuts = 0
    }

    func testSuccessDoesNotRefresh() async throws {
        let c = Counter()
        let value = try await AuthRecovery.run(
            { c.performs += 1; return "ok" },
            refresh: { c.refreshes += 1 },
            signOut: { c.signOuts += 1 }
        )
        XCTAssertEqual(value, "ok")
        XCTAssertEqual([c.performs, c.refreshes, c.signOuts], [1, 0, 0])
    }

    func testUnauthorizedThenSuccessAfterRefresh() async throws {
        let c = Counter()
        let value = try await AuthRecovery.run(
            { () async throws -> String in
                c.performs += 1
                if c.performs == 1 { throw APIError.unauthorized }
                return "ok"
            },
            refresh: { c.refreshes += 1 },
            signOut: { c.signOuts += 1 }
        )
        XCTAssertEqual(value, "ok")
        XCTAssertEqual([c.performs, c.refreshes, c.signOuts], [2, 1, 0])
    }

    func testUnauthorizedTwiceSignsOut() async {
        let c = Counter()
        do {
            _ = try await AuthRecovery.run(
                { () async throws -> String in c.performs += 1; throw APIError.unauthorized },
                refresh: { c.refreshes += 1 },
                signOut: { c.signOuts += 1 }
            )
            XCTFail("phải throw")
        } catch APIError.unauthorized {
        } catch { XCTFail("sai lỗi: \(error)") }
        XCTAssertEqual([c.performs, c.refreshes, c.signOuts], [2, 1, 1])
    }

    func testRefreshFailureSignsOutWithoutRetry() async {
        struct RefreshFailed: Error {}
        let c = Counter()
        do {
            _ = try await AuthRecovery.run(
                { () async throws -> String in c.performs += 1; throw APIError.unauthorized },
                refresh: { c.refreshes += 1; throw RefreshFailed() },
                signOut: { c.signOuts += 1 }
            )
            XCTFail("phải throw")
        } catch APIError.unauthorized {
        } catch { XCTFail("sai lỗi: \(error)") }
        XCTAssertEqual([c.performs, c.refreshes, c.signOuts], [1, 1, 1])
    }

    func testOtherErrorsPassThroughUntouched() async {
        let c = Counter()
        do {
            _ = try await AuthRecovery.run(
                { () async throws -> String in c.performs += 1; throw APIError.serverError("HTTP 500") },
                refresh: { c.refreshes += 1 },
                signOut: { c.signOuts += 1 }
            )
            XCTFail("phải throw")
        } catch APIError.serverError {
        } catch { XCTFail("sai lỗi: \(error)") }
        XCTAssertEqual([c.performs, c.refreshes, c.signOuts], [1, 0, 0])
    }
}
