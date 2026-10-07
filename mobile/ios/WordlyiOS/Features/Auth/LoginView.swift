import SwiftUI
import AuthenticationServices

struct LoginView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var showSignup = false
    @State private var showForgotPassword = false
    @State private var showPassword = false
    @State private var socialLoading = false
    /// Nonce gốc của lần Sign in with Apple đang chạy (Apple nhận bản băm)
    @State private var appleNonce = ""
    @FocusState private var focusedField: Field?

    enum Field { case email, password }

    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [
                        WordlyColors.electric.opacity(0.08),
                        WordlyColors.bg(scheme: scheme),
                        WordlyColors.bg(scheme: scheme)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 32) {
                        // Logo
                        VStack(spacing: 12) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 24)
                                    .fill(
                                        LinearGradient(
                                            colors: [WordlyColors.electric, WordlyColors.electricDark],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 88, height: 88)
                                    .shadow(color: WordlyColors.electric.opacity(0.4), radius: 20, y: 8)
                                WordlyLogo(size: 70.4)
                            }
                            Text("Wordly")
                                .font(WordlyFonts.display(48))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [WordlyColors.electric, WordlyColors.electric],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                            Text("Học tiếng Anh mỗi ngày")
                                .font(WordlyFonts.body(15, weight: .medium))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        }
                        .padding(.top, 60)

                        // Form
                        VStack(spacing: 16) {
                            // Email
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Email")
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                TextField("your@email.com", text: $email)
                                    .keyboardType(.emailAddress)
                                    .autocorrectionDisabled()
                                    .textInputAutocapitalization(.never)
                                    .focused($focusedField, equals: .email)
                                    .submitLabel(.next)
                                    .onSubmit { focusedField = .password }
                                    .wordlyInputStyle(focused: focusedField == .email)
                            }

                            // Password
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Mật khẩu")
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                HStack {
                                    Group {
                                        if showPassword {
                                            TextField("Mật khẩu", text: $password)
                                        } else {
                                            SecureField("Mật khẩu", text: $password)
                                        }
                                    }
                                    .focused($focusedField, equals: .password)
                                    .submitLabel(.done)
                                    .onSubmit { Task { await login() } }
                                    Button {
                                        showPassword.toggle()
                                    } label: {
                                        Image(systemName: showPassword ? "eye.slash" : "eye")
                                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                                            .font(WordlyFonts.body(15))
                                    }
                                }
                                .wordlyInputStyle(focused: focusedField == .password)
                            }

                            // Forgot password
                            HStack {
                                Spacer()
                                Button("Quên mật khẩu?") {
                                    showForgotPassword = true
                                }
                                .font(WordlyFonts.body(13, weight: .semibold))
                                .foregroundStyle(WordlyColors.electric)
                            }
                        }
                        .padding(.horizontal, 24)

                        // Error
                        if let error = authManager.authError {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(WordlyFonts.body(13))
                                Text(error)
                                    .font(WordlyFonts.body(13, weight: .medium))
                            }
                            .foregroundStyle(WordlyColors.error)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(WordlyColors.errorSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .padding(.horizontal, 24)
                        }

                        // Login button
                        VStack(spacing: 16) {
                            Button {
                                Task { await login() }
                            } label: {
                                HStack(spacing: 8) {
                                    if isLoading {
                                        ProgressView()
                                            .tint(WordlyColors.onElectric)
                                            .scaleEffect(0.85)
                                    }
                                    Text(isLoading ? "Đang đăng nhập..." : "Đăng nhập")
                                        .font(WordlyFonts.body(16, weight: .bold))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(email.isEmpty || password.isEmpty ? WordlyColors.electric.opacity(0.5) : WordlyColors.electric)
                                .foregroundStyle(WordlyColors.onElectric)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                                .shadow(color: WordlyColors.electric.opacity(0.3), radius: 8, y: 4)
                            }
                            .disabled(email.isEmpty || password.isEmpty || isLoading)

                            // Divider
                            HStack {
                                Rectangle().fill(WordlyColors.divider(scheme: scheme)).frame(height: 1)
                                Text("hoặc")
                                    .font(WordlyFonts.body(12, weight: .medium))
                                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                                    .padding(.horizontal, 8)
                                Rectangle().fill(WordlyColors.divider(scheme: scheme)).frame(height: 1)
                            }

                            // Đăng nhập Google (giống web) + Apple (bắt buộc khi có Google — App Store 4.8)
                            Button {
                                Task {
                                    socialLoading = true
                                    await authManager.signInWithGoogle()
                                    socialLoading = false
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    Text("G")
                                        .font(.system(size: 18, weight: .bold, design: .rounded))
                                        .foregroundStyle(LinearGradient(colors: [Color(hex: "#4285F4"), Color(hex: "#EA4335"), Color(hex: "#FBBC05"), Color(hex: "#34A853")],
                                                                        startPoint: .topLeading, endPoint: .bottomTrailing))
                                    Text("Tiếp tục với Google")
                                        .font(WordlyFonts.body(16, weight: .semibold))
                                        .foregroundStyle(Color(hex: "#1F1F1F"))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 15)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(hex: "#DADCE0"), lineWidth: 1))
                            }
                            .disabled(socialLoading)

                            SignInWithAppleButton(.continue) { request in
                                appleNonce = SocialAuth.randomNonce()
                                request.requestedScopes = [.fullName, .email]
                                request.nonce = SocialAuth.sha256(appleNonce)
                            } onCompletion: { result in
                                switch result {
                                case .success(let auth):
                                    guard let credential = auth.credential as? ASAuthorizationAppleIDCredential else { return }
                                    let token = credential.identityToken.flatMap { String(data: $0, encoding: .utf8) }
                                    let name = [credential.fullName?.givenName, credential.fullName?.familyName]
                                        .compactMap { $0 }.joined(separator: " ")
                                    Task {
                                        socialLoading = true
                                        await authManager.signInWithApple(idToken: token, rawNonce: appleNonce, fullName: name)
                                        socialLoading = false
                                    }
                                case .failure(let error):
                                    authManager.authError = SocialAuth.userMessage(for: error)
                                }
                            }
                            .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
                            // Kiểu nút chỉ được đọc khi tạo → tạo lại khi đổi sáng/tối
                            .id(scheme)
                            .frame(height: 52)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .disabled(socialLoading)

                            // Signup button
                            Button {
                                showSignup = true
                            } label: {
                                Text("Tạo tài khoản mới")
                                    .font(WordlyFonts.body(16, weight: .bold))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 16)
                                    .background(WordlyColors.surfaceElevated(scheme: scheme))
                                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                    .clipShape(RoundedRectangle(cornerRadius: 16))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 16)
                                            .stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1.5)
                                    )
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 40)
                    }
                }
            }
        }
        .sheet(isPresented: $showSignup) { SignupView() }
        .sheet(isPresented: $showForgotPassword) { ForgotPasswordView() }
    }

    private func login() async {
        guard !email.isEmpty, !password.isEmpty else { return }
        focusedField = nil
        isLoading = true
        defer { isLoading = false }
        try? await authManager.signIn(email: email, password: password)
    }
}

