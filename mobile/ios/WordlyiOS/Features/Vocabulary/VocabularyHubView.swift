import SwiftUI

// Tab Từ vựng: từ bạn đã lưu (kèm lượt từ widget sắp hiện — từ của bạn xen kẽ
// từ mới trong kho) và kho từ theo chủ đề.
struct VocabularyHubView: View {
    enum Mode: Hashable, CaseIterable { case saved, topics }
    @State private var mode: Mode = .saved

    var body: some View {
        NavigationStack {
            Group {
                switch mode {
                case .saved: SavedWordsView()
                case .topics: TopicVocabularyView()
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                HubPicker(options: Mode.allCases, selection: $mode,
                          title: { $0 == .saved ? "Đã lưu" : "Kho theo chủ đề" },
                          icon: { $0 == .saved ? "bookmark.fill" : "square.grid.2x2.fill" })
                    .background(WordlyColors.background)
            }
        }
    }
}

@MainActor
final class SavedWordsViewModel: ObservableObject {
    @Published var saved: [TranslateHistoryEntry] = []
    @Published var upcoming: [WidgetWordItem] = []
    @Published var isLoading = true

    func load() async {
        isLoading = saved.isEmpty
        var all: [TranslateHistoryEntry] = []
        var offset = 0
        while offset < 200 {
            guard let page = try? await APIClient.shared.fetchHistory(limit: 50, offset: offset) else { break }
            all += page.history
            if !page.hasMore { break }
            offset += 50
        }
        // Một từ lưu nhiều lần chỉ hiện một dòng
        var seen = Set<String>()
        saved = all.filter { $0.isSaved == true && seen.insert(WordMix.normalize($0.sourceText)).inserted }
        isLoading = false
        await WidgetSync.refreshBank()
        refreshUpcoming()
    }

    /// 4 lượt tiếp theo widget sẽ hiện — cho người dùng thấy cách trộn từ.
    func refreshUpcoming() {
        let store = AppGroupStorage.shared
        var settings = store.settings
        settings.activeStartMinutes = 0          // xem trước: bỏ qua khung giờ
        settings.activeEndMinutes = 0
        // Ít từ thì lịch quay vòng lại — chỉ lấy mỗi từ một lần
        var ids = Set<String>()
        upcoming = Array(WidgetSchedule.entries(words: store.words, bank: store.bank, settings: settings)
            .compactMap(\.word).filter { ids.insert($0.id).inserted }.prefix(4))
    }
}

struct SavedWordsView: View {
    @StateObject private var vm = SavedWordsViewModel()
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter
    @State private var selected: TranslateHistoryEntry?
    @State private var detailDetent: PresentationDetent = .fraction(0.75)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                widgetCard
                HStack {
                    SectionHeader(title: "Từ đã lưu (\(vm.saved.count))")
                    if !vm.saved.isEmpty {
                        Button { router.selectedTab = .review } label: {
                            Label("Ôn bằng quiz", systemImage: "bolt.fill")
                        }
                        .font(WordlyFonts.body(13, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                    }
                }
                if vm.isLoading {
                    ProgressView().tint(WordlyColors.electric).frame(maxWidth: .infinity).padding(30)
                } else if vm.saved.isEmpty {
                    EmptyStateView(systemImage: "bookmark", title: "Chưa lưu từ nào",
                                   message: "Dịch một từ rồi bấm Lưu — từ sẽ vào quiz, email nhắc học và widget.",
                                   actionTitle: "Đi dịch ngay") { router.selectedTab = .translate }
                        .wordlyCard(padding: 0)
                } else {
                    LazyVStack(spacing: 0) {
                        ForEach(vm.saved) { entry in
                            row(entry)
                            if entry.id != vm.saved.last?.id { Divider() }
                        }
                    }
                    .wordlyCard(padding: 14)
                }
            }
            .padding(16)
        }
        .screenBackground()
        .navigationTitle("Từ vựng")
        .navigationBarTitleDisplayMode(.inline)
        .task { await vm.load() }
        .refreshable { await vm.load() }
        .sheet(item: $selected) { entry in
            SavedWordDetailSheet(entry: entry)
                .presentationDetents([.fraction(0.75), .large], selection: $detailDetent)
        }
    }

