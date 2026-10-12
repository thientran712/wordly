import XCTest
import AuthenticationServices
import Supabase
@testable import Wordly

// Xoá tài khoản + thu hồi token Apple (Guideline 5.1.1(v)).
// Luồng giao diện thật (sheet Apple) không unit test được — chỉ test logic.
final class AccountDeletionTests: XCTestCase {
    private func user(identities: [String]? = nil, appMetadata: [String: AnyJSON] = [:]) -> User {
        let id = UUID()
        return User(
            id: id,
            appMetadata: appMetadata,
            userMetadata: [:],
            aud: "authenticated",
            createdAt: Date(),
            updatedAt: Date(),
            identities: identities?.map {
                UserIdentity(id: UUID().uuidString, identityId: UUID(), userId: id, identityData: [:],
                             provider: $0, createdAt: nil, lastSignInAt: nil, updatedAt: nil)
            }
        )
    }

    // MARK: Nhận diện người dùng Apple

    func testAppleIdentityIsAppleUser() {
        XCTAssertTrue(AccountDeletion.isAppleUser(user(identities: ["apple"])))
        XCTAssertTrue(AccountDeletion.isAppleUser(user(identities: ["email", "apple"])))
    }

    func testAppMetadataProvidersIsAppleUser() {
        XCTAssertTrue(AccountDeletion.isAppleUser(user(appMetadata: ["providers": ["email", "apple"]])))
        XCTAssertTrue(AccountDeletion.isAppleUser(user(appMetadata: ["provider": "apple"])))
    }

    func testNonAppleUser() {
        XCTAssertFalse(AccountDeletion.isAppleUser(user(identities: ["email"], appMetadata: ["providers": ["email"]])))
        XCTAssertFalse(AccountDeletion.isAppleUser(user(identities: ["google"], appMetadata: ["provider": "google"])))
        XCTAssertFalse(AccountDeletion.isAppleUser(nil))
    }

    // MARK: Body gửi lên DELETE /api/account

    func testBodyWithCodeEncodesAppleAuthorizationCode() throws {
        let body = try XCTUnwrap(AccountDeletion.body(appleAuthorizationCode: "abc.123"))
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: String]
        XCTAssertEqual(json, ["appleAuthorizationCode": "abc.123"])
    }

    // Không có code → không gửi body, giống hệt bản cũ
    func testNoCodeMeansNoBody() {
        XCTAssertNil(AccountDeletion.body(appleAuthorizationCode: nil))
        XCTAssertNil(AccountDeletion.body(appleAuthorizationCode: ""))
    }

    // MARK: Luồng xoá

    func testAppleUserReauthorizesThenDeletesWithCode() async throws {
        var deletedWith: [String?] = []
        try await AccountDeletion.run(
            isAppleUser: true,
            reauthorize: { "fresh-code" },
            deleteOnServer: { deletedWith.append($0) }
        )
        XCTAssertEqual(deletedWith, ["fresh-code"])
    }

    func testAppleUserCancelDoesNotCallServer() async {
        var serverCalled = false
        do {
            try await AccountDeletion.run(
                isAppleUser: true,
                reauthorize: { throw AppleReauthError.cancelled },
                deleteOnServer: { _ in serverCalled = true }
            )
            XCTFail("phải throw cancelled")
        } catch {
            XCTAssertEqual(error as? AppleReauthError, .cancelled)
        }
        XCTAssertFalse(serverCalled)
    }

    func testNonAppleUserSkipsReauthAndSendsNoCode() async throws {
        var reauthCalled = false
        var deletedWith: [String?] = []
        try await AccountDeletion.run(
            isAppleUser: false,
            reauthorize: { reauthCalled = true; return "x" },
            deleteOnServer: { deletedWith.append($0) }
        )
        XCTAssertFalse(reauthCalled)
        XCTAssertEqual(deletedWith, [nil])
    }

    func testCancellationIsSilent() {
        XCTAssertTrue(AccountDeletion.isCancellation(AppleReauthError.cancelled))
        XCTAssertFalse(AccountDeletion.isCancellation(AppleReauthError.missingCode))
        XCTAssertFalse(AccountDeletion.isCancellation(APIError.unauthorized))
    }

    // MARK: AppleReauth — xử lý kết quả từ Apple

    func testSystemCancelMapsToCancelled() {
        let mapped = AppleReauth.map(ASAuthorizationError(.canceled))
        XCTAssertEqual(mapped as? AppleReauthError, .cancelled)
        let other = AppleReauth.map(ASAuthorizationError(.failed))
        XCTAssertNil(other as? AppleReauthError)
    }

    func testAuthorizationCodeDecodesUTF8() throws {
        XCTAssertEqual(try AppleReauth.code(from: Data("c0de".utf8)), "c0de")
        XCTAssertThrowsError(try AppleReauth.code(from: nil)) {
            XCTAssertEqual($0 as? AppleReauthError, .missingCode)
        }
        XCTAssertThrowsError(try AppleReauth.code(from: Data())) {
            XCTAssertEqual($0 as? AppleReauthError, .missingCode)
        }
    }
}
