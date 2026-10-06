import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var authManager: AuthManager
    @EnvironmentObject var themeManager: ThemeManager
    @StateObject private var vm = ProfileViewModel()
    @Environment(\.colorScheme) var scheme
    @AppStorage("wordly-theme") private var savedTheme: String = "dark"
    @State private var showChangePassword = false
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 16) {
                        // Account card
                        accountCard
                        // Personal info card
                        personalInfoCard
                        // Learning preferences card
                        learningPrefsCard
                        // Appearance card
                        appearanceCard
                        // Save button
                        saveButton
                        // Sign out
                        signOutButton

                        Spacer(minLength: 60)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 40)
                }
            }
            .navigationTitle("👤 Hồ sơ")
            .navigationBarTitleDisplayMode(.large)
            .task { await vm.fetchProfile() }
            .sheet(isPresented: $showChangePassword) { ChangePasswordView() }
            .alert("Đăng xuất", isPresented: $showSignOutConfirm) {
                Button("Huỷ", role: .cancel) {}
                Button("Đăng xuất", role: .destructive) { Task { await authManager.signOut() } }
            } message: {
                Text("Bạn có chắc muốn đăng xuất?")
            }
        }
    }

    // MARK: - Account card
    private var accountCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle("Tài khoản", icon: "envelope.fill")

            VStack(alignment: .leading, spacing: 6) {
                Text("Email")
                    .font(WordlyFonts.body(11, weight: .bold))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    .textCase(.uppercase)
                    .tracking(1)
                if vm.isLoading {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(WordlyColors.hoverBG)
                        .frame(width: 200, height: 20)
                } else {
                    HStack(spacing: 8) {
                        Text(vm.email)
                            .font(WordlyFonts.body(15, weight: .semibold))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        Text(vm.authProvider)
                            .font(WordlyFonts.body(10, weight: .bold))
                            .foregroundStyle(WordlyColors.electric)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(WordlyColors.electricSubtle)
                            .clipShape(Capsule())
                    }
                }
            }

            if !vm.isLoading && vm.authProvider == "email" {
                Button {
                    showChangePassword = true
                } label: {
                    Label("Đổi mật khẩu", systemImage: "key.fill")
                        .font(WordlyFonts.body(14, weight: .semibold))
                        .foregroundStyle(WordlyColors.electric)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(WordlyColors.electricSubtle)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(WordlyColors.electricBorder, lineWidth: 1.5))
                }
            }
        }
        .wordlyCard()
    }

    // MARK: - Personal info card
    private var personalInfoCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle("Thông tin cá nhân", icon: "person.fill")

            VStack(alignment: .leading, spacing: 6) {
                Text("Tên của bạn")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                if vm.isLoading {
                    RoundedRectangle(cornerRadius: 12).fill(WordlyColors.hoverBG).frame(height: 48)
                } else {
                    TextField("Nguyễn Văn A", text: $vm.name)
                        .font(WordlyFonts.body(15))
                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        .wordlyInputStyle()
                }
            }
        }
        .wordlyCard()
    }

    // MARK: - Learning preferences
    private var learningPrefsCard: some View {
        VStack(alignment: .leading, spacing: 20) {
            sectionTitle("Tùy chọn học tập", icon: "target")

            // Skill level
            VStack(alignment: .leading, spacing: 10) {
                Label("Trình độ tiếng Anh", systemImage: "book.fill")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))

                if vm.isLoading {
                    HStack(spacing: 8) {
                        ForEach(0..<6, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 10).fill(WordlyColors.hoverBG)
                                .frame(height: 36).frame(maxWidth: .infinity)
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        ForEach(["A1", "A2", "B1", "B2", "C1", "C2"], id: \.self) { level in
                            let selected = vm.skillLevel == level
                            Button { vm.skillLevel = level } label: {
                                Text(level)
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .foregroundStyle(selected ? WordlyColors.onElectric : WordlyColors.inkSoft(scheme: scheme))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 36)
                                    .background(selected ? WordlyColors.electric : WordlyColors.hoverBG)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? .clear : WordlyColors.divider(scheme: scheme), lineWidth: 1.5))
                                    .shadow(color: selected ? WordlyColors.electric.opacity(0.3) : .clear, radius: 4, y: 2)
                                    .scaleEffect(selected ? 1.05 : 1)
                            }
                        }
                    }
                }
            }

            // Learning goal
            VStack(alignment: .leading, spacing: 10) {
                Label("Mục tiêu học tập", systemImage: "trophy.fill")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))

                let goals: [(String, String)] = [
                    ("daily", "💬 Giao tiếp hàng ngày"),
                    ("toeic", "📊 TOEIC"),
                    ("ielts", "🎓 IELTS"),
                    ("business", "💼 Kinh doanh"),
                    ("travel", "✈️ Du lịch"),
                ]

                if vm.isLoading {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(0..<4, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 10).fill(WordlyColors.hoverBG).frame(height: 36)
                        }
                    }
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(goals, id: \.0) { value, label in
                            let selected = vm.learningGoal == value
                            Button { vm.learningGoal = value } label: {
                                Text(label)
                                    .font(WordlyFonts.body(12, weight: .bold))
                                    .foregroundStyle(selected ? WordlyColors.onElectric : WordlyColors.inkSoft(scheme: scheme))
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 36)
                                    .background(selected ? WordlyColors.electric : WordlyColors.hoverBG)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected ? .clear : WordlyColors.divider(scheme: scheme), lineWidth: 1.5))
                                    .scaleEffect(selected ? 1.02 : 1)
                                    .shadow(color: selected ? WordlyColors.electric.opacity(0.3) : .clear, radius: 4, y: 2)
                            }
                        }
                    }
                }
            }
        }
        .wordlyCard()
    }

    // MARK: - Appearance card
    private var appearanceCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle("Giao diện", icon: "paintbrush.fill")
            HStack {
                Text("Chế độ màu")
                    .font(WordlyFonts.body(14, weight: .semibold))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                Spacer()
                HStack(spacing: 0) {
                    themeButton(icon: "moon.fill", label: "Tối", value: "dark")
                    themeButton(icon: "sun.max.fill", label: "Sáng", value: "light")
                }
                .background(WordlyColors.hoverBG)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .wordlyCard()
    }

    private func themeButton(icon: String, label: String, value: String) -> some View {
        let selected = savedTheme == value
        return Button {
            savedTheme = value
            themeManager.apply(value)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(WordlyFonts.body(12))
                Text(label).font(WordlyFonts.body(13, weight: .semibold))
            }
            .foregroundStyle(selected ? WordlyColors.onElectric : WordlyColors.inkSoft(scheme: scheme))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(selected ? WordlyColors.electric : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 9))
        }
    }

    // MARK: - Save button
    private var saveButton: some View {
        Button {
            Task { await vm.save() }
        } label: {
            HStack(spacing: 8) {
                if vm.isSaving {
                    ProgressView().tint(WordlyColors.onElectric).scaleEffect(0.8)
                } else if vm.saveSuccess {
                    Image(systemName: "checkmark")
                }
                Text(vm.isSaving ? "Đang lưu..." : vm.saveSuccess ? "Đã lưu!" : "💾 Lưu thay đổi")
                    .font(WordlyFonts.body(16, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(vm.saveSuccess ? WordlyColors.electricSubtle : WordlyColors.electric)
            .foregroundStyle(vm.saveSuccess ? WordlyColors.electric : WordlyColors.onElectric)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(vm.saveSuccess ? WordlyColors.electricBorder : .clear, lineWidth: 1.5))
            .shadow(color: vm.saveSuccess ? .clear : WordlyColors.electric.opacity(0.3), radius: 8, y: 4)
        }
        .disabled(vm.isSaving || vm.isLoading)
    }

    // MARK: - Sign out
    private var signOutButton: some View {
        Button { showSignOutConfirm = true } label: {
            Label("Đăng xuất", systemImage: "rectangle.portrait.and.arrow.right")
                .font(WordlyFonts.body(15, weight: .semibold))
                .foregroundStyle(WordlyColors.error)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(WordlyColors.errorSoft)
                .clipShape(RoundedRectangle(cornerRadius: 16))
        }
    }

    private func sectionTitle(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon)
            .font(WordlyFonts.body(18, weight: .bold))
            .foregroundStyle(WordlyColors.ink(scheme: scheme))
    }
}

// MARK: - Change Password
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
