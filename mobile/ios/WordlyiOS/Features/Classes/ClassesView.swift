import SwiftUI
import SafariServices

// "Lớp của tôi" — phía học viên của web /org + /org/classes/[id] + /join.
// Học viên thấy: Bài giảng, Bài tập, Bài nói, Quiz, Tiến độ của tôi.
@MainActor
final class ClassesViewModel: ObservableObject {
    struct OrgClasses: Identifiable {
        let org: Org
        let classes: [ClassInfo]
        var id: String { org.id }
    }

    @Published var state: Loadable<[OrgClasses]> = .idle

    func load() async {
        if state.value == nil { state = .loading }
        do {
            let orgs = try await APIClient.shared.fetchOrgs()
            var result: [OrgClasses] = []
            for org in orgs {
                let classes = (try? await APIClient.shared.fetchClasses(orgId: org.id).classes) ?? []
                result.append(OrgClasses(org: org, classes: classes))
            }
            state = .loaded(result)
        } catch {
            state = .failed("Không tải được danh sách lớp. Kiểm tra mạng rồi thử lại nhé.")
        }
    }
}

/// Danh sách lớp — được push từ Trang chủ (không tự bọc NavigationStack).
struct ClassesListContent: View {
    @StateObject private var vm = ClassesViewModel()
    @State private var showJoin = false

