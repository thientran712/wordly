import SwiftUI

struct WordsView: View {
    @StateObject private var vm = WordsViewModel()
    @Environment(\.colorScheme) var scheme
    @State private var selectedWord: Word?

    var body: some View {
        NavigationStack {
            ZStack {
                WordlyColors.bg(scheme: scheme).ignoresSafeArea()

                VStack(spacing: 0) {
                    // Tab bar
                    tabBar
                    // Search + filters
                    searchAndFilters
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)

                    // Count line
                    if !vm.isLoading {
                        HStack {
                            Text("\(vm.words.count) từ")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            if vm.hasActiveFilters {
                                Button("Xoá filter") { vm.resetFilters() }
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(WordlyColors.electric)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, 20)
                        .padding(.bottom, 6)
                    }

                    // Content
                    if vm.isLoading {
                        Spacer()
                        ProgressView().tint(WordlyColors.electric)
                        Spacer()
                    } else if vm.words.isEmpty {
                        emptyState
                    } else {
                        wordList
                    }
                }
            }
            .navigationTitle("📖 My Words")
            .navigationBarTitleDisplayMode(.large)
            .sheet(item: $selectedWord) { word in
                WordDetailView(word: word)
            }
            .task { await vm.fetch() }
        }
    }

    // MARK: - Tab bar
    private var tabBar: some View {
        HStack(spacing: 12) {
            ForEach([("📚 Đã học", "learned"), ("💖 Yêu thích", "bookmarked")], id: \.1) { label, value in
                Button {
                    vm.tab = value
                    vm.resetFilters()
                } label: {
                    Text(label)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(vm.tab == value ? Color(hex: "#0A0A0A") : WordlyColors.inkSoft(scheme: scheme))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .background(vm.tab == value ? WordlyColors.electric : WordlyColors.surfaceElevated(scheme: scheme))
                        .clipShape(Capsule())
                        .shadow(color: vm.tab == value ? WordlyColors.electric.opacity(0.3) : .clear, radius: 6, y: 3)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Search + Filters
    private var searchAndFilters: some View {
        VStack(spacing: 10) {
            // Search bar
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 15))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                TextField(vm.tab == "learned" ? "Tìm trong từ đã học..." : "Tìm trong yêu thích...",
                          text: $vm.query)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(WordlyColors.ink(scheme: scheme))
                if !vm.query.isEmpty {
                    Button { vm.query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(WordlyColors.surfaceElevated(scheme: scheme))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1.5))

            // Level filter chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    filterChip(label: "Tất cả", value: "")
                    ForEach(["A1", "A2", "B1", "B2", "C1", "C2"], id: \.self) { lvl in
                        filterChip(label: lvl, value: lvl)
                    }
                }
                .padding(.horizontal, 2)
            }
        }
    }

    private func filterChip(label: String, value: String) -> some View {
        let selected = vm.levelFilter == value
        return Button { vm.levelFilter = selected && !value.isEmpty ? "" : value } label: {
            Text(label)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(selected ? (value.isEmpty ? Color(hex: "#0A0A0A") : WordlyColors.electric) : WordlyColors.inkSoft(scheme: scheme))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selected ? (value.isEmpty ? WordlyColors.electric : WordlyColors.electricSubtle) : WordlyColors.surfaceElevated(scheme: scheme))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(selected ? WordlyColors.electricBorder : WordlyColors.divider(scheme: scheme), lineWidth: 1.5))
        }
    }

    // MARK: - Word list
    private var wordList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(vm.words) { word in
                    WordRowView(word: word) {
                        selectedWord = word
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 80)
        }
        .refreshable { await vm.fetch() }
    }

    // MARK: - Empty state
    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()
            Text(vm.hasActiveFilters ? "🔍" : vm.tab == "bookmarked" ? "💔" : "📭")
                .font(.system(size: 48))
            Text(vm.hasActiveFilters
                 ? "Không tìm thấy từ nào"
                 : vm.tab == "bookmarked" ? "Chưa có từ yêu thích"
                 : "Chưa học từ nào cả")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
            if vm.hasActiveFilters {
                Button("Xoá filter") { vm.resetFilters() }
                    .foregroundStyle(WordlyColors.electric)
                    .font(.system(size: 14, weight: .semibold))
            }
            Spacer()
        }
    }
}

// MARK: - Word Row
struct WordRowView: View {
    let word: Word
    let onTap: () -> Void
    @StateObject private var tts = TTSManager.shared
    @Environment(\.colorScheme) var scheme

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(word.word)
                            .font(.custom("Fraunces", size: 18).weight(.bold))
                            .foregroundStyle(WordlyColors.ink(scheme: scheme))
                        if word.isBookmarked == true {
                            Text("💖").font(.system(size: 12))
                        }
                    }
                    if let phonetic = word.phonetic, !phonetic.hasSuffix(".mp3") {
                        Text(phonetic)
                            .font(.system(size: 11, design: .serif).italic())
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    }
                    if let def = word.defEn {
                        Text(def)
                            .font(.system(size: 12))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .lineLimit(1)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 6) {
                    HStack(spacing: 6) {
                        if let state = word.userState { FSRSBadge(state: state) }
                        if let level = word.level { LevelBadge(level: level) }
                        Button {
                            Task { await tts.speak(word.word, lang: "en-US") }
                        } label: {
                            Image(systemName: "speaker.wave.2")
                                .font(.system(size: 13))
                                .foregroundStyle(WordlyColors.electric)
                                .frame(width: 30, height: 30)
                                .background(WordlyColors.electricSubtle)
                                .clipShape(Circle())
                                .overlay(Circle().stroke(WordlyColors.electricBorder, lineWidth: 1))
                        }
                    }
                    if let learnedAt = word.learnedDate {
                        Text("🗓 \(relativeDate(learnedAt))")
                            .font(.system(size: 10))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme).opacity(0.6))
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(WordlyColors.surfaceElevated(scheme: scheme))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.divider(scheme: scheme), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func relativeDate(_ date: Date) -> String {
        let days = Int(Date().timeIntervalSince(date) / 86400)
        if days == 0 { return "Hôm nay" }
        if days == 1 { return "Hôm qua" }
        if days < 7 { return "\(days) ngày trước" }
        if days < 30 { return "\(days / 7) tuần trước" }
        if days < 365 { return "\(days / 30) tháng trước" }
        return "\(days / 365) năm trước"
    }
}

