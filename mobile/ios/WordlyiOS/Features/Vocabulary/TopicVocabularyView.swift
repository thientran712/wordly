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
    @EnvironmentObject private var router: AppRouter
    @State private var selected: TopicWord?
    @State private var showFilters = false

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
        }
        .sheet(isPresented: $showFilters) { filterSheet }
        // Bấm widget (từ mới trong kho) → mở popup ngay bằng từ + nghĩa trong
        // link, rồi tải đủ chi tiết (ví dụ, cụm từ…) thay vào cùng popup.
        .onChange(of: router.widgetWord, initial: true) { _, link in
            guard let link, link.fromBank else { return }
            router.widgetWord = nil
            let id = link.bankWordId ?? link.id
            selected = TopicWord(id: id, word: link.word, pos: nil, level: nil, defEn: link.meaning, exEn: nil,
                                 phonetic: nil, topic: nil, topicLabel: nil, collocations: nil, usageNotes: nil)
            Task {
                let found = try? await APIClient.shared.fetchWordsByTopic(exam: nil, topic: nil, level: nil,
                                                                          query: link.word, offset: 0, withCounts: false)
                    .words.first { $0.id == id }
                if let found, selected?.id == id { selected = found }
            }
        }
    }

    /// 1 dòng: tóm tắt bộ lọc + nút "Lọc" (trước là 3 hàng chip cuộn ngang chiếm 1/3 màn — N1)
    private var filters: some View {
        let n = VocabCatalog.activeFilterCount(exam: vm.exam, topic: vm.topic, level: vm.level)
        return HStack(spacing: 10) {
            Text(VocabCatalog.filterSummary(exam: vm.exam, topic: vm.topic, level: vm.level))
                .font(WordlyFonts.body(14, weight: .semibold))
                .foregroundStyle(WordlyColors.ink)
                .lineLimit(1)
            Spacer(minLength: 8)
            Button { showFilters = true } label: {
                Label(n > 0 ? "Lọc (\(n))" : "Lọc", systemImage: "line.3.horizontal.decrease")
                    .font(WordlyFonts.body(14, weight: .bold))
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(n > 0 ? WordlyColors.electricSubtle : WordlyColors.hoverBG)
                    .foregroundStyle(n > 0 ? WordlyColors.electric : WordlyColors.ink)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("vocabFilterOpen")
        }
        .padding(.horizontal, 16)
    }

    /// Sheet 3 nhóm lọc; chọn là áp ngay, nút đáy ghi số từ để biết trước khi đóng.
    private var filterSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    filterGroup("Kỳ thi", VocabCatalog.exams, selection: \.exam) { vm.examCounts[$0.key] }
                    filterGroup("Chủ đề", VocabCatalog.topics, selection: \.topic) { vm.topicCounts[$0.key] }
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Trình độ").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                        FlowLayout(spacing: 8) {
                            ForEach(VocabCatalog.levels, id: \.self) { lv in
                                FilterChip(label: lv, isSelected: vm.level == lv) { set(\.level, vm.level == lv ? nil : lv) }
                            }
                        }
                    }
                }
                .padding(20)
            }
            .safeAreaInset(edge: .bottom) {
                Button { showFilters = false } label: {
                    Text(vm.pager.total.map { "Xem \($0) từ" } ?? "Xem kết quả")
                }
                .buttonStyle(ElectricButtonStyle(isLoading: vm.state.isLoading, isFullWidth: true))
                .padding(16)
                .background(WordlyColors.background)
                .accessibilityIdentifier("vocabFilterApply")
            }
            .screenBackground()
            .navigationTitle("Lọc từ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if VocabCatalog.activeFilterCount(exam: vm.exam, topic: vm.topic, level: vm.level) > 0 {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Bỏ lọc") {
                            vm.exam = nil; vm.topic = nil; vm.level = nil
                            Task { await vm.reload() }
                        }
                    }
                }
            }
        }
        .presentationDetents([.large])
    }

    private func filterGroup(_ title: String, _ options: [VocabCatalog.Option],
                             selection: ReferenceWritableKeyPath<TopicVocabularyViewModel, String?>,
                             count: @escaping (VocabCatalog.Option) -> Int?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
            FlowLayout(spacing: 8) {
                ForEach(options) { option in
                    let on = vm[keyPath: selection] == option.key
                    FilterChip(label: option.label(count: count(option)), isSelected: on) {
                        set(selection, on ? nil : option.key)
                    }
                }
            }
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
            // Nghĩa Việt (nếu đã có trong bảng của widget) trước, định nghĩa Anh sau (N2)
            let m = BankWordLogic.meanings(vi: BankWordLogic.cachedVi(word.word), en: word.defEn)
            if !m.main.isEmpty {
                Text(m.main).font(WordlyFonts.body(14, weight: .semibold)).foregroundStyle(WordlyColors.ink).lineLimit(2)
            }
            if let en = m.secondary {
                Text(en).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
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
    @State private var vi: String?
    @State private var saving = false
    @State private var saved = false
    @State private var toast: String?

    private var meanings: (main: String, secondary: String?) { BankWordLogic.meanings(vi: vi, en: word.defEn) }

    var body: some View {
        FitContentSheet {
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
                if !meanings.main.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Nghĩa").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                        Text(meanings.main).font(WordlyFonts.body(17, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                        if let en = meanings.secondary {
                            Text(en).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft)
                        }
                    }
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
                // Lưu từ là bước kích hoạt (từ đã lưu mới vào quiz + widget) → nút chính (N3)
                Button { Task { await save() } } label: {
                    Label(saved ? "Đã lưu" : "Lưu từ này", systemImage: saved ? "checkmark" : "bookmark.fill")
                }
                .buttonStyle(ElectricButtonStyle(isLoading: saving, isFullWidth: true))
                .disabled(saved || saving || BankWordLogic.meaningToSave(vi: vi) == nil)
                .accessibilityIdentifier("bankWordSave")
                if AppRouter.alexPracticeEnabled {
                    Button {
                        dismiss()
                        router.practice(word: word.word, wordId: word.id)
                    } label: {
                        Label("Học từ này với Alex", systemImage: "bubble.left.and.text.bubble.right.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(GhostButtonStyle())
                }
            }
            .padding(20)
        }
        .screenBackground()
        .toast($toast, systemImage: "exclamationmark.circle.fill", color: WordlyColors.duoOrange)
        .task {
            vi = BankWordLogic.cachedVi(word.word)
            // Từ trong kho tra miễn phí (không trừ lượt tra từ mới)
            if let d = try? await APIClient.shared.lookupWord(word.word), !d.shortMeaningVi.isEmpty {
                vi = d.shortMeaningVi
            }
        }
    }

    private func save() async {
        guard let meaning = BankWordLogic.meaningToSave(vi: vi), !saved else { return }
        saving = true
        defer { saving = false }
        do {
            try await APIClient.shared.markSaved(sourceText: word.word, translatedText: meaning, direction: "EN→VI")
            saved = true
            SavedWordsSignal.shared.changed()
            Task {
                await WidgetSync.refresh()
                await ProStore.shared.noteSaved()
            }
        } catch {
            // Hết chỗ lưu (bản miễn phí) → paywall; lỗi khác → báo nhẹ
            if !ProStore.shared.handle(error) { toast = "Không lưu được, thử lại nhé" }
        }
    }

    private func accentButton(_ label: String, lang: String) -> some View {
        Button { tts.toggle(word.word, lang: lang) } label: {
            Label(label, systemImage: "speaker.wave.2.fill")
                .font(WordlyFonts.body(13, weight: .bold))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(WordlyColors.electricSubtle)
                .foregroundStyle(WordlyColors.electric)
                .clipShape(Capsule())
        }
        .speakLocked(tts, text: word.word, lang: lang)
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
