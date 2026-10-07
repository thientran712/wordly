import SwiftUI

struct HistoryView: View {
    var isEmbedded: Bool = false
    var onPick: ((TranslateHistoryEntry) -> Void)? = nil

    @StateObject private var vm = HistoryViewModel()
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme
    @State private var collapsed = false
    @State private var confirmClear = false   // popup xác nhận "Xoá hết"

    var body: some View {
        if isEmbedded {
            embeddedView
        } else {
            NavigationStack {
                fullscreenView
                    .navigationTitle("Lịch sử dịch")
                    .navigationBarTitleDisplayMode(.large)
            }
        }
    }

    // MARK: - Embedded (inside Translate tab)
    private var embeddedView: some View {
        VStack(spacing: 0) {
            // Header row
            Button {
                withAnimation(.spring(response: 0.3)) { collapsed.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(WordlyFonts.body(13))
                        .foregroundStyle(WordlyColors.electric)
                    Text("Lịch sử dịch")
                        .font(WordlyFonts.body(14, weight: .bold))
                        .foregroundStyle(WordlyColors.ink(scheme: scheme))
                    Spacer()
                    if vm.isLoading {
                        ProgressView().scaleEffect(0.7).tint(WordlyColors.electric)
                    } else {
                        Text("\(vm.totalCount)")
                            .font(WordlyFonts.body(11, weight: .semibold))
                            .foregroundStyle(WordlyColors.electric)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(WordlyColors.electricSubtle)
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(WordlyColors.electricBorder, lineWidth: 1))
                    }
                    Image(systemName: "chevron.down")
                        .font(WordlyFonts.body(12, weight: .semibold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .rotationEffect(.degrees(collapsed ? 0 : 180))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .buttonStyle(.plain)

            if !collapsed {
                Divider().foregroundStyle(WordlyColors.divider(scheme: scheme))
                entriesList
                if vm.unsavedCount > 0 { clearButton }
            }
            if vm.undo != nil { undoBar }
        }
        .background(WordlyColors.cardBG(scheme: scheme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.cardBorder, lineWidth: 1))
        .animation(.easeInOut(duration: 0.2), value: vm.undo)
        .task { await vm.fetchHistory() }
        .confirmationDialog("Xoá lịch sử dịch?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Xoá \(vm.unsavedCount) mục chưa lưu", role: .destructive) { vm.clearUnsaved() }
            Button("Huỷ", role: .cancel) {}
        } message: {
            Text("Các từ bạn đã bấm Lưu sẽ được giữ lại (vẫn có trong quiz, email và widget). Bạn có thể hoàn tác ngay sau khi xoá.")
        }
    }

    /// "Xoá hết" nằm cuối danh sách — trước đây sát mũi tên thu gọn, hay bị bấm nhầm.
    private var clearButton: some View {
        HStack {
            Spacer()
            Button { confirmClear = true } label: {
                Label("Xoá lịch sử chưa lưu", systemImage: "trash")
                    .font(WordlyFonts.body(12, weight: .semibold))
                    .foregroundStyle(WordlyColors.error)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(WordlyColors.errorSoft)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    private var undoBar: some View {
        HStack {
            Text(vm.undo?.label ?? "")
                .font(WordlyFonts.body(13, weight: .semibold))
                .foregroundStyle(WordlyColors.ink(scheme: scheme))
            Spacer()
            Button { vm.undoLast() } label: {
                Label("Hoàn tác", systemImage: "arrow.uturn.backward")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(WordlyColors.electric)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(WordlyColors.electricSubtle)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(WordlyColors.hoverBG)
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Full screen (standalone tab)
    private var fullscreenView: some View {
        List {
            if vm.groups.isEmpty && !vm.isLoading {
                ContentUnavailableView("Chưa có lịch sử", systemImage: "clock",
                                       description: Text("Dịch và lưu từ để hiện ở đây"))
            } else {
                ForEach(vm.groups, id: \.day) { group in
                    Section(header: Text(group.dateLabel)
                        .font(WordlyFonts.body(10, weight: .bold))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .textCase(.uppercase)
                    ) {
                        ForEach(group.entries) { entry in
                            HistoryEntryRow(entry: entry, onPick: onPick)
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) { vm.delete(id: entry.id) } label: {
                                        Label("Xoá", systemImage: "trash")
                                    }
                                }
                        }
                    }
                }
                if vm.hasMore {
                    Button { Task { await vm.loadMore() } } label: {
                        HStack {
                            Spacer()
                            if vm.isLoadingMore {
                                ProgressView().scaleEffect(0.8)
                            } else {
                                Label("Tải thêm", systemImage: "chevron.down")
                                    .font(WordlyFonts.body(13, weight: .semibold))
                                    .foregroundStyle(WordlyColors.electric)
                            }
                            Spacer()
                        }
                    }
                    .listRowBackground(Color.clear)
                }
            }
        }
        .listStyle(.insetGrouped)
        .refreshable { await vm.fetchHistory() }
        .overlay { if vm.isLoading { ProgressView() } }
    }

    // MARK: - Embedded entries list
    private var entriesList: some View {
        VStack(spacing: 0) {
            ForEach(vm.groups, id: \.day) { group in
                // Date header
                Text(group.dateLabel)
                    .font(WordlyFonts.body(10, weight: .bold))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(WordlyColors.cardBG(scheme: scheme))

                ForEach(group.entries) { entry in
                    HistoryEntryRow(entry: entry, onPick: onPick)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                    Divider().padding(.leading, 16)
                }
            }

            if vm.hasMore {
                Button { Task { await vm.loadMore() } } label: {
                    HStack(spacing: 6) {
                        if vm.isLoadingMore {
                            ProgressView().scaleEffect(0.75).tint(WordlyColors.electric)
                            Text("Đang tải...")
                        } else {
                            Image(systemName: "chevron.down")
                            Text("Tải thêm")
                        }
                    }
                    .font(WordlyFonts.body(12, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

// MARK: - Entry Row
struct HistoryEntryRow: View {
    let entry: TranslateHistoryEntry
    var onPick: ((TranslateHistoryEntry) -> Void)?
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme
    @State private var showActions = false

    var body: some View {
        Button {
            onPick?(entry)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(entry.sourceText)
                            .font(WordlyFonts.body(14, weight: .semibold))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                            .lineLimit(2)
                        Text(entry.direction)
                            .font(WordlyFonts.body(9, weight: .bold))
                            .foregroundStyle(WordlyColors.electric)
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(WordlyColors.electricSubtle)
                            .clipShape(Capsule())
                        if entry.isSaved == true {
                            // Giống web: từ đã lưu sẽ được nhắc ôn tập (quiz, email, widget)
                            Label("Đã lưu", systemImage: "bookmark.fill")
                                .font(WordlyFonts.body(9, weight: .bold))
                                .foregroundStyle(WordlyColors.duoOrange)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(WordlyColors.duoOrange.opacity(0.14))
                                .clipShape(Capsule())
                        }
                    }
                    Text(entry.translatedText)
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                        .lineLimit(2)
                }
                Spacer()
                HStack(spacing: 4) {
                    Button {
                        Task { await tts.speak(entry.sourceText, lang: entry.direction == "EN→VI" ? "en-US" : "vi-VN") }
                    } label: {
                        Image(systemName: "speaker.wave.2")
                            .font(WordlyFonts.body(12))
                            .foregroundStyle(WordlyColors.electric)
                            .frame(width: 28, height: 28)
                            .background(WordlyColors.electricSubtle)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Group Model
struct HistoryGroup: Equatable {
    let day: String
    let dateLabel: String
    var entries: [TranslateHistoryEntry]
}

// MARK: - ViewModel
@MainActor
final class HistoryViewModel: ObservableObject {
    @Published var groups: [HistoryGroup] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = false
    private var offset = 0
    private let pageSize = 20

    var totalCount: Int { groups.reduce(0) { $0 + $1.entries.count } }

    func fetchHistory() async {
        isLoading = true
        offset = 0
        do {
            let resp = try await APIClient.shared.fetchHistory(limit: pageSize, offset: 0)
            groups = group(resp.history)
            hasMore = resp.hasMore
            offset = pageSize
            // Sync widget data
            AppGroupStorage.shared.syncWidgetData(from: resp.history)
        } catch {}
        isLoading = false
    }

    func loadMore() async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        do {
            let resp = try await APIClient.shared.fetchHistory(limit: pageSize, offset: offset)
            merge(resp.history)
            hasMore = resp.hasMore
            offset += pageSize
        } catch {}
        isLoadingMore = false
    }

    /// Thanh "Hoàn tác" sau khi xoá (xoá mềm trên server — khôi phục bằng id)
    struct Undo: Equatable {
        let label: String
        let ids: [String]
        let snapshot: [HistoryGroup]
    }
    @Published var undo: Undo?
    private var undoTask: Task<Void, Never>?

    var unsavedCount: Int { HistoryLogic.unsavedCount(groups) }

    func delete(id: String) {
        let snapshot = groups
        groups = groups.compactMap { g in
            var g = g
            g.entries.removeAll { $0.id == id }
            return g.entries.isEmpty ? nil : g
        }
        Task {
            let ids = (try? await APIClient.shared.deleteHistoryEntry(id: id)) ?? []
            showUndo("Đã xoá 1 mục", ids: ids, snapshot: snapshot)
        }
    }

    /// "Xoá hết" — chỉ mục CHƯA lưu; từ đã lưu ở lại (server cũng vậy).
    func clearUnsaved() {
        let snapshot = groups
        groups = HistoryLogic.removingUnsaved(groups)
        Task {
            let ids = (try? await APIClient.shared.clearAllHistory()) ?? []
            showUndo("Đã xoá \(ids.count) mục", ids: ids, snapshot: snapshot)
        }
    }

    func undoLast() {
        guard let undo else { return }
        undoTask?.cancel()
        groups = undo.snapshot
        self.undo = nil
        Task { try? await APIClient.shared.restoreHistory(ids: undo.ids) }
    }

    /// Server cũ (xoá cứng) không trả id → không có gì để hoàn tác → không hiện nút.
    private func showUndo(_ label: String, ids: [String], snapshot: [HistoryGroup]) {
        guard !ids.isEmpty else { return }
        undoTask?.cancel()
        undo = Undo(label: label, ids: ids, snapshot: snapshot)
        undoTask = Task {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if !Task.isCancelled { undo = nil }
        }
    }

    private func group(_ entries: [TranslateHistoryEntry]) -> [HistoryGroup] {
        var map: [(String, [TranslateHistoryEntry])] = []
        var keys: [String] = []
        var dict: [String: [TranslateHistoryEntry]] = [:]
        for entry in entries {
            let day = dayKey(for: entry)
            if dict[day] == nil { keys.append(day); dict[day] = [] }
            dict[day]!.append(entry)
        }
        for key in keys { map.append((key, dict[key]!)) }
        let today = isoDate(Date())
        let yesterday = isoDate(Date(timeIntervalSinceNow: -86400))
        return map.map { (day, entries) in
            let label: String
            if day == today { label = "Hôm nay" }
            else if day == yesterday { label = "Hôm qua" }
            else { label = formatDay(day) }
            return HistoryGroup(day: day, dateLabel: label, entries: entries)
        }
    }

    private func merge(_ entries: [TranslateHistoryEntry]) {
        for entry in entries {
            let day = dayKey(for: entry)
            if let idx = groups.firstIndex(where: { $0.day == day }) {
                groups[idx].entries.append(entry)
            } else {
                let today = isoDate(Date())
                let yesterday = isoDate(Date(timeIntervalSinceNow: -86400))
                let label = day == today ? "Hôm nay" : day == yesterday ? "Hôm qua" : formatDay(day)
                groups.append(HistoryGroup(day: day, dateLabel: label, entries: [entry]))
            }
        }
    }

    private func isoDate(_ d: Date) -> String { APIDate.dayKey(d) }
    // Ngày theo múi giờ máy, không cắt chuỗi UTC (lệch 7 tiếng ở VN)
    private func dayKey(for entry: TranslateHistoryEntry) -> String {
        APIDate.parse(entry.savedAt).map { APIDate.dayKey($0) } ?? String(entry.savedAt.prefix(10))
    }
    private func formatDay(_ iso: String) -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        guard let d = df.date(from: iso) else { return iso }
        df.dateFormat = "EEEE, d/M"
        df.locale = Locale(identifier: "vi_VN")
        return df.string(from: d)
    }
}