// MARK: - Word Detail
struct WordDetailView: View {
    let word: Word
    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) var scheme
    @StateObject private var tts = TTSManager.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Header
                    VStack(spacing: 10) {
                        Text(word.word)
                            .font(.custom("Fraunces-Black", size: 52))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [WordlyColors.electric, Color(hex: "#86EFAC")],
                                    startPoint: .leading, endPoint: .trailing
                                )
                            )
                            .multilineTextAlignment(.center)

                        HStack(spacing: 8) {
                            if let phonetic = word.phonetic, !phonetic.hasSuffix(".mp3") {
                                Text(phonetic)
                                    .font(.system(size: 16, design: .serif).italic())
                                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            }
                            if let pos = word.pos {
                                Text(pos)
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundStyle(Color(hex: "#22C55E"))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color(hex: "#22C55E").opacity(0.12))
                                    .clipShape(Capsule())
                            }
                            if let level = word.level { LevelBadge(level: level) }
                            if let state = word.userState { FSRSBadge(state: state) }
                        }
                        .flexibleLayout()

                        Button {
                            Task { await tts.speak(word.word, lang: "en-US") }
                        } label: {
                            Image(systemName: tts.isSpeaking ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(.white)
                                .frame(width: 44, height: 44)
                                .background(
                                    LinearGradient(
                                        colors: [WordlyColors.electric, WordlyColors.electricDark],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                                .clipShape(Circle())
                                .shadow(color: WordlyColors.electric.opacity(0.4), radius: 8, y: 4)
                        }
                    }
                    .padding(.top, 8)

                    // Definition card
                    if let def = word.defEn {
                        infoCard(title: "📖 Definition", content: def, accentColor: WordlyColors.electric)
                    }

                    // Example card
                    if let ex = word.exEn {
                        infoCard(title: "💬 Example", content: "\"\(ex)\"", accentColor: Color(hex: "#60A5FA"), italic: true)
                    }

                    // Synonyms
                    if let synonyms = word.synonyms, !synonyms.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("✨ Synonyms")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(Color(hex: "#22C55E"))
                                .textCase(.uppercase)
                                .tracking(1.5)
                            FlowLayout(spacing: 8) {
                                ForEach(synonyms, id: \.self) { syn in
                                    Text(syn)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(Color(hex: "#22C55E"))
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Color(hex: "#22C55E").opacity(0.12))
                                        .clipShape(Capsule())
                                        .overlay(Capsule().stroke(Color(hex: "#22C55E").opacity(0.3), lineWidth: 1))
                                }
                            }
                        }
                        .wordlyCard()
                    }

                    Spacer(minLength: 40)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
            }
            .background(WordlyColors.bg(scheme: scheme).ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                            .frame(width: 30, height: 30)
                            .background(WordlyColors.surfaceElevated(scheme: scheme))
                            .clipShape(Circle())
                    }
                }
            }
        }
    }

    private func infoCard(title: String, content: String, accentColor: Color, italic: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(accentColor)
                .textCase(.uppercase)
                .tracking(1.5)
            Text(content)
                .font(italic ? .system(size: 14).italic() : .system(size: 14))
                .foregroundStyle(WordlyColors.ink(scheme: scheme))
                .lineSpacing(4)
        }
        .wordlyCard()
    }
}

// MARK: - ViewModel
@MainActor
final class WordsViewModel: ObservableObject {
    @Published var words: [Word] = []
    @Published var isLoading = false
    @Published var tab = "learned" { didSet { Task { await fetch() } } }
    @Published var query = "" { didSet { scheduleSearch() } }
    @Published var levelFilter = "" { didSet { Task { await fetch() } } }

    private var searchTask: Task<Void, Never>?

    var hasActiveFilters: Bool { !query.isEmpty || !levelFilter.isEmpty }

    func fetch() async {
        isLoading = true
        do {
            let resp = try await APIClient.shared.fetchWords(tab: tab, query: query, level: levelFilter)
            words = resp.words
        } catch {}
        isLoading = false
    }

    private func scheduleSearch() {
        searchTask?.cancel()
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled else { return }
            await fetch()
        }
    }

    func resetFilters() {
        query = ""
        levelFilter = ""
    }
}

// MARK: - Layout helpers
extension View {
    func flexibleLayout() -> some View {
        self.fixedSize(horizontal: false, vertical: true)
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let containerWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0
        for sv in subviews {
            let sz = sv.sizeThatFits(.unspecified)
            if x + sz.width > containerWidth { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += sz.width + spacing; rowHeight = max(rowHeight, sz.height)
        }
        return CGSize(width: containerWidth, height: y + rowHeight)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for sv in subviews {
            let sz = sv.sizeThatFits(.unspecified)
            if x + sz.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            sv.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing; rowHeight = max(rowHeight, sz.height)
        }
    }
}
