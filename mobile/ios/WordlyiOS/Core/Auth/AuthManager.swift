import Foundation
import Supabase

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated = false
    @Published var isLoading = true
    @Published var currentUser: User?
    @Published var authError: String?

    let supabase: SupabaseClient

    private init() {
        supabase = SupabaseClient(
            supabaseURL: URL(string: WordlyConfig.supabaseURL)!,
            supabaseKey: WordlyConfig.supabaseAnonKey
        )
        #if DEBUG
        if PreviewMode.isOn {
            isAuthenticated = true
            isLoading = false
            return
        }
        #endif
        Task { await checkSession() }
    }

    // MARK: - Session
    func checkSession() async {
        isLoading = true
        do {
            let session = try await supabase.auth.session
            currentUser = session.user
            isAuthenticated = true
        } catch {
            isAuthenticated = false
            currentUser = nil
        }
        isLoading = false

        // Listen for auth state changes
        for await state in await supabase.auth.authStateChanges {
            switch state.event {
            case .signedIn:
                currentUser = state.session?.user
                isAuthenticated = true
            case .signedOut, .userDeleted:
                currentUser = nil
                isAuthenticated = false
            case .tokenRefreshed:
                currentUser = state.session?.user
            default:
                break
            }
        }
    }

    func currentToken() async -> String? {
        try? await supabase.auth.session.accessToken
    }

    // MARK: - Sign In
    func signIn(email: String, password: String) async throws {
        authError = nil
        do {
            let session = try await supabase.auth.signIn(email: email, password: password)
            currentUser = session.user
            isAuthenticated = true
        } catch {
            authError = localizedAuthError(error)
            throw error
        }
    }

    // MARK: - Google (OAuth qua Supabase, giống web)
    /// Mở cửa sổ đăng nhập Google (ASWebAuthenticationSession), Supabase trả về app
    /// qua SocialAuth.redirectURL. Người dùng tự đóng cửa sổ → không báo lỗi.
    func signInWithGoogle() async {
        authError = nil
        do {
            let session = try await supabase.auth.signInWithOAuth(
                provider: .google,
                redirectTo: SocialAuth.redirectURL()
            )
            currentUser = session.user
            isAuthenticated = true
        } catch {
            authError = SocialAuth.userMessage(for: error)
        }
    }

    // MARK: - Apple (Sign in with Apple native → id token cho Supabase)
    func signInWithApple(idToken: String?, rawNonce: String, fullName: String?) async {
        authError = nil
        guard let idToken else {
            authError = SocialAuth.userMessage(for: SocialAuth.Failure.missingToken)
            return
        }
        do {
            let session = try await supabase.auth.signInWithIdToken(
                credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: rawNonce)
            )
            currentUser = session.user
            isAuthenticated = true
            // Apple chỉ gửi tên ở lần đăng nhập đầu tiên → lưu ngay vào hồ sơ
            if let fullName, !fullName.isEmpty {
                _ = try? await APIClient.shared.updateProfile(name: fullName, skillLevel: nil, learningGoal: nil)
            }
        } catch {
            authError = SocialAuth.userMessage(for: error)
        }
    }

    // MARK: - Sign Up
    func signUp(email: String, password: String, name: String? = nil) async throws {
        authError = nil
        do {
            var metadata: [String: AnyJSON]? = nil
            if let name, !name.isEmpty {
                metadata = ["name": .string(name)]
            }
            _ = try await supabase.auth.signUp(email: email, password: password, data: metadata)
            // After signup, sign in immediately
            try await signIn(email: email, password: password)
        } catch {
            authError = localizedAuthError(error)
            throw error
        }
    }

    // MARK: - Sign Out
    func signOut() async {
        try? await supabase.auth.signOut()
        AppGroupStorage.shared.clearWords()
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Forgot Password
    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    // MARK: - Change Password
    func changePassword(newPassword: String) async throws {
        try await supabase.auth.update(user: UserAttributes(password: newPassword))
    }

    // MARK: - Error localisation
    private func localizedAuthError(_ error: Error) -> String {
        let msg = error.localizedDescription.lowercased()
        if msg.contains("invalid login") || msg.contains("invalid email or password") {
            return "Email hoặc mật khẩu không đúng"
        }
        if msg.contains("email not confirmed") {
            return "Vui lòng xác nhận email trước khi đăng nhập"
        }
        if msg.contains("user already registered") {
            return "Email này đã được đăng ký"
        }
        if msg.contains("network") || msg.contains("internet") {
            return "Lỗi kết nối mạng. Kiểm tra internet và thử lại."
        }
        return error.localizedDescription
    }
}
