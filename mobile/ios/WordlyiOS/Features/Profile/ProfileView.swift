import SwiftUI

// Tab Cá nhân: chuỗi ngày học + hồ sơ & cài đặt — gom các mục của web (/profile, /profile/email) + cài đặt
// riêng của app (widget màn hình khoá, giao diện).
struct ProfileView: View {
    @StateObject private var vm = ProfileViewModel()
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var themeManager: ThemeManager
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"
    @State private var showChangePassword = false
    @State private var confirmSignOut = false
    @State private var emailSummary = ""
    @State private var pushSummary = ""
    @State private var streak: StreakResponse?
    @State private var confirmDelete = false
    @State private var isDeleting = false
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            Form {
                // Tên chỉ hiện một chỗ; cả khối là lối vào màn sửa hồ sơ (có mũi tên ›)
                Section {
                    NavigationLink { EditProfileView(vm: vm) } label: { accountHeader }
                }

                Section { streakCard }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())

                Section("Nhắc học") {
                    NavigationLink { EmailSettingsView() } label: {
                        settingRow("envelope.fill", WordlyColors.duoBlue, "Email nhắc học", emailSummary)
                    }
                    NavigationLink { PushSettingsView() } label: {
                        settingRow("bell.badge.fill", WordlyColors.electric, "Thông báo nhắc ôn", pushSummary)
                    }
                    NavigationLink { WidgetSettingsView() } label: {
                        settingRow("lock.iphone", WordlyColors.electric, "Widget màn hình khoá", "Từ vựng trên màn hình khoá")
                    }
                }

                Section("Giao diện") {
                    Picker("Chế độ", selection: Binding(get: { savedTheme }, set: { new in
                        savedTheme = new
                        themeManager.apply(new)
                    })) {
                        Label("Tối", systemImage: "moon.fill").tag("dark")
                        Label("Sáng", systemImage: "sun.max.fill").tag("light")
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    if vm.authProvider == "email" {
                        Button { showChangePassword = true } label: {
                            settingRow("key.fill", WordlyColors.duoOrange, "Đổi mật khẩu", nil)
                        }
                    }
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        settingRow("rectangle.portrait.and.arrow.right", WordlyColors.error, "Đăng xuất", nil)
                    }
                    Button(role: .destructive) { confirmDelete = true } label: {
                        HStack {
                            settingRow("trash.fill", WordlyColors.error, "Xoá tài khoản", nil)
                            if isDeleting { ProgressView() }
                        }
                    }
                    .disabled(isDeleting)
                } header: {
                    Text("Tài khoản")
                } footer: {
                    if let deleteError {
                        Text(deleteError).foregroundStyle(WordlyColors.error)
                    } else {
                        Text(providerLabel)
                    }
                }

