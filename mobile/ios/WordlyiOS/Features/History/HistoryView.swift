import SwiftUI

struct HistoryView: View {
    var isEmbedded: Bool = false
    var onPick: ((TranslateHistoryEntry) -> Void)? = nil

    @StateObject private var vm = HistoryViewModel()
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme
    @State private var collapsed = false
    @State private var confirmClear = false

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
                    Button {
                        if confirmClear {
                            vm.clearAll()
                            confirmClear = false
                        } else {
                            confirmClear = true
                            Task {
                                try? await Task.sleep(nanoseconds: 3_000_000_000)
                                confirmClear = false
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "trash")
                                .font(WordlyFonts.body(11))
                            Text(confirmClear ? "Chắc chắn?" : "Xoá hết")
                                .font(WordlyFonts.body(11, weight: .semibold))
                        }
                        .foregroundStyle(confirmClear ? WordlyColors.error : WordlyColors.inkSoft(scheme: scheme))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(confirmClear ? WordlyColors.errorSoft : WordlyColors.hoverBG)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
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
            }
        }
        .background(WordlyColors.cardBG(scheme: scheme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.cardBorder, lineWidth: 1))
        .task { await vm.fetchHistory() }
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
struct HistoryGroup {
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

    func delete(id: String) {
        groups = groups.compactMap { g in
            var g = g
            g.entries.removeAll { $0.id == id }
            return g.entries.isEmpty ? nil : g
        }
        Task { try? await APIClient.shared.deleteHistoryEntry(id: id) }
    }

    func clearAll() {
        groups = []
        Task { try? await APIClient.shared.clearAllHistory() }
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
