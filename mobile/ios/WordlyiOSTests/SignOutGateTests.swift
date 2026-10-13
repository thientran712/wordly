import XCTest
@testable import Wordly

/// Review #1 (Critical): signOut → huỷ token push gọi API → 401 → AuthRecovery
/// làm mới thất bại → signOut → … lặp vô hạn. SignOutGate chặn gọi lồng.
final class SignOutGateTests: XCTestCase {
    func testNestedSignOutThroughAuthRecoveryRunsOnce() async {
        let gate = SignOutGate()
        var signOuts = 0
        var depth = 0

        func signOut() async {
            await gate.run {
                signOuts += 1
                depth += 1
                guard depth < 50 else { return } // chặn treo test nếu cổng hỏng
                // Như PushManager.unregister: gọi API qua AuthRecovery, phiên đã chết
                _ = try? await AuthRecovery.run(
                    { () async throws -> Int in throw APIError.unauthorized },
                    refresh: { throw APIError.unauthorized },
                    signOut: { await signOut() })
            }
        }

        await signOut()
        XCTAssertEqual(signOuts, 1)
    }

    func testGateOpensAgainAfterFinishing() async {
        let gate = SignOutGate()
        var runs = 0
        await gate.run { runs += 1 }
        await gate.run { runs += 1 }
        XCTAssertEqual(runs, 2)
    }
}
