import Foundation
import Supabase

/// Body của DELETE /api/account khi người dùng đăng nhập bằng Apple — server
/// dùng code này để thu hồi token Apple trước khi xoá (Guideline 5.1.1(v)).
struct DeleteAccountBody: Encodable, Equatable {
    let appleAuthorizationCode: String
}

/// Logic thuần của luồng xoá tài khoản — tách khỏi AuthManager để test được.
enum AccountDeletion {
    /// Người dùng từng đăng nhập bằng Apple? Xem identities trước, rồi app_metadata
    /// (providers / provider) — giống cách server nhận diện.
    static func isAppleUser(_ user: User?) -> Bool {
        guard let user else { return false }
        if user.identities?.contains(where: { $0.provider == "apple" }) == true { return true }
        if let providers = user.appMetadata["providers"]?.arrayValue,
           providers.contains(where: { $0.stringValue == "apple" }) { return true }
        return user.appMetadata["provider"]?.stringValue == "apple"
    }

    /// Không có code → nil = không gửi body, giống hệt bản cũ.
    static func body(appleAuthorizationCode code: String?) -> DeleteAccountBody? {
        guard let code, !code.isEmpty else { return nil }
        return DeleteAccountBody(appleAuthorizationCode: code)
    }

    /// Người dùng Apple: xin lại authorizationCode trước. Huỷ (hoặc lỗi) ở bước
    /// Apple thì dừng luôn, KHÔNG gọi server xoá.
    static func run(
        isAppleUser: Bool,
        reauthorize: () async throws -> String,
        deleteOnServer: (String?) async throws -> Void
    ) async throws {
        let code = isAppleUser ? try await reauthorize() : nil
        try await deleteOnServer(code)
    }

    /// Người dùng tự đóng sheet Apple — không phải lỗi, không báo gì.
    static func isCancellation(_ error: Error) -> Bool {
        (error as? AppleReauthError) == .cancelled
    }
}
