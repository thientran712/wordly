import SwiftUI

/// Link tới trang pháp lý trên web (Điều khoản, Chính sách) — mở trong Safari.
enum LegalLinks {
    static var terms: URL { URL(string: WordlyConfig.webBaseURL + "/terms")! }
    static var privacy: URL { URL(string: WordlyConfig.webBaseURL + "/privacy")! }

    /// "… [Điều khoản sử dụng](…) và [Chính sách quyền riêng tư](…)…" — chữ có link bấm được.
    static func sentence(_ prefix: String, suffix: String = ".") -> AttributedString {
        let md = "\(prefix) [Điều khoản sử dụng](\(terms.absoluteString)) và [Chính sách quyền riêng tư](\(privacy.absoluteString))\(suffix)"
        return (try? AttributedString(markdown: md)) ?? AttributedString(prefix)
    }
}

/// Bọc nội dung sau đăng nhập: chưa ghi đồng ý → tự ghi (đăng nhập là đồng ý);
/// Điều khoản lên phiên bản mới → màn đồng ý lại một lần. Đã đồng ý trên máy này
/// thì vào thẳng, kiểm lại ở nền.
/// Lỗi mạng → cho vào (không khoá người dùng vì mạng), lần mở sau kiểm lại.
struct TermsGate<Content: View>: View {
    @EnvironmentObject private var authManager: AuthManager
    @ViewBuilder let content: () -> Content

    private enum Phase: Equatable { case checking, ask(Int), ok }
    @State private var phase: Phase?

    private static var acceptedKey: String { "wordly.terms.acceptedUser" }
    private var userId: String? { authManager.currentUser?.id.uuidString }
    private var acceptedHere: Bool {
        guard let userId else { return false }
        return UserDefaults.standard.string(forKey: Self.acceptedKey) == userId
    }

    var body: some View {
        Group {
            switch phase ?? (acceptedHere ? .ok : .checking) {
            case .checking: SplashView()
            case .ask(let version):
                TermsConsentView(version: version) { accepted() }
                    .transition(.opacity)
            case .ok: content()
            }
        }
        .task(id: userId) { await check() }
    }

    private func accepted() {
        if let userId { UserDefaults.standard.set(userId, forKey: Self.acceptedKey) }
        phase = .ok
    }

    private func check() async {
        guard let response = try? await APIClient.shared.fetchProfile() else {
            phase = .ok
            return
        }
        switch TermsConsent.decision(response) {
        case .ok:
            accepted()
        case .ask(let version):
            phase = .ask(version)
        case .acceptSilently(let version):
            // Đăng nhập = đồng ý → ghi lên server. Lỗi mạng → vẫn cho vào, lần mở sau ghi lại
            if (try? await APIClient.shared.acceptTerms(version: version)) != nil {
                accepted()
            } else {
                phase = .ok
            }
        }
    }
}

/// Màn đồng ý lại khi Điều khoản / Chính sách lên phiên bản mới.
struct TermsConsentView: View {
    let version: Int
    let onAccepted: () -> Void

    @EnvironmentObject private var authManager: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var isSaving = false
    @State private var error: String?
    @State private var showDecline = false
    @State private var isLeaving = false

    var body: some View {
        ZStack {
            WordlyColors.bg(scheme: scheme).ignoresSafeArea()
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        WordlyLogo(size: 56)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 24)
                        Text("Wordly cập nhật Điều khoản")
                            .font(WordlyFonts.display(28))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                            .frame(maxWidth: .infinity)
                            .multilineTextAlignment(.center)
                        Text("Điều khoản sử dụng và Chính sách quyền riêng tư vừa được cập nhật. Đọc và đồng ý để dùng tiếp:")
                            .font(WordlyFonts.body(15))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))

                        VStack(alignment: .leading, spacing: 12) {
                            item("person.crop.circle.fill", "Email và tên", "để tạo và giữ tài khoản của bạn")
                            item("books.vertical.fill", "Từ đã lưu, sổ tay, lịch sử dịch", "chỉ bạn xem được, dùng để ôn tập")
                            item("bell.badge.fill", "Mã thiết bị", "chỉ khi bạn bật thông báo nhắc ôn")
                            item("hand.raised.fill", "Không bán dữ liệu", "không quảng cáo, không theo dõi bạn")
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(WordlyColors.surfaceElevated(scheme: scheme))
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                        Text(LegalLinks.sentence("Đọc đầy đủ", suffix: "."))
                            .font(WordlyFonts.body(14))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .tint(WordlyColors.electric)

                        if let error {
                            Text(error)
                                .font(WordlyFonts.body(13, weight: .medium))
                                .foregroundStyle(WordlyColors.error)
                        }
                    }
                    .padding(.horizontal, 24)
                }

                VStack(spacing: 10) {
                    Button { Task { await accept() } } label: {
                        HStack(spacing: 8) {
                            if isSaving { ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.85) }
                            Text("Đồng ý và tiếp tục").font(WordlyFonts.body(16, weight: .bold))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(WordlyColors.electric)
                        .foregroundStyle(WordlyColors.onElectric)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    }
                    .disabled(isSaving || isLeaving)
                    .accessibilityIdentifier("termsAccept")

                    Button("Không đồng ý") { showDecline = true }
                        .font(WordlyFonts.body(15, weight: .semibold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .padding(.vertical, 8)
                        .disabled(isSaving || isLeaving)
                        .accessibilityIdentifier("termsDecline")
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }
        }
        .confirmationDialog("Không đồng ý thì chưa dùng được Wordly",
                            isPresented: $showDecline, titleVisibility: .visible) {
            Button("Chỉ đăng xuất") { leave(delete: false) }
            Button("Xoá tài khoản và dữ liệu", role: .destructive) { leave(delete: true) }
            Button("Huỷ", role: .cancel) {}
        } message: {
            Text("Bạn có thể đăng xuất (dữ liệu vẫn giữ, lần sau đồng ý là dùng tiếp), hoặc xoá tài khoản cùng toàn bộ dữ liệu.")
        }
    }

    private func item(_ icon: String, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18))
                .foregroundStyle(WordlyColors.electric)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(WordlyFonts.body(15, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                Text(detail).font(WordlyFonts.body(13))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            }
        }
    }

    private func accept() async {
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            try await APIClient.shared.acceptTerms(version: version)
            onAccepted()
        } catch {
            self.error = "Không lưu được, kiểm tra mạng rồi thử lại."
        }
    }

    private func leave(delete: Bool) {
        isLeaving = true
        Task {
            if delete {
                do { try await authManager.deleteAccount() } catch {
                    self.error = "Chưa xoá được tài khoản, thử lại."
                    isLeaving = false
                }
            } else {
                await authManager.signOut()
            }
        }
    }
}
