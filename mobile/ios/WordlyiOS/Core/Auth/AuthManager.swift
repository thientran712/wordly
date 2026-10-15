import Foundation
import Supabase

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published var isAuthenticated = false
    @Published var isLoading = true
    @Published var currentUser: User?
    @Published var authError: String?
    /// Email đã đăng ký nhưng chưa nhập mã — lưu qua các lần mở app (PendingSignupStore).
    @Published private(set) var pendingSignupEmail: String? = PendingSignupStore().email

    enum SignupOutcome { case codeSent, codeRecentlySent, alreadyRegistered }

    let supabase: SupabaseClient

    private init() {
        supabase = SupabaseClient(
            supabaseURL: URL(string: WordlyConfig.supabaseURL)!,
            supabaseKey: WordlyConfig.supabaseAnonKey
        )
        #if DEBUG
        if PreviewMode.isOn {
            // `-WordlyFreshInstall`: như vừa cài app, chưa đăng nhập (UI test onboarding)
            isAuthenticated = !CommandLine.arguments.contains("-WordlyFreshInstall")
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
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            let session = try await supabase.auth.signIn(email: email, password: password)
            currentUser = session.user
            isAuthenticated = true
            if pendingSignupEmail == email.lowercased() { setPendingSignup(nil) }
        } catch {
            if errorKind(error) == .emailNotConfirmed {
                // Đăng ký từ trước nhưng chưa nhập mã (vd. thoát app giữa chừng):
                // gửi mã mới, màn đăng nhập mở màn nhập mã. Gửi lỗi vì vừa gửi
                // gần đây thì mã cũ vẫn dùng được — bỏ qua.
                setPendingSignup(email)
                try? await supabase.auth.resend(email: email, type: .signup)
                authError = nil
            } else {
                authError = localizedAuthError(error)
            }
            throw error
        }
    }

    /// Phân loại lỗi theo error_code của GoTrue.
    func errorKind(_ error: Error) -> AuthFlow.ErrorKind {
        AuthFlow.kind(errorCode: (error as? AuthError)?.errorCode.rawValue, message: error.localizedDescription)
    }

    private func setPendingSignup(_ email: String?) {
        let store = PendingSignupStore()
        store.email = email
        pendingSignupEmail = store.email
    }

    /// "Dùng email khác" — bỏ nhắc xác nhận email đang chờ.
    func forgetPendingSignup() { setPendingSignup(nil) }

    /// Nhập mã 6 số trong email xác nhận đăng ký → tài khoản được xác nhận và đăng nhập luôn.
    func verifySignup(email: String, code: String) async throws {
        let response = try await supabase.auth.verifyOTP(email: email, token: code, type: .signup)
        setPendingSignup(nil)
        currentUser = response.user
        isAuthenticated = response.session != nil
    }

    func resendSignupCode(email: String) async throws {
        try await supabase.auth.resend(email: email, type: .signup)
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
    /// Tạo tài khoản → GoTrue gửi mã 6 số. Chưa đăng nhập cho tới khi nhập đúng mã.
    func signUp(email: String, password: String, name: String? = nil) async throws -> SignupOutcome {
        authError = nil
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            var metadata: [String: AnyJSON]? = nil
            if let name, !name.isEmpty {
                metadata = ["name": .string(name)]
            }
            let response = try await supabase.auth.signUp(email: email, password: password, data: metadata)
            // Email đã có tài khoản đã xác nhận: GoTrue không báo lỗi (chống dò
            // email) mà trả user giả không có identity, và không gửi mã.
            if response.user.identities?.isEmpty == true { return .alreadyRegistered }
            if response.session != nil {
                // Server đang tắt xác nhận email → vào luôn
                currentUser = response.user
                isAuthenticated = true
                return .codeSent
            }
            setPendingSignup(email)
            return .codeSent
        } catch {
            switch errorKind(error) {
            case .rateLimited:
                // Đăng ký lại cùng email trong vòng 1 phút: mã vừa gửi vẫn dùng được
                setPendingSignup(email)
                return .codeRecentlySent
            case .userExists:
                return .alreadyRegistered
            default:
                authError = localizedAuthError(error)
                throw error
            }
        }
    }

    // MARK: - Sign Out
    private let signOutGate = SignOutGate()

    func signOut() async {
        await signOutGate.run {
            // Huỷ token push TRƯỚC (cần Bearer còn sống) — thông báo của người này
            // không được hiện tiếp trên máy sau khi đăng xuất
            await PushManager.shared.unregister()
            try? await supabase.auth.signOut()
            AppGroupStorage.shared.clearWords()
            currentUser = nil
            isAuthenticated = false
        }
    }

    /// Người dùng đăng nhập bằng Apple → xoá tài khoản phải xác nhận lại với Apple.
    var isAppleUser: Bool { AccountDeletion.isAppleUser(currentUser) }

    /// Xoá tài khoản trên server rồi dọn phiên trên máy. User đã bị xoá nên
    /// gọi signOut lên server sẽ lỗi — chỉ xoá phiên local.
    /// Người dùng Apple: xin lại authorizationCode trước để server thu hồi token
    /// Apple (Guideline 5.1.1(v)); huỷ sheet Apple → throw AppleReauthError.cancelled,
    /// tài khoản KHÔNG bị xoá.
    func deleteAccount() async throws {
        try await AccountDeletion.run(
            isAppleUser: isAppleUser,
            reauthorize: { try await AppleReauth.authorizationCode() },
            deleteOnServer: { try await APIClient.shared.deleteAccount(appleAuthorizationCode: $0) }
        )
        await PushManager.shared.forgetLocally()
        try? await supabase.auth.signOut(scope: .local)
        AppGroupStorage.shared.clearWords()
        AppGroupStorage.shared.deleteHomeBackgroundImage()
        currentUser = nil
        isAuthenticated = false
    }

    // MARK: - Forgot Password
    func resetPassword(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    /// Xác nhận mã 6 số trong email đặt lại mật khẩu (tạo phiên đăng nhập) rồi đổi mật khẩu.
    func resetPassword(email: String, code: String, newPassword: String) async throws {
        try await supabase.auth.verifyOTP(email: email, token: code, type: .recovery)
        let user = try await supabase.auth.update(user: UserAttributes(password: newPassword))
        // Mã recovery phát sự kiện passwordRecovery (không phải signedIn) —
        // trình nghe authStateChanges bỏ qua, nên tự vào trạng thái đăng nhập.
        currentUser = user
        isAuthenticated = true
    }

    // MARK: - Change Password
    func changePassword(newPassword: String) async throws {
        try await supabase.auth.update(user: UserAttributes(password: newPassword))
    }

    // MARK: - Error localisation
    private func localizedAuthError(_ error: Error) -> String {
        let kind = errorKind(error)
        return kind == .other ? error.localizedDescription : AuthFlow.message(for: kind)
    }
}
