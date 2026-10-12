import Foundation
import AuthenticationServices
import UIKit

enum AppleReauthError: Error, Equatable {
    case cancelled      // người dùng đóng sheet Apple — không xoá, không báo lỗi
    case missingCode    // Apple không trả authorizationCode
}

/// Xin lại authorizationCode từ Apple ngay trước khi xoá tài khoản, để server
/// đổi code lấy token rồi thu hồi (Guideline 5.1.1(v)). Không xin scope nào —
/// chỉ cần người dùng xác nhận lại bằng Face ID / mật khẩu Apple.
@MainActor
final class AppleReauth: NSObject {
    private var continuation: CheckedContinuation<String, Error>?
    private var controller: ASAuthorizationController?

    static func authorizationCode() async throws -> String {
        let reauth = AppleReauth()
        return try await reauth.run()
    }

    private func run() async throws -> String {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = []
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        // Giữ controller (và self qua delegate) sống tới khi Apple trả kết quả
        self.controller = controller
        defer { self.controller = nil }
        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<String, Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }

    /// ASAuthorizationError.canceled → .cancelled; lỗi khác giữ nguyên.
    nonisolated static func map(_ error: Error) -> Error {
        if let e = error as? ASAuthorizationError, e.code == .canceled { return AppleReauthError.cancelled }
        return error
    }

    nonisolated static func code(from data: Data?) throws -> String {
        guard let data, let code = String(data: data, encoding: .utf8), !code.isEmpty else {
            throw AppleReauthError.missingCode
        }
        return code
    }
}

extension AppleReauth: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithAuthorization authorization: ASAuthorization) {
        let data = (authorization.credential as? ASAuthorizationAppleIDCredential)?.authorizationCode
        let result = Result { try Self.code(from: data) }
        MainActor.assumeIsolated { finish(result) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController,
                                             didCompleteWithError error: Error) {
        let mapped = Self.map(error)
        MainActor.assumeIsolated { finish(.failure(mapped)) }
    }
}

extension AppleReauth: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
            return scene?.windows.first { $0.isKeyWindow } ?? scene?.windows.first ?? ASPresentationAnchor()
        }
    }
}