    var body: some View {
        ScrollView {
            LoadableView(state: vm.state, retry: { Task { await vm.load() } }) { groups in
                let all = groups.flatMap(\.classes)
                if all.isEmpty {
                    EmptyStateView(systemImage: "graduationcap.fill",
                                   title: "Bạn chưa tham gia lớp nào",
                                   message: "Nhập mã lớp giáo viên gửi để vào lớp, xem bài giảng, làm bài tập và bài nói.",
                                   actionTitle: "Nhập mã lớp") { showJoin = true }
                        .padding(.top, 40)
                } else {
                    VStack(alignment: .leading, spacing: 20) {
                        ForEach(groups.filter { !$0.classes.isEmpty }) { group in
                            VStack(alignment: .leading, spacing: 10) {
                                SectionHeader(title: group.org.name)
                                ForEach(group.classes) { klass in
                                    NavigationLink { ClassDetailView(klass: klass) } label: {
                                        ClassCard(klass: klass)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .screenBackground()
        .navigationTitle("Lớp của tôi")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showJoin = true } label: { Label("Nhập mã lớp", systemImage: "plus.circle.fill") }
            }
        }
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .sheet(isPresented: $showJoin) {
            JoinClassSheet { await vm.load() }
                .presentationDetents([.medium])
        }
    }
}

struct ClassCard: View {
    let klass: ClassInfo

    var body: some View {
        HStack(spacing: 14) {
            IconTile(systemImage: "person.3.fill", color: WordlyColors.duoBlue, size: 48)
            VStack(alignment: .leading, spacing: 4) {
                Text(klass.name).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                if let d = klass.description, !d.isEmpty {
                    Text(d).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
                }
                if let n = klass.memberCount {
                    Text("\(n) học viên").font(WordlyFonts.body(12, weight: .medium)).foregroundStyle(WordlyColors.inkGhost)
                }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(WordlyColors.inkGhost)
        }
        .wordlyCard(padding: 14)
    }
}

/// Nhập mã lớp — web /join. Sau khi vào lớp phải làm mới phiên đăng nhập vì
/// quyền trong trung tâm nằm trong JWT (xem CLAUDE.md §6).
struct JoinClassSheet: View {
    var onJoined: () async -> Void
    @State private var code = ""
    @State private var error: String?
    @State private var joining = false
    @State private var joinedName: String?
    @FocusState private var focused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Nhập mã lớp").font(WordlyFonts.display(24)).foregroundStyle(WordlyColors.ink)
            Text("Mã do giáo viên gửi, ví dụ WRD-7K2M.")
                .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft)
            if let joinedName {
                Label("Đã vào lớp \(joinedName)!", systemImage: "checkmark.seal.fill")
                    .font(WordlyFonts.body(16, weight: .bold))
                    .foregroundStyle(WordlyColors.electric)
            } else {
                TextField("Mã lớp", text: $code)
                    .font(WordlyFonts.body(22, weight: .bold))
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .focused($focused)
                    .wordlyInputStyle(focused: focused)
                    .onSubmit { Task { await join() } }
                if let error {
                    Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
                }
            }
            Button {
                if joinedName != nil { dismiss() } else { Task { await join() } }
            } label: {
                Text(joinedName != nil ? "Xong" : "Vào lớp")
            }
            .buttonStyle(ElectricButtonStyle(isLoading: joining, isFullWidth: true))
            .disabled(joining || (joinedName == nil && ClassLogic.normalizeJoinCode(code) == nil))
            Spacer()
        }
        .padding(24)
        .screenBackground()
        .onAppear { focused = true }
    }

    private func join() async {
        guard let normalized = ClassLogic.normalizeJoinCode(code) else {
            error = "Mã lớp không hợp lệ"
            return
        }
        joining = true
        error = nil
        defer { joining = false }
        do {
            let r = try await APIClient.shared.joinClass(code: normalized)
            guard r.ok else {
                error = r.error ?? "Không tham gia được lớp"
                return
            }
            // JWT cũ chưa có lớp mới → làm mới phiên rồi mới tải lại danh sách
            _ = try? await AuthManager.shared.supabase.auth.refreshSession()
            joinedName = r.className ?? "mới"
            await onJoined()
        } catch APIError.serverError(let m) {
            error = Self.message(from: m)
        } catch {
            self.error = "Không tham gia được lớp. Thử lại nhé."
        }
    }

    /// "HTTP 404: {\"error\":\"…\"}" → câu báo lỗi của server.
    static func message(from raw: String) -> String {
        if let start = raw.firstIndex(of: "{"),
           let data = String(raw[start...]).data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let msg = obj["error"] as? String {
            return msg
        }
        return "Không tham gia được lớp"
    }
}

// MARK: - Chi tiết lớp
struct ClassDetailView: View {
    let klass: ClassInfo

    enum Section: String, CaseIterable, Identifiable {
        case library = "Bài giảng", homework = "Bài tập", speaking = "Bài nói", quiz = "Quiz", progress = "Tiến độ"
        var id: String { rawValue }
    }
    @State private var section: Section = .library

    var body: some View {
        VStack(spacing: 0) {
            ChipBar(options: Section.allCases, selection: $section) { $0.rawValue }
                .padding(.vertical, 10)
            Divider()
            Group {
                switch section {
                case .library: ClassLibraryTab(classId: klass.id)
                case .homework: HomeworkListTab(classId: klass.id)
                case .speaking: SpeakingListTab(classId: klass.id)
                case .quiz: QuizView(classId: klass.id)
                case .progress: MyProgressTab(classId: klass.id)
                }
            }
            .frame(maxHeight: .infinity)
        }
        .screenBackground()
        .navigationTitle(klass.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: Bài giảng
struct ClassLibraryTab: View {
    let classId: String
    @State private var state: Loadable<[ClassSession]> = .idle
    @State private var openURL: IdentifiableURL?
    @State private var error: String?

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: { Task { await load() } }) { sessions in
                if sessions.isEmpty {
                    EmptyStateView(systemImage: "folder", title: "Chưa có bài giảng nào",
                                   message: "Giáo viên sẽ đăng tài liệu buổi học ở đây.")
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(sessions) { s in
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text(s.title).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                                    Spacer()
                                    if let d = s.sessionDate { Text(Self.formatDate(d)).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft) }
                                }
                                if let notes = s.notes, !notes.isEmpty {
                                    Text(notes).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
                                }
                                if s.lessonMaterials.isEmpty {
                                    Text("Chưa có tài liệu").font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkGhost)
                                }
                                ForEach(s.lessonMaterials) { m in
                                    Button { Task { await open(m) } } label: { MaterialRow(material: m) }
                                        .buttonStyle(.plain)
                                }
                            }
                            .wordlyCard(padding: 14)
                        }
                        if let error { Text(error).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error) }
                    }
                    .padding(16)
                }
            }
        }
        .task { if case .idle = state { await load() } }
        .refreshable { await load() }
        .sheet(item: $openURL) { SafariView(url: $0.url).ignoresSafeArea() }
    }

    private func load() async {
        do { state = .loaded(try await APIClient.shared.fetchSessions(classId: classId)) }
        catch { state = .failed("Không tải được bài giảng.") }
    }

    private func open(_ m: LessonMaterial) async {
        error = nil
        do {
            guard let url = try await APIClient.shared.materialURL(m) else { throw APIError.invalidURL }
            openURL = IdentifiableURL(url: url)
        } catch {
            self.error = "Không mở được tài liệu \"\(m.title)\"."
        }
    }

    static func formatDate(_ s: String) -> String {
        let p = s.split(separator: "-")
        return p.count == 3 ? "\(p[2])/\(p[1])/\(p[0])" : s
    }
}

