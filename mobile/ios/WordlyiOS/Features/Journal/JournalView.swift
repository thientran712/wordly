import SwiftUI

struct JournalView: View {
    @StateObject private var vm = JournalViewModel()
    @Environment(\.colorScheme) var scheme
    @State private var showAddSheet = false
    @FocusState private var inputFocused: Bool

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()

                VStack(spacing: 0) {
                    // Quick-add bar
                    quickAddBar

                    Divider().foregroundStyle(WordlyColors.divider(scheme: scheme))

                    // Entries
                    if vm.isLoading {
                        Spacer()
                        ProgressView().tint(WordlyColors.electric)
                        Spacer()
                    } else if vm.entries.isEmpty {
                        emptyState
                    } else {
                        entriesList
                    }
                }
            }
            .navigationTitle("📓 Journal")
            .navigationBarTitleDisplayMode(.large)
            .task { await vm.fetch() }
            .refreshable { await vm.fetch() }
        }
    }

    // MARK: - Quick-add bar
    private var quickAddBar: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                TextEditor(text: $vm.newContent)
                    .focused($inputFocused)
                    .font(.system(size: 14))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 60, maxHeight: 120)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(WordlyColors.inputBG(scheme: scheme))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(inputFocused ? WordlyColors.electric.opacity(0.5) : WordlyColors.divider(scheme: scheme), lineWidth: 1.5)
                    )
                    .overlay(alignment: .topLeading) {
                        if vm.newContent.isEmpty {
                            Text("Câu, bài học, hoặc câu hỏi bạn gặp hôm nay...")
                                .font(.system(size: 14))
                                .foregroundStyle(WordlyColors.inkGhost)
                                .padding(.horizontal, 16)
                                .padding(.top, 12)
                                .allowsHitTesting(false)
                        }
                    }
            }

            Button {
                Task { await vm.add(); inputFocused = false }
            } label: {
                HStack(spacing: 6) {
                    if vm.isAdding {
                        ProgressView().scaleEffect(0.75).tint(Color(hex: "#0A0A0A"))
                    } else {
                        Image(systemName: "plus")
                    }
                    Text(vm.isAdding ? "Đang lưu..." : "Thêm vào journal")
                        .font(.system(size: 14, weight: .bold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(vm.newContent.isEmpty ? WordlyColors.electric.opacity(0.4) : WordlyColors.electric)
                .foregroundStyle(Color(hex: "#0A0A0A"))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .shadow(color: WordlyColors.electric.opacity(0.25), radius: 6, y: 3)
            }
            .disabled(vm.newContent.isEmpty || vm.isAdding)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    // MARK: - Entries list
    private var entriesList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20, pinnedViews: [.sectionHeaders]) {
                ForEach(vm.groups, id: \.dateLabel) { group in
                    Section {
                        ForEach(group.entries) { entry in
                            JournalEntryRow(entry: entry) {
                                vm.delete(id: entry.id)
                            }
                        }
                    } header: {
                        Text(group.dateLabel)
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.5))
                            .textCase(.uppercase)
                            .tracking(1.5)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(WordlyColors.bg(scheme: scheme))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 80)
        }
    }

    // MARK: - Empty state
    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Image(systemName: "note.text")
                .font(.system(size: 48))
                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.2))
            Text("Chưa có ghi chú nào")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            Text("Ghi lại điều đầu tiên bạn học được hôm nay")
                .font(.system(size: 13))
                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.6))
                .multilineTextAlignment(.center)
            Spacer()
        }
    }
}

// MARK: - Entry Row
struct JournalEntryRow: View {
    let entry: JournalEntry
    let onDelete: () -> Void
    @Environment(\.colorScheme) var scheme
    @State private var isDeleting = false
    @State private var showConfirmDelete = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(entry.content)
                    .font(.system(size: 14))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                    .lineSpacing(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            VStack(alignment: .trailing, spacing: 8) {
                Text(timeAgo(entry.createdDate))
                    .font(.system(size: 10))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.5))
                    .monospacedDigit()

                Button {
                    if showConfirmDelete { onDelete() }
                    else {
                        showConfirmDelete = true
                        Task {
                            try? await Task.sleep(nanoseconds: 2_500_000_000)
                            showConfirmDelete = false
                        }
                    }
                } label: {
                    Image(systemName: isDeleting ? "arrow.circlepath" : showConfirmDelete ? "trash.fill" : "trash")
                        .font(.system(size: 12))
                        .foregroundStyle(showConfirmDelete ? WordlyColors.error : WordlyColors.inkSoft(scheme: scheme))
                        .frame(width: 28, height: 28)
                        .background(showConfirmDelete ? WordlyColors.errorSoft : WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(WordlyColors.cardBG(scheme: scheme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1.5))
    }

    private func timeAgo(_ date: Date) -> String {
        let diff = Int(Date().timeIntervalSince(date))
        if diff < 60 { return "vừa xong" }
        if diff < 3600 { return "\(diff / 60) phút trước" }
        if diff < 86400 { return "\(diff / 3600) giờ trước" }
        if diff < 86400 * 7 { return "\(diff / 86400) ngày trước" }
        let df = DateFormatter(); df.dateFormat = "dd/MM/yyyy"; df.locale = Locale(identifier: "vi_VN")
        return df.string(from: date)
    }
}

// MARK: - Group Model
struct JournalGroup {
    let dateLabel: String
    var entries: [JournalEntry]
}

// MARK: - ViewModel
@MainActor
final class JournalViewModel: ObservableObject {
    @Published var entries: [JournalEntry] = []
    @Published var groups: [JournalGroup] = []
    @Published var isLoading = false
    @Published var isAdding = false
    @Published var newContent = ""

    func fetch() async {
        isLoading = true
        do {
            let resp = try await APIClient.shared.fetchJournal()
            entries = resp.entries
            groups = buildGroups(resp.entries)
        } catch {}
        isLoading = false
    }

    func add() async {
        let content = newContent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty else { return }
        isAdding = true
        do {
            let entry = try await APIClient.shared.addJournalEntry(content: content)
            entries.insert(entry, at: 0)
            groups = buildGroups(entries)
            newContent = ""
        } catch {}
        isAdding = false
    }

    func delete(id: String) {
        entries.removeAll { $0.id == id }
        groups = buildGroups(entries)
        Task { try? await APIClient.shared.deleteJournalEntry(id: id) }
    }

    private func buildGroups(_ entries: [JournalEntry]) -> [JournalGroup] {
        var map: [(String, [JournalEntry])] = []
        var keys: [String] = []
        var dict: [String: [JournalEntry]] = [:]
        let df = DateFormatter()
        df.dateFormat = "EEEE, d MMMM yyyy"
        df.locale = Locale(identifier: "vi_VN")
        for entry in entries {
            let day = String(entry.createdAt.prefix(10))
            if dict[day] == nil { keys.append(day); dict[day] = [] }
            dict[day]!.append(entry)
        }
        for key in keys { map.append((key, dict[key]!)) }
        return map.map { (_, entries) in
            let date = entries.first!.createdDate
            return JournalGroup(dateLabel: df.string(from: date), entries: entries)
        }
    }
}