                Section {
                    Link(destination: webURL("/privacy")) {
                        settingRow("hand.raised.fill", WordlyColors.duoBlue, "Chính sách quyền riêng tư", nil)
                    }
                    Link(destination: webURL("/support")) {
                        settingRow("questionmark.circle.fill", WordlyColors.electric, "Hỗ trợ & liên hệ", nil)
                    }
                } header: {
                    Text("Thông tin")
                } footer: {
                    // Version làm chú thích của mục cuối — trước đây là cả một Section riêng, dư khoảng trắng
                    Text("Wordly \(appVersion)")
                        .frame(maxWidth: .infinity)
                        .padding(.top, 4)
                }
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Cá nhân")
            .task {
                streak = try? await APIClient.shared.fetchStreak()
                await vm.fetchProfile()
                if let p = try? await APIClient.shared.fetchEmailPreferences() {
                    emailSummary = ReminderScheduleLogic.summary(p)
                } else {
                    emailSummary = "Đang tắt"
                }
                if let p = try? await APIClient.shared.fetchReminderPreferences(.push) {
                    pushSummary = ReminderScheduleLogic.summary(p)
                } else {
                    pushSummary = "Đang tắt"
                }
            }
            .sheet(isPresented: $showChangePassword) { ChangePasswordView() }
            .alert("Đăng xuất khỏi Wordly?", isPresented: $confirmSignOut) {
                Button("Huỷ", role: .cancel) {}
                Button("Đăng xuất", role: .destructive) { Task { await authManager.signOut() } }
            } message: {
                Text("Bạn cần đăng nhập lại để tiếp tục học.")
            }
            .alert("Xoá vĩnh viễn tài khoản?", isPresented: $confirmDelete) {
                Button("Huỷ", role: .cancel) {}
                Button("Xoá tài khoản", role: .destructive) {
                    Task {
                        isDeleting = true
                        deleteError = nil
                        do {
                            try await authManager.deleteAccount()
                        } catch where AccountDeletion.isCancellation(error) {
                            // Tự đóng sheet Apple — không xoá, không báo lỗi
                        } catch {
                            deleteError = "Không xoá được tài khoản, thử lại sau."
                        }
                        isDeleting = false
                    }
                }
            } message: {
                if authManager.isAppleUser {
                    Text("Toàn bộ từ đã lưu, lịch sử dịch, sổ tay và cài đặt nhắc học sẽ bị xoá và không khôi phục được. Bạn sẽ xác nhận với Apple một lần nữa.")
                } else {
                    Text("Toàn bộ từ đã lưu, lịch sử dịch, sổ tay và cài đặt nhắc học sẽ bị xoá và không khôi phục được.")
                }
            }
        }
    }

    private var appVersion: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""
        return "\(v) (\(b))"
    }

    private func webURL(_ path: String) -> URL {
        URL(string: WordlyConfig.webBaseURL + path)!
    }

    private var accountHeader: some View {
        HStack(spacing: 14) {
            Text(String((vm.name.isEmpty ? vm.email : vm.name).prefix(1)).uppercased())
                .font(WordlyFonts.display(24))
                .foregroundStyle(WordlyColors.onElectric)
                .frame(width: 56, height: 56)
                .background(LinearGradient(colors: [WordlyColors.electric, WordlyColors.duoBlue], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 3) {
                Text(vm.name.isEmpty ? "Thêm tên của bạn" : vm.name)
                    .font(WordlyFonts.body(18, weight: .bold))
                    .foregroundStyle(vm.name.isEmpty ? WordlyColors.inkSoft : WordlyColors.ink)
                Text(vm.email).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
                Text(vm.learningSummary).font(WordlyFonts.body(12, weight: .semibold)).foregroundStyle(WordlyColors.electric)
            }
        }
        .padding(.vertical, 4)
    }

    private var streakCard: some View {
        HStack(spacing: 14) {
            Text("🔥").font(.system(size: 34))
            VStack(alignment: .leading, spacing: 2) {
                Text("\(streak?.streak ?? 0) ngày liên tiếp")
                    .font(WordlyFonts.display(20))
                    .foregroundStyle(WordlyColors.ink)
                Text("Tổng \(streak?.totalDays ?? 0) ngày đã học")
                    .font(WordlyFonts.body(13, weight: .medium))
                    .foregroundStyle(WordlyColors.inkSoft)
            }
            Spacer()
        }
        .padding(16)
        .background(WordlyColors.duoOrange.opacity(0.14))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.bottom, 8)
    }

    private var providerLabel: String {
        switch vm.authProvider {
        case "google": return "Đăng nhập bằng Google"
        case "apple": return "Đăng nhập bằng Apple"
        default: return "Đăng nhập bằng email"
        }
    }

    private func settingRow(_ icon: String, _ color: Color, _ title: String, _ subtitle: String?) -> some View {
        HStack(spacing: 12) {
            IconTile(systemImage: icon, color: color, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(WordlyFonts.body(15, weight: .medium)).foregroundStyle(icon.hasPrefix("rectangle.portrait") ? WordlyColors.error : WordlyColors.ink)
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
            }
        }
    }
}