    private var widgetCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Sắp hiện trên widget", systemImage: "lock.iphone")
                    .font(WordlyFonts.body(13, weight: .bold))
                    .foregroundStyle(.white.opacity(0.9))
                Spacer()
                NavigationLink { WidgetSettingsView() } label: {
                    Text("Tuỳ chỉnh").font(WordlyFonts.body(12, weight: .bold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(.white.opacity(0.2)).clipShape(Capsule())
                }
                .foregroundStyle(.white)
            }
            if vm.upcoming.isEmpty {
                Text("Lưu từ khi dịch — widget sẽ xen kẽ từ của bạn với từ mới trong kho theo trình độ.")
                    .font(WordlyFonts.body(13)).foregroundStyle(.white.opacity(0.85))
            } else {
                ForEach(Array(vm.upcoming.enumerated()), id: \.offset) { i, w in
                    HStack(spacing: 10) {
                        Image(systemName: w.fromBank ? "sparkles" : "bookmark.fill")
                            .font(.system(size: 12, weight: .bold))
                            .frame(width: 26, height: 26)
                            .background(.white.opacity(i == 0 ? 0.3 : 0.15))
                            .clipShape(Circle())
                        VStack(alignment: .leading, spacing: 1) {
                            Text(w.word).font(WordlyFonts.body(i == 0 ? 17 : 15, weight: .bold))
                            Text(w.meaning).font(WordlyFonts.body(12)).opacity(0.8).lineLimit(1)
                        }
                        Spacer()
                        Text(w.fromBank ? "Từ mới" : "Của bạn")
                            .font(WordlyFonts.body(10, weight: .bold))
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(.white.opacity(0.18)).clipShape(Capsule())
                    }
                    .foregroundStyle(.white)
                    .opacity(i == 0 ? 1 : 0.85)
                }
            }
        }
        .padding(16)
        .background(LinearGradient(colors: [WordlyColors.duoBlue, WordlyColors.electric],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func row(_ entry: TranslateHistoryEntry) -> some View {
        HStack(spacing: 10) {
            Button {
                selected = entry
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.sourceText).font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.ink)
                    Text(entry.translatedText).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.inkSoft).lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                Task { await tts.speak(entry.sourceText, lang: entry.direction == "EN→VI" ? "en-US" : "vi-VN") }
            } label: {
                Image(systemName: "speaker.wave.2.fill")
                    .font(.system(size: 13))
                    .frame(width: 32, height: 32)
                    .background(WordlyColors.electricSubtle)
                    .foregroundStyle(WordlyColors.electric)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Phát âm")
            Menu {
                Button { router.practice(word: entry.sourceText) } label: {
                    Label("Hỏi Alex về từ này", systemImage: "bubble.left.and.text.bubble.right")
                }
                Button { UIPasteboard.general.string = entry.sourceText } label: {
                    Label("Sao chép", systemImage: "doc.on.doc")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .frame(width: 32, height: 32)
                    .foregroundStyle(WordlyColors.inkSoft)
            }
        }
        .padding(.vertical, 10)
    }
}

/// Chi tiết 1 từ đã lưu — cùng kiểu popup với TopicWordDetailSheet (3/4 màn
/// hình). Từ đơn tiếng Anh thì tra từ điển AI (như ở tab Dịch) để có đầy đủ
/// nghĩa/ví dụ; câu/cụm từ hoặc chiều VI→EN thì chỉ hiện bản dịch đã lưu.
struct SavedWordDetailSheet: View {
    let entry: TranslateHistoryEntry
    @StateObject private var tts = TTSManager.shared
    @EnvironmentObject private var router: AppRouter
    @Environment(\.dismiss) private var dismiss
    @State private var dictionary: TranslateViewModel.DictionaryState = .hidden

    private var canLookUp: Bool {
        entry.direction == "EN→VI" && TranslateLogic.isSingleWord(entry.sourceText)
    }

    var body: some View {
        ScrollView {
            switch dictionary {
            case .loaded(let detail):
                DictionaryCard(detail: detail, tts: tts) {
                    dismiss()
                    router.practice(word: entry.sourceText)
                }
                .padding(20)
            default:
                fallback
            }
        }
        .screenBackground()
        .task {
            guard canLookUp else { return }
            dictionary = .loading
            if let detail = try? await APIClient.shared.lookupWord(entry.sourceText) {
                dictionary = .loaded(detail)
            } else {
                dictionary = .notFound
            }
        }
    }

    private var fallback: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(entry.sourceText).font(WordlyFonts.display(28)).foregroundStyle(WordlyColors.ink)
            HStack(spacing: 10) {
                Button { Task { await tts.speak(entry.sourceText, lang: entry.direction == "EN→VI" ? "en-US" : "vi-VN") } } label: {
                    Label("Phát âm", systemImage: "speaker.wave.2.fill")
                        .font(WordlyFonts.body(13, weight: .bold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .background(WordlyColors.electricSubtle)
                        .foregroundStyle(WordlyColors.electric)
                        .clipShape(Capsule())
                }
            }
            if dictionary == .loading {
                ProgressView().tint(WordlyColors.electric).frame(maxWidth: .infinity).padding(.top, 8)
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Nghĩa").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                    Text(entry.translatedText).font(WordlyFonts.body(17)).foregroundStyle(WordlyColors.ink)
                }
            }
            Button {
                dismiss()
                router.practice(word: entry.sourceText)
            } label: {
                Label("Học từ này với Alex", systemImage: "bubble.left.and.text.bubble.right.fill")
            }
            .buttonStyle(ElectricButtonStyle(isFullWidth: true))
        }
        .padding(20)
    }
}
