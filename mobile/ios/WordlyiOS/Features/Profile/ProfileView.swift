import SwiftUI

// Hồ sơ & cài đặt — gom các mục của web (/profile, /profile/email) + cài đặt
// riêng của app (widget màn hình khoá, giao diện).
struct ProfileView: View {
    @StateObject private var vm = ProfileViewModel()
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var themeManager: ThemeManager
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"
    @State private var showChangePassword = false
    @State private var confirmSignOut = false
    @State private var emailSummary = ""

    private let levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    private let goals: [(String, String)] = [
        ("daily", "💬 Giao tiếp hàng ngày"), ("toeic", "📊 TOEIC"), ("ielts", "🎓 IELTS"),
        ("business", "💼 Kinh doanh"), ("travel", "✈️ Du lịch"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section { accountHeader }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())

                Section {
                    TextField("Tên của bạn", text: $vm.name)
                    Picker("Trình độ", selection: $vm.skillLevel) {
                        ForEach(levels, id: \.self) { Text(VocabCatalog.levelLabels[$0] ?? $0).tag($0) }
                    }
                    Picker("Mục tiêu", selection: $vm.learningGoal) {
                        ForEach(goals, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    Button {
                        Task { await vm.save() }
                    } label: {
                        HStack {
                            if vm.isSaving { ProgressView() }
                            Text(vm.saveSuccess ? "Đã lưu ✓" : "Lưu thay đổi")
                        }
                    }
                    .foregroundStyle(WordlyColors.electric)
                    .disabled(vm.isSaving)
                } header: {
                    Text("Học tập")
                } footer: {
                    Text("Alex dùng trình độ và mục tiêu để chọn cách nói chuyện phù hợp với bạn.")
                }

                Section("Nhắc học") {
                    NavigationLink { EmailSettingsView() } label: {
                        settingRow("envelope.fill", WordlyColors.duoBlue, "Email nhắc học", emailSummary)
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

                Section("Tài khoản") {
                    if vm.authProvider == "email" {
                        Button { showChangePassword = true } label: {
                            settingRow("key.fill", WordlyColors.duoOrange, "Đổi mật khẩu", nil)
                        }
                    }
                    Button(role: .destructive) { confirmSignOut = true } label: {
                        settingRow("rectangle.portrait.and.arrow.right", WordlyColors.error, "Đăng xuất", nil)
                    }
                }

                Section {
                    Text("Wordly \(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "") (\(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? ""))")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkGhost)
                        .frame(maxWidth: .infinity)
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Hồ sơ")
            .task {
                await vm.fetchProfile()
                if let p = try? await APIClient.shared.fetchEmailPreferences() {
                    emailSummary = EmailSettingsLogic.summary(p)
                } else {
                    emailSummary = "Đang tắt"
                }
            }
            .sheet(isPresented: $showChangePassword) { ChangePasswordView() }
            .confirmationDialog("Đăng xuất khỏi Wordly?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Đăng xuất", role: .destructive) { Task { await authManager.signOut() } }
                Button("Huỷ", role: .cancel) {}
            }
        }
    }

    private var accountHeader: some View {
        HStack(spacing: 14) {
            Text(String((vm.name.isEmpty ? vm.email : vm.name).prefix(1)).uppercased())
                .font(WordlyFonts.display(26))
                .foregroundStyle(WordlyColors.onElectric)
                .frame(width: 60, height: 60)
                .background(LinearGradient(colors: [WordlyColors.electric, WordlyColors.duoBlue], startPoint: .topLeading, endPoint: .bottomTrailing))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(vm.name.isEmpty ? "Học viên Wordly" : vm.name)
                    .font(WordlyFonts.body(18, weight: .bold))
                    .foregroundStyle(WordlyColors.ink)
                Text(vm.email).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
                Badge(text: providerLabel, color: WordlyColors.duoBlue)
            }
            Spacer()
        }
        .padding(.vertical, 8)
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
    @Published var saveSuccess = false

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

    func save() async {
        isSaving = true
        do {
            _ = try await APIClient.shared.updateProfile(
                name: name.isEmpty ? nil : name,
                skillLevel: skillLevel,
                learningGoal: learningGoal
            )
            saveSuccess = true
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            saveSuccess = false
        } catch {}
        isSaving = false
    }
}
