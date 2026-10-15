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
    /// Mở màn nhập mã xác nhận cho email chưa xác nhận
    @State private var verifyEmail: String?
    @State private var verifySentAt: Date?
    @State private var errorBanner = AuthErrorBanner()

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
                            // Logo đặt thẳng, không khung gradient → nền xanh liền một màu
                            WordlyLogo(size: 96)
                                .shadow(color: WordlyColors.logoGreen.opacity(0.35), radius: 20, y: 8)
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
                                ZStack(alignment: .leading) {
                                    // TextField không có placeholder riêng — iOS tự tô placeholder
                                    // màu xanh link cho field keyboardType .emailAddress, không
                                    // override được bằng .foregroundStyle. Tự vẽ placeholder để
                                    // kiểm soát màu, giống field Mật khẩu bên dưới.
                                    if email.isEmpty {
                                        // Text("example@gmail.com") dùng init LocalizedStringKey —
                                        // SwiftUI tự parse kiểu Markdown và auto-link hoá chuỗi
                                        // giống email (tô xanh, không override được bằng
                                        // foregroundStyle). Text(verbatim:) bỏ qua việc parse đó.
                                        Text(verbatim: "example@gmail.com")
                                            .foregroundStyle(Color(.placeholderText))
                                    }
                                    TextField("", text: $email)
                                        .keyboardType(.emailAddress)
                                        .autocorrectionDisabled()
                                        .textInputAutocapitalization(.never)
                                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                                        .focused($focusedField, equals: .email)
                                        .submitLabel(.next)
                                        .onSubmit { focusedField = .password }
                                }
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
                                    errorBanner.clear()
                                    showForgotPassword = true
                                }
                                .font(WordlyFonts.body(13, weight: .semibold))
                                .foregroundStyle(WordlyColors.electric)
                            }
                        }
                        .padding(.horizontal, 24)

                        // Đăng ký từ trước nhưng chưa nhập mã (thoát app giữa chừng)
                        if let pending = authManager.pendingSignupEmail {
                            Button {
                                verifySentAt = nil
                                verifyEmail = pending
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: "envelope.badge.fill").font(WordlyFonts.body(16))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Chưa xác nhận email").font(WordlyFonts.body(13, weight: .bold))
                                        Text(pending).font(WordlyFonts.body(12)).lineLimit(1)
                                    }
                                    Spacer()
                                    Text("Nhập mã").font(WordlyFonts.body(13, weight: .bold))
                                }
                                .foregroundStyle(WordlyColors.electric)
                                .padding(12)
                                .background(WordlyColors.electric.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 24)
                        }

                        // Error
                        if let error = errorBanner.message {
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
                            .transition(.opacity)
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
                                    GoogleLogoIcon(size: 18)
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
                                errorBanner.clear()
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

                            Text(LegalLinks.sentence("Bằng việc tiếp tục, bạn đồng ý với", suffix: " của Wordly."))
                                .font(WordlyFonts.body(12))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                                .tint(WordlyColors.electric)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 4)
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 40)
                    }
                }
            }
        }
        .autoHidingError($errorBanner)
        // AuthManager giữ lỗi dùng chung — hiện qua banner, banner ẩn thì xoá
        // luôn để sheet Đăng ký / lần mở sau không thấy lại lỗi cũ.
        .onChange(of: authManager.authError) { _, new in errorBanner.show(new) }
        .onChange(of: errorBanner.message) { _, new in if new == nil { authManager.authError = nil } }
        .onChange(of: email) { errorBanner.userEdited() }
        .onChange(of: password) { errorBanner.userEdited() }
        .sheet(isPresented: $showSignup) { SignupView() }
        .sheet(isPresented: $showForgotPassword) { ForgotPasswordView() }
        .sheet(isPresented: Binding(get: { verifyEmail != nil }, set: { if !$0 { verifyEmail = nil } })) {
            NavigationStack {
                ZStack {
                    WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                    SignupCodeView(email: verifyEmail ?? "", lastSent: verifySentAt) { verifyEmail = nil }
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Đóng") { verifyEmail = nil }.foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    }
                }
            }
        }
    }

    private func login() async {
        guard !email.isEmpty, !password.isEmpty else { return }
        focusedField = nil
        isLoading = true
        defer { isLoading = false }
        do {
            try await authManager.signIn(email: email, password: password)
        } catch {
            // Email chưa xác nhận: AuthManager đã gửi mã mới → mở màn nhập mã
            if authManager.errorKind(error) == .emailNotConfirmed {
                verifySentAt = Date()
                verifyEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }
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
    @State private var errorBanner = AuthErrorBanner()
    /// Ô "Tôi đồng ý…" — để trống, chưa tick thì không tạo tài khoản được
    @State private var agreedToTerms = false
    /// Đăng ký xong → chuyển sang nhập mã 6 số cho email này
    @State private var codeEmail: String?
    @State private var codeSentAt: Date?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                if let codeEmail {
                    SignupCodeView(email: codeEmail, lastSent: codeSentAt) { self.codeEmail = nil }
                } else {
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
                            WordlyTextField(label: "Email", placeholder: "example@gmail.com", text: $email,
                                           keyboardType: .emailAddress, autocap: .never)
                            WordlySecureField(label: "Mật khẩu", placeholder: "Tối thiểu 6 ký tự",
                                             text: $password, show: $showPassword)
                            WordlySecureField(label: "Xác nhận mật khẩu", placeholder: "Nhập lại mật khẩu",
                                             text: $confirmPassword, show: $showPassword)
                        }
                        .padding(.horizontal, 24)

                        if let err = errorBanner.message {
                            Text(err)
                                .font(WordlyFonts.body(13, weight: .medium))
                                .foregroundStyle(WordlyColors.error)
                                .padding(.horizontal, 16).padding(.vertical, 10)
                                .background(WordlyColors.errorSoft)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .padding(.horizontal, 24)
                                .transition(.opacity)
                        }

                        HStack(alignment: .top, spacing: 10) {
                            Button {
                                agreedToTerms.toggle()
                            } label: {
                                Image(systemName: agreedToTerms ? "checkmark.square.fill" : "square")
                                    .font(.system(size: 24))
                                    .foregroundStyle(agreedToTerms ? WordlyColors.electric : WordlyColors.inkSoft(scheme: scheme))
                                    .frame(width: 32, height: 32)
                            }
                            .accessibilityIdentifier("signupTermsCheckbox")
                            .accessibilityLabel("Tôi đồng ý với Điều khoản sử dụng và Chính sách quyền riêng tư")
                            .accessibilityAddTraits(agreedToTerms ? .isSelected : [])
                            Text(LegalLinks.sentence("Tôi đồng ý với"))
                                .font(WordlyFonts.body(13))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                                .tint(WordlyColors.electric)
                                .padding(.top, 6)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 24)

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
                        .disabled(isLoading || !agreedToTerms)
                        .opacity(agreedToTerms ? 1 : 0.5)
                        .accessibilityIdentifier("signupSubmit")
                        .padding(.horizontal, 24)
                        .padding(.bottom, 32)
                    }
                }
                .autoHidingError($errorBanner)
                .onChange(of: name) { errorBanner.userEdited() }
                .onChange(of: email) { errorBanner.userEdited() }
                .onChange(of: password) { errorBanner.userEdited() }
                .onChange(of: confirmPassword) { errorBanner.userEdited() }
                .onChange(of: authManager.authError) { _, new in errorBanner.show(new) }
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
        errorBanner.clear()
        guard password.count >= 6 else { errorBanner.show("Mật khẩu phải có ít nhất 6 ký tự"); return }
        guard password == confirmPassword else { errorBanner.show("Mật khẩu xác nhận không khớp"); return }
        isLoading = true
        defer { isLoading = false }
        guard let outcome = try? await authManager.signUp(email: email, password: password, name: name.isEmpty ? nil : name) else { return }
        if authManager.isAuthenticated { dismiss(); return }
        switch outcome {
        case .codeSent, .codeRecentlySent:
            codeSentAt = Date()
            codeEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        case .alreadyRegistered:
            errorBanner.show(AuthFlow.message(for: .userExists))
        }
    }
}