// MARK: - Signup
struct SignupView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) var dismiss
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var showPassword = false
    @State private var localError: String?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 24) {
                        VStack(spacing: 8) {
                            Text("Tạo tài khoản")
                                .font(WordlyFonts.display(32))
                                .foregroundStyle(WordlyColors.ink(scheme: scheme))
                            Text("Bắt đầu hành trình học tiếng Anh")
                                .font(WordlyFonts.body(14, weight: .medium))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        }
                        .padding(.top, 8)

                        VStack(spacing: 14) {
                            WordlyTextField(label: "Tên của bạn", placeholder: "Nguyễn Văn A", text: $name)
                            WordlyTextField(label: "Email", placeholder: "your@email.com", text: $email,
                                           keyboardType: .emailAddress, autocap: .never)
                            WordlySecureField(label: "Mật khẩu", placeholder: "Tối thiểu 6 ký tự",
                                             text: $password, show: $showPassword)
                            WordlySecureField(label: "Xác nhận mật khẩu", placeholder: "Nhập lại mật khẩu",
                                             text: $confirmPassword, show: $showPassword)
                        }
                        .padding(.horizontal, 24)

                        if let err = localError ?? authManager.authError {
                            Text(err)
                                .font(WordlyFonts.body(13, weight: .medium))
                                .foregroundStyle(WordlyColors.error)
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .background(WordlyColors.errorSoft)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal, 24)
                        }

                        Button {
                            Task { await signup() }
                        } label: {
                            HStack(spacing: 8) {
                                if isLoading { ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.85) }
                                Text(isLoading ? "Đang tạo..." : "Tạo tài khoản")
                                    .font(WordlyFonts.body(16, weight: .bold))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(WordlyColors.electric)
                            .foregroundStyle(WordlyColors.onElectric)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                            .shadow(color: WordlyColors.electric.opacity(0.3), radius: 8, y: 4)
                        }
                        .disabled(isLoading)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 32)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Huỷ") { dismiss() }
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
            }
        }
    }

    private func signup() async {
        localError = nil
        guard password.count >= 6 else { localError = "Mật khẩu phải có ít nhất 6 ký tự"; return }
        guard password == confirmPassword else { localError = "Mật khẩu xác nhận không khớp"; return }
        isLoading = true
        defer { isLoading = false }
        try? await authManager.signUp(email: email, password: password, name: name.isEmpty ? nil : name)
        if authManager.isAuthenticated { dismiss() }
    }
}

