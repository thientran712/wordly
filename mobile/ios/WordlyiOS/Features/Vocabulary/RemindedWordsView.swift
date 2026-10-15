import SwiftUI
import TipKit

/// Tab "Đã nhắc" (đầu tiên trong Từ vựng): từ app đã nhắc 7 ngày qua — thông
/// báo đẩy, widget (và email cũ). Bấm từ → popup chi tiết; nút ôn bằng quiz.
@MainActor
final class RemindedViewModel: ObservableObject {
    @Published var sections: [RemindedLogic.Section] = []
    @Published var state: Loadable<Void> = .idle
    private static let pageSize = 50

    func loadIfNeeded() async {
        if case .idle = state { await load() }
    }

    func load() async {
        if sections.isEmpty { state = .loading }
        var all: [RemindedItem] = []
        var offset = 0
        var pages = 0
        do {
            while true {
                let page = try await APIClient.shared.fetchReminded(limit: Self.pageSize, offset: offset)
                all += page.items
                pages += 1
                offset += Self.pageSize
                guard RemindedLogic.shouldLoadMore(lastPage: page.items, hasMore: page.hasMore,
                                                   pagesLoaded: pages, now: Date()) else { break }
            }
            sections = RemindedLogic.group(all, now: Date())
            state = .loaded(())
        } catch {
            if sections.isEmpty { state = .failed("Không tải được danh sách đã nhắc.") }
        }
    }
}

struct RemindedWordsView: View {
    @ObservedObject var vm: RemindedViewModel
    @EnvironmentObject private var router: AppRouter
    @State private var selected: TranslateHistoryEntry?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    SectionHeader(title: "Đã nhắc 7 ngày qua")
                    if !vm.sections.isEmpty {
                        Button { router.selectedTab = .review } label: {
                            Label("Ôn bằng quiz", systemImage: "bolt.fill")
                        }
                        .font(WordlyFonts.body(13, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                    }
                }
                if !vm.sections.isEmpty {
                    TipView(RemindedTip())
                }
                switch vm.state {
                case .idle, .loading:
                    ProgressView().tint(WordlyColors.electric).frame(maxWidth: .infinity).padding(30)
                case .failed(let m):
                    ErrorStateView(message: m) { Task { await vm.load() } }.wordlyCard(padding: 0)
                case .loaded:
                    if vm.sections.isEmpty {
                        EmptyStateView(systemImage: "bell", title: "Tao chưa nhắc mày từ nào",
                                       message: "Bật Thông báo nhắc ôn hoặc thêm widget — từ được nhắc sẽ hiện ở đây.",
                                       actionTitle: "Bật thông báo") { router.selectedTab = .profile }
                            .wordlyCard(padding: 0)
                    } else {
                        ForEach(vm.sections) { section in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(section.title)
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .foregroundStyle(WordlyColors.inkSoft)
                                LazyVStack(spacing: 0) {
                                    ForEach(section.rows) { row in
                                        rowView(row)
                                        if row.id != section.rows.last?.id { Divider() }
                                    }
                                }
                                .wordlyCard(padding: 14)
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle("Từ vựng")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.loadIfNeeded() }
        .refreshable { await vm.load() }
        .sheet(item: $selected) { entry in SavedWordDetailSheet(entry: entry) }
    }

    private func rowView(_ row: RemindedLogic.Row) -> some View {
        Button { selected = row.detailEntry } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.word)
                        .font(WordlyFonts.body(16, weight: .bold))
                        .foregroundStyle(WordlyColors.ink)
                        .lineLimit(2)
                    if !row.meaning.isEmpty {
                        Text(row.meaning)
                            .font(WordlyFonts.body(13))
                            .foregroundStyle(WordlyColors.inkSoft)
                            .lineLimit(2)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 4) {
                    HStack(spacing: 4) {
                        ForEach(row.sources, id: \.self) { s in
                            Image(systemName: RemindedLogic.icon(for: s))
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                        }
                    }
                    Text(row.latest, format: .dateTime.hour().minute())
                        .font(WordlyFonts.body(11))
                        .foregroundStyle(WordlyColors.inkGhost)
                }
            }
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
