import SwiftUI

// Từ vựng theo chủ đề — giống web /vocabulary-chat: lọc theo kỳ thi, chủ đề,
// trình độ, tìm kiếm; bấm vào từ để xem chi tiết, nghe phát âm, học với Alex.
@MainActor
final class TopicVocabularyViewModel: ObservableObject {
    @Published var exam: String?
    @Published var topic: String?
    @Published var level: String?
    @Published var query = ""
    @Published private(set) var pager = WordPager<TopicWord>()
    @Published var examCounts: [String: Int] = [:]
    @Published var topicCounts: [String: Int] = [:]
    @Published var state: Loadable<Void> = .idle
    @Published var isLoadingMore = false

    private var searchTask: Task<Void, Never>?

    func reload() async {
        state = .loading
        do {
            let r = try await APIClient.shared.fetchWordsByTopic(
                exam: exam, topic: topic, level: level, query: query, offset: 0,
                withCounts: examCounts.isEmpty)
            pager.reset(with: r.words, total: r.total)
            if let c = r.examCounts { examCounts = c }
            if let c = r.topicCounts { topicCounts = c }
            state = .loaded(())
        } catch {
            state = .failed("Không tải được từ vựng. Kiểm tra mạng rồi thử lại nhé.")
        }
    }

    func loadMore() async {
        guard pager.hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let r = try? await APIClient.shared.fetchWordsByTopic(
            exam: exam, topic: topic, level: level, query: query, offset: pager.nextOffset, withCounts: false) {
            pager.append(r.words)
        }
    }

    func searchChanged() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await reload()
        }
    }
}

struct TopicVocabularyView: View {
    @StateObject private var vm = TopicVocabularyViewModel()
    @State private var selected: TopicWord?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                filters
                LoadableView(state: vm.state, retry: { Task { await vm.reload() } }) { _ in
                    if vm.pager.items.isEmpty {
                        EmptyStateView(systemImage: "magnifyingglass", title: "Không có từ phù hợp",
                                       message: "Thử bỏ bớt bộ lọc hoặc đổi từ khoá.")
                    } else {
                        LazyVStack(spacing: 10) {
                            ForEach(vm.pager.items) { word in
                                Button { selected = word } label: { TopicWordRow(word: word) }
                                    .buttonStyle(.plain)
                                    .onAppear {
                                        if word.id == vm.pager.items.last?.id { Task { await vm.loadMore() } }
                                    }
                            }
                            if vm.isLoadingMore { ProgressView().tint(WordlyColors.electric).padding() }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.vertical, 12)
        }
        .screenBackground()
        .navigationTitle("Từ vựng theo chủ đề")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $vm.query, prompt: "Tìm từ…")
        .onChange(of: vm.query) { _, _ in vm.searchChanged() }
        .task { if case .idle = vm.state { await vm.reload() } }
        .sheet(item: $selected) { word in
            TopicWordDetailSheet(word: word)
                .presentationDetents([.medium, .large])
        }
    }

    private var filters: some View {
        VStack(alignment: .leading, spacing: 10) {
            optionalChips(VocabCatalog.exams, selection: $vm.exam, allLabel: "🌐 Mọi kỳ thi") { vm.examCounts[$0.key] }
            optionalChips(VocabCatalog.topics, selection: $vm.topic, allLabel: "🗂️ Mọi chủ đề") { vm.topicCounts[$0.key] }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    FilterChip(label: "Mọi trình độ", isSelected: vm.level == nil) { set(\.level, nil) }
                    ForEach(VocabCatalog.levels, id: \.self) { lv in
                        FilterChip(label: lv, isSelected: vm.level == lv) { set(\.level, lv) }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    private func optionalChips(_ options: [VocabCatalog.Option], selection: Binding<String?>, allLabel: String,
                               count: @escaping (VocabCatalog.Option) -> Int?) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(label: allLabel, isSelected: selection.wrappedValue == nil) {
                    selection.wrappedValue = nil
                    Task { await vm.reload() }
                }
                ForEach(options) { option in
                    FilterChip(label: option.label(count: count(option)), isSelected: selection.wrappedValue == option.key) {
                        selection.wrappedValue = option.key
                        Task { await vm.reload() }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }

    private func set(_ keyPath: ReferenceWritableKeyPath<TopicVocabularyViewModel, String?>, _ value: String?) {
        vm[keyPath: keyPath] = value
        Task { await vm.reload() }
    }
}

struct TopicWordRow: View {
    let word: TopicWord

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(word.word).font(WordlyFonts.body(17, weight: .bold)).foregroundStyle(WordlyColors.ink)
                if let pos = word.pos { PosBadge(pos: pos) }
                Spacer()
                if let level = word.level { Badge(text: level, color: WordlyColors.duoBlue) }
            }
            if let def = word.defEn {
                Text(def).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft).lineLimit(2)
            }
            if let topic = word.topicLabel {
                Text(topic).font(WordlyFonts.body(11, weight: .semibold)).foregroundStyle(WordlyColors.inkGhost)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .wordlyCard(padding: 14)
    }
}

struct TopicWordDetailSheet: View {
    let word: TopicWord
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(alignment: .firstTextBaseline) {
                    Text(word.word).font(WordlyFonts.display(30)).foregroundStyle(WordlyColors.ink)
                    if let pos = word.pos { PosBadge(pos: pos) }
                    Spacer()
                    if let level = word.level { Badge(text: level, color: WordlyColors.duoBlue) }
                }
                HStack(spacing: 10) {
                    accentButton("🇺🇸 US", lang: "en-US")
                    accentButton("🇬🇧 UK", lang: "en-GB")
                }
                if let def = word.defEn {
                    labeled("Nghĩa", def)
                }
                if let ex = word.exEn, !ex.isEmpty {
                    labeled("Ví dụ", "“\(ex)”", color: WordlyColors.duoBlue)
                }
                if let col = word.collocations, !col.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Cụm từ hay đi kèm").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                        FlowChips(items: col)
                    }
                }
                if let notes = word.usageNotes, !notes.isEmpty {
                    labeled("Lưu ý khi dùng", notes)
                }
                Button {
                    dismiss()
                    router.practice(word: word.word, wordId: word.id)
                } label: {
                    Label("Học từ này với Alex", systemImage: "bubble.left.and.text.bubble.right.fill")
                }
                .buttonStyle(ElectricButtonStyle(isFullWidth: true))
            }
            .padding(20)
        }
        .screenBackground()
    }

    private func accentButton(_ label: String, lang: String) -> some View {
        Button { Task { await tts.speak(word.word, lang: lang) } } label: {
            Label(label, systemImage: "speaker.wave.2.fill")
                .font(WordlyFonts.body(13, weight: .bold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(WordlyColors.electricSubtle)
                .foregroundStyle(WordlyColors.electric)
                .clipShape(Capsule())
        }
    }

    private func labeled(_ title: String, _ text: String, color: Color = WordlyColors.ink) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
            Text(text).font(WordlyFonts.body(15)).foregroundStyle(color)
        }
    }
}

/// Các chip xuống dòng tự động.
struct FlowChips: View {
    let items: [String]

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(items, id: \.self) { item in
                Text(item)
                    .font(WordlyFonts.body(13, weight: .medium))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(WordlyColors.hoverBG)
                    .foregroundStyle(WordlyColors.ink)
                    .clipShape(Capsule())
            }
        }
    }
}

/// Layout xếp phần tử theo hàng, tự xuống dòng khi hết chỗ.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for s in subviews {
            let size = s.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}