// MARK: - Forgot Password
struct ForgotPasswordView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var isLoading = false
    @State private var success = false
    @State private var errorMsg: String?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                VStack(spacing: 24) {
                    Spacer()
                    Text("🔑")
                        .font(WordlyFonts.body(56))
                    Text("Quên mật khẩu")
                        .font(WordlyFonts.display(28))
                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                    Text("Nhập email để nhận link đặt lại mật khẩu")
                        .font(WordlyFonts.body(14, weight: .medium))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .multilineTextAlignment(.center)

                    if success {
                        VStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(WordlyFonts.body(40))
                                .foregroundStyle(WordlyColors.electric)
                            Text("Đã gửi email!")
                                .font(WordlyFonts.body(16, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                            Text("Kiểm tra hộp thư của bạn")
                                .font(WordlyFonts.body(14))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        }
                    } else {
                        VStack(spacing: 14) {
                            WordlyTextField(label: "Email", placeholder: "your@email.com", text: $email,
                                           keyboardType: .emailAddress, autocap: .never)
                                .padding(.horizontal, 24)

                            if let err = errorMsg {
                                Text(err).font(WordlyFonts.body(13, weight: .medium))
                                    .foregroundStyle(WordlyColors.error)
                                    .padding(.horizontal, 24)
                            }

                            Button {
                                Task { await reset() }
                            } label: {
                                HStack(spacing: 8) {
                                    if isLoading { ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.85) }
                                    Text(isLoading ? "Đang gửi..." : "Gửi link đặt lại")
                                        .font(WordlyFonts.body(16, weight: .bold))
                                }
                                .frame(maxWidth: .infinity).padding(.vertical, 16)
                                .background(WordlyColors.electric)
                                .foregroundStyle(WordlyColors.onElectric)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                            .disabled(email.isEmpty || isLoading)
                            .padding(.horizontal, 24)
                        }
                    }
                    Spacer()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Đóng") { dismiss() }.foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
            }
        }
    }

    private func reset() async {
        isLoading = true
        defer { isLoading = false }
        do {
            try await authManager.resetPassword(email: email)
            success = true
        } catch {
            errorMsg = error.localizedDescription
        }
    }
}

// MARK: - Reusable form fields
struct WordlyTextField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocap: TextInputAutocapitalization = .sentences
    @Environment(\.colorScheme) var scheme
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.ink(scheme: scheme))
            TextField(placeholder, text: $text)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocap)
                .autocorrectionDisabled()
                .focused($focused)
                .wordlyInputStyle(focused: focused)
        }
    }
}

struct WordlySecureField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    @Binding var show: Bool
    @Environment(\.colorScheme) var scheme
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.ink(scheme: scheme))
            HStack {
                Group {
                    if show { TextField(placeholder, text: $text) }
                    else { SecureField(placeholder, text: $text) }
                }
                .focused($focused)
                Button { show.toggle() } label: {
                    Image(systemName: show ? "eye.slash" : "eye")
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
            }
            .wordlyInputStyle(focused: focused)
        }
    }
}