struct ChangePasswordView: View {
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.colorScheme) var scheme
    @Environment(\.dismiss) var dismiss
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var showPw = false
    @State private var isLoading = false
    @State private var success = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                VStack(spacing: 24) {
                    if success {
                        VStack(spacing: 16) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(WordlyFonts.body(56))
                                .foregroundStyle(WordlyColors.electric)
                            Text("Mật khẩu đã được cập nhật!")
                                .font(WordlyFonts.body(18, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                        }
                        .padding(.top, 60)
                    } else {
                        VStack(spacing: 16) {
                            WordlySecureField(label: "Mật khẩu mới", placeholder: "Tối thiểu 6 ký tự",
                                             text: $newPassword, show: $showPw)
                            WordlySecureField(label: "Xác nhận mật khẩu", placeholder: "Nhập lại mật khẩu",
                                             text: $confirmPassword, show: $showPw)
                            if let err = error {
                                Text(err).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
                                    .padding(.horizontal, 12).padding(.vertical, 8)
                                    .background(WordlyColors.errorSoft).clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            HStack(spacing: 12) {
                                Button("Huỷ") { dismiss() }
                                    .frame(maxWidth: .infinity).padding(.vertical, 14)
                                    .background(WordlyColors.hoverBG)
                                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                                    .clipShape(RoundedRectangle(cornerRadius: 14))
                                Button { Task { await changePassword() } } label: {
                                    HStack { if isLoading { ProgressView().scaleEffect(0.8).tint(WordlyColors.onElectric) }; Text(isLoading ? "Đang lưu..." : "Lưu") }
                                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                                        .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric)
                                        .font(WordlyFonts.body(15, weight: .bold))
                                        .clipShape(RoundedRectangle(cornerRadius: 14))
                                }
                                .disabled(isLoading)
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.top, 16)
                    }
                    Spacer()
                }
            }
            .navigationTitle("Đổi mật khẩu")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Đóng") { dismiss() }.foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                }
            }
        }
    }

    private func changePassword() async {
        error = nil
        guard newPassword.count >= 6 else { error = "Mật khẩu phải có ít nhất 6 ký tự"; return }
        guard newPassword == confirmPassword else { error = "Mật khẩu xác nhận không khớp"; return }
        isLoading = true
        do {
            try await authManager.changePassword(newPassword: newPassword)
            success = true
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - ViewModel
@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var name = ""
    @Published var email = ""
    @Published var authProvider = "email"
    @Published var skillLevel = "B1"
    @Published var learningGoal = "daily"
    @Published var isLoading = true
    @Published var isSaving = false

    static let levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    static let goals: [(String, String)] = [
        ("daily", "💬 Giao tiếp hàng ngày"), ("toeic", "📊 TOEIC"), ("ielts", "🎓 IELTS"),
        ("business", "💼 Kinh doanh"), ("travel", "✈️ Du lịch"),
    ]

    /// "Trình độ B1 · 🎓 IELTS" — dòng tóm tắt dưới tên ở đầu trang Cá nhân.
    var learningSummary: String {
        let level = VocabCatalog.levelLabels[skillLevel] ?? skillLevel
        let goal = Self.goals.first { $0.0 == learningGoal }?.1 ?? learningGoal
        return "\(level) · \(goal)"
    }

    func fetchProfile() async {
        isLoading = true
        do {
            let resp = try await APIClient.shared.fetchProfile()
            email = resp.email ?? ""
            authProvider = resp.authProvider ?? "email"
            name = resp.profile?.name ?? ""
            skillLevel = resp.profile?.skillLevel ?? "B1"
            learningGoal = resp.profile?.learningGoal ?? "daily"
        } catch {}
        isLoading = false
    }

    /// Ghi hồ sơ; chỉ cập nhật trạng thái hiển thị khi server lưu thành công.
    func save(name: String, skillLevel: String, learningGoal: String) async -> Bool {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await APIClient.shared.updateProfile(
                name: name.isEmpty ? nil : name,
                skillLevel: skillLevel,
                learningGoal: learningGoal
            )
            self.name = name
            self.skillLevel = skillLevel
            self.learningGoal = learningGoal
            // Đổi trình độ → widget đổi lô từ kho theo trình độ mới
            Task { await WidgetSync.refreshBank() }
            return true
        } catch {
            return false
        }
    }
}