// MARK: - Forgot Password
// Hai bước ngay trong app: gửi mã 6 số qua email → nhập mã + mật khẩu mới.
// Trước đây gửi link, mở link trên Safari/Gmail không đổi được phiên (mã PKCE
// nằm trong app) nên rơi về trang chủ web, không đặt được mật khẩu.
struct ForgotPasswordView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) var dismiss
    @State private var email = ""
    @State private var codeSent = false
    @State private var code = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var showPassword = false
    @State private var isLoading = false
    @State private var errorBanner = AuthErrorBanner()
    @State private var info: String?
    @State private var lastSent: Date?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        Text("🔑").font(WordlyFonts.body(56)).padding(.top, 32)
                        Text(codeSent ? "Đặt mật khẩu mới" : "Quên mật khẩu")
                            .font(WordlyFonts.display(28))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        Text(codeSent ? "Nhập mã 6 số vừa gửi tới \(email)\n\(AuthFlow.codeValidityNote)" : "Nhập email, chúng tôi gửi mã xác nhận 6 số")
                            .font(WordlyFonts.body(14, weight: .medium))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)

                        VStack(spacing: 14) {
                            if codeSent {
                                WordlyTextField(label: "Mã xác nhận", placeholder: "123456", text: $code,
                                               keyboardType: .numberPad, autocap: .never)
                                    .textContentType(.oneTimeCode)
                                WordlySecureField(label: "Mật khẩu mới", placeholder: "Ít nhất 6 ký tự",
                                                  text: $password, show: $showPassword)
                                WordlySecureField(label: "Nhập lại mật khẩu", placeholder: "Nhập lại mật khẩu mới",
                                                  text: $confirm, show: $showPassword)
                            } else {
                                WordlyTextField(label: "Email", placeholder: "example@gmail.com", text: $email,
                                               keyboardType: .emailAddress, autocap: .never)
                            }

                            if let err = errorBanner.message {
                                Text(err).font(WordlyFonts.body(13, weight: .medium))
                                    .foregroundStyle(WordlyColors.error)
                                    .transition(.opacity)
                            }
                            if let info {
                                Text(info).font(WordlyFonts.body(13, weight: .medium))
                                    .foregroundStyle(WordlyColors.electric)
                            }

                            Button {
                                Task { codeSent ? await updatePassword() : await sendCode() }
                            } label: {
                                HStack(spacing: 8) {
                                    if isLoading { ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.85) }
                                    Text(codeSent ? "Đổi mật khẩu" : (isLoading ? "Đang gửi..." : "Gửi mã xác nhận"))
                                        .font(WordlyFonts.body(16, weight: .bold))
                                }
                                .frame(maxWidth: .infinity).padding(.vertical, 16)
                                .background(WordlyColors.electric)
                                .foregroundStyle(WordlyColors.onElectric)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                            }
                            .disabled(isLoading || (codeSent ? code.isEmpty || password.isEmpty : email.isEmpty))

                            if codeSent {
                                ResendCodeButton(lastSent: lastSent, isBusy: isLoading) { Task { await sendCode(resend: true) } }
                                Text("Không thấy email? Xem cả mục Spam/Quảng cáo.")
                                    .font(WordlyFonts.body(12))
                                    .foregroundStyle(WordlyColors.inkGhost)
                            }
                        }
                        .padding(.horizontal, 24)
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .autoHidingError($errorBanner)
                .onChange(of: email) { errorBanner.userEdited() }
                .onChange(of: code) { errorBanner.userEdited() }
                .onChange(of: password) { errorBanner.userEdited() }
                .onChange(of: confirm) { errorBanner.userEdited() }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Đóng") { dismiss() }.foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
            }
        }
    }

    private func sendCode(resend: Bool = false) async {
        isLoading = true
        errorBanner.clear()
        info = nil
        defer { isLoading = false }
        do {
            try await authManager.resetPassword(email: email.trimmingCharacters(in: .whitespaces))
            codeSent = true
            lastSent = Date()
            if resend { info = AuthFlow.resentNote + " Kiểm tra cả mục Spam." }
        } catch {
            let kind = authManager.errorKind(error)
            if kind == .rateLimited {
                // Mã gửi chưa tới 1 phút trước vẫn dùng được → cho nhập mã luôn
                codeSent = true
                lastSent = Date()
            }
            errorBanner.show(AuthFlow.message(for: kind), hideAfter: AuthErrorBanner.hideAfter(
                kind: kind, resendWait: AuthFlow.secondsUntilResend(lastSent: lastSent, now: Date())))
        }
    }

    private func updatePassword() async {
        let invalid = ResetPasswordLogic.error(code: code, password: password, confirm: confirm)
        errorBanner.show(invalid)
        guard invalid == nil else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            try await authManager.resetPassword(email: email.trimmingCharacters(in: .whitespaces),
                                                code: ResetPasswordLogic.normalizedCode(code),
                                                newPassword: password)
            dismiss()   // verifyOTP đã đăng nhập luôn → app vào màn chính
        } catch {
            let kind = authManager.errorKind(error)
            errorBanner.show(AuthFlow.message(for: [.network, .weakPassword].contains(kind) ? kind : .codeInvalid))
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
            // Placeholder tự vẽ — iOS tô placeholder màu xanh link cho
            // keyboardType .emailAddress, .foregroundStyle không override được.
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(verbatim: placeholder).foregroundStyle(Color(.placeholderText))
                }
                TextField("", text: $text)
                    .keyboardType(keyboardType)
                    .textInputAutocapitalization(autocap)
                    .autocorrectionDisabled()
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                    .focused($focused)
            }
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