struct MaterialRow: View {
    let material: LessonMaterial

    private var icon: (String, Color) {
        switch material.kind {
        case "video": return ("play.rectangle.fill", WordlyColors.error)
        case "link": return ("link", WordlyColors.duoBlue)
        default:
            if material.mimeType?.contains("pdf") == true { return ("doc.richtext.fill", WordlyColors.duoOrange) }
            if material.mimeType?.hasPrefix("audio") == true { return ("waveform", WordlyColors.duoPurple) }
            return ("doc.fill", WordlyColors.duoOrange)
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemImage: icon.0, color: icon.1, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(material.title).font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                if let d = material.description, !d.isEmpty {
                    Text(d).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
                }
            }
            Spacer()
            Image(systemName: "arrow.up.right.square").foregroundStyle(WordlyColors.inkGhost)
        }
        .padding(10)
        .background(WordlyColors.hoverBG)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

struct IdentifiableURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Mở tài liệu/video trong trình duyệt trong app (giữ người học ở lại app).
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ vc: SFSafariViewController, context: Context) {}
}

// MARK: Tiến độ của tôi
struct MyProgressTab: View {
    let classId: String
    @State private var state: Loadable<ClassProgressResponse.Student?> = .idle

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: { Task { await load() } }) { me in
                if let me {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        stat("🔥", "\(me.streakDays ?? 0)", "ngày liên tiếp")
                        stat("📚", "\(me.wordsSaved ?? 0)", "từ đã lưu")
                        stat("⏰", "\(me.wordsDue ?? 0)", "từ cần ôn")
                        stat(Self.stateIcon(me.state), Self.stateLabel(me.state), "trạng thái")
                    }
                    .padding(16)
                } else {
                    EmptyStateView(systemImage: "chart.bar", title: "Chưa có dữ liệu tiến độ")
                }
            }
        }
        .task { if case .idle = state { await load() } }
        .refreshable { await load() }
    }

    private func stat(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(icon).font(.system(size: 26))
            Text(value).font(WordlyFonts.display(24)).foregroundStyle(WordlyColors.ink)
            Text(label).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wordlyCard(padding: 14)
    }

    private func load() async {
        do { state = .loaded(try await APIClient.shared.fetchMyProgress(classId: classId).students.first) }
        catch { state = .failed("Không tải được tiến độ.") }
    }

    static func stateLabel(_ s: String?) -> String {
        switch s {
        case "active": return "Đều đặn"
        case "stalled": return "Chững lại"
        case "dropped": return "Lâu chưa học"
        default: return "—"
        }
    }
    static func stateIcon(_ s: String?) -> String {
        switch s {
        case "active": return "🟢"
        case "stalled": return "🟡"
        case "dropped": return "🔴"
        default: return "⚪️"
        }
    }
}
