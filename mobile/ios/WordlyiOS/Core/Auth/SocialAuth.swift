import Foundation
import CryptoKit
import AuthenticationServices

/// Hỗ trợ đăng nhập Google (OAuth qua Supabase) + Apple (id token + nonce).
enum SocialAuth {
    enum Failure: Error {
        case cancelled      // người dùng đóng cửa sổ đăng nhập — không phải lỗi
        case missingToken
    }

    /// Nonce ngẫu nhiên: Apple nhận bản băm, Supabase nhận bản gốc để đối chiếu
    /// (chống dùng lại id token).
    static func randomNonce(length: Int = 32) -> String {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var generator = SystemRandomNumberGenerator()
        return String((0..<length).map { _ in charset.randomElement(using: &generator)! })
    }

    static func sha256(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Supabase chuyển về app qua URL scheme = bundle ID (đã khai báo trong project.yml).
    /// URL này phải nằm trong Supabase → Auth → URL Configuration → Redirect URLs.
    static func redirectURL(bundleId: String = Bundle.main.bundleIdentifier ?? "com.thientran.wordly") -> URL {
        URL(string: "\(bundleId)://login-callback")!
    }

    /// Câu báo lỗi cho người dùng; nil = không cần báo (vd. tự huỷ).
    static func userMessage(for error: Error) -> String? {
        if let f = error as? Failure {
            switch f {
            case .cancelled: return nil
            case .missingToken: return "Không nhận được thông tin đăng nhập. Thử lại nhé."
            }
        }
        // Người dùng tự đóng cửa sổ Google / Apple — mô tả lỗi không chứa chữ "cancel"
        if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { return nil }
        if let e = error as? ASAuthorizationError, e.code == .canceled { return nil }
        let text = error.localizedDescription.lowercased()
        if text.contains("cancel") { return nil }
        if text.contains("provider is not enabled") || text.contains("unsupported provider") {
            return "Phương thức đăng nhập này chưa được bật trên máy chủ."
        }
        if text.contains("network") || text.contains("internet") {
            return "Lỗi kết nối mạng. Kiểm tra internet và thử lại."
        }
        return "Đăng nhập không thành công. Thử lại nhé."
    }
}
