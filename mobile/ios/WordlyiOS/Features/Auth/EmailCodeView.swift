import SwiftUI

/// Nút "Gửi lại mã" — khoá đếm ngược 60 giây sau mỗi lần gửi (GoTrue chặn gửi
/// dày hơn thế), để người dùng không bấm liên tục rồi nhận lỗi khó hiểu.
struct ResendCodeButton: View {
    let lastSent: Date?
    let isBusy: Bool
    let action: () -> Void
    @Environment(\.colorScheme) var scheme

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let wait = AuthFlow.secondsUntilResend(lastSent: lastSent, now: context.date)
            Button(wait > 0 ? "Gửi lại mã sau \(wait)s" : "Gửi lại mã", action: action)
                .font(WordlyFonts.body(14, weight: .semibold))
                .foregroundStyle(wait > 0 ? WordlyColors.inkGhost : WordlyColors.electric)
                .monospacedDigit()
                .disabled(wait > 0 || isBusy)
        }
    }
}

/// Ẩn/hiện mờ dần cho dòng lỗi xác thực và tự ẩn khi hết hạn (AuthErrorBanner).
extension View {
    func autoHidingError(_ banner: Binding<AuthErrorBanner>) -> some View {
        animation(.easeInOut(duration: 0.25), value: banner.wrappedValue.message)
            .task(id: banner.wrappedValue.shownAt) {
                guard banner.wrappedValue.shownAt != nil else { return }
                try? await Task.sleep(for: .seconds(banner.wrappedValue.hideAfter))
                banner.wrappedValue.expire()
            }
    }
}

/// Nhập mã 6 số xác nhận đăng ký. Dùng cả khi vừa đăng ký, khi đăng nhập
/// bằng email chưa xác nhận, và khi mở lại app còn email đang chờ.
struct SignupCodeView: View {
    let email: String
    @State var lastSent: Date?
    var onUseAnotherEmail: () -> Void = {}

    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @State private var code = ""
    @State private var isLoading = false
    @State private var errorBanner = AuthErrorBanner()
    @State private var info: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Text("✉️").font(WordlyFonts.body(56)).padding(.top, 24)
                Text("Xác nhận email")
                    .font(WordlyFonts.display(28))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                Text("Nhập mã 6 số đã gửi tới\n\(email)")
                    .font(WordlyFonts.body(14, weight: .medium))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    .multilineTextAlignment(.center)
                Text(AuthFlow.codeValidityNote)
                    .font(WordlyFonts.body(12))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    .multilineTextAlignment(.center)

                VStack(spacing: 14) {
                    WordlyTextField(label: "Mã xác nhận", placeholder: "123456", text: $code,
                                   keyboardType: .numberPad, autocap: .never)
                        .textContentType(.oneTimeCode)

                    if let message = errorBanner.message {
                        Text(message).font(WordlyFonts.body(13, weight: .medium))
                            .foregroundStyle(WordlyColors.error)
                            .multilineTextAlignment(.center)
                            .transition(.opacity)
                    }
                    if let info {
                        Text(info).font(WordlyFonts.body(13, weight: .medium))
                            .foregroundStyle(WordlyColors.electric)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task { await verify() }
                    } label: {
                        HStack(spacing: 8) {
                            if isLoading { ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.85) }
                            Text("Xác nhận").font(WordlyFonts.body(16, weight: .bold))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 16)
                        .background(WordlyColors.electric)
                        .foregroundStyle(WordlyColors.onElectric)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(isLoading || code.isEmpty)

                    ResendCodeButton(lastSent: lastSent, isBusy: isLoading) { Task { await resend() } }

                    Text("Không thấy email? Xem cả mục Spam/Quảng cáo.")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkGhost)

                    Button("Dùng email khác") {
                        authManager.forgetPendingSignup()
                        onUseAnotherEmail()
                    }
                    .font(WordlyFonts.body(13, weight: .semibold))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
                .padding(.horizontal, 24)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .autoHidingError($errorBanner)
        .onChange(of: code) { errorBanner.userEdited() }
    }

    private func verify() async {
        let c = ResetPasswordLogic.normalizedCode(code)
        guard c.count == 6, c.allSatisfy(\.isNumber) else {
            errorBanner.show("Mã xác nhận gồm 6 chữ số trong email")
            return
        }
        isLoading = true
        errorBanner.clear()
        info = nil
        defer { isLoading = false }
        do {
            try await authManager.verifySignup(email: email, code: c)
        } catch {
            errorBanner.show(AuthFlow.message(for: authManager.errorKind(error) == .network ? .network : .codeInvalid))
        }
    }

    private func resend() async {
        isLoading = true
        errorBanner.clear()
        info = nil
        defer { isLoading = false }
        do {
            try await authManager.resendSignupCode(email: email)
            lastSent = Date()
            info = AuthFlow.resentNote
        } catch {
            let kind = authManager.errorKind(error)
            if kind == .rateLimited { lastSent = Date() }
            errorBanner.show(AuthFlow.message(for: kind), hideAfter: AuthErrorBanner.hideAfter(
                kind: kind, resendWait: AuthFlow.secondsUntilResend(lastSent: lastSent, now: Date())))
        }
    }
}
