import SwiftUI

// Trang chủ — điểm vào mọi tính năng học (tương đương sidebar + right rail
// của web): chuỗi ngày học, lối tắt, từ đã lưu gần đây.
@MainActor
final class HomeViewModel: ObservableObject {
    @Published var name = ""
    @Published var streak: StreakResponse?
    @Published var savedWords: [TranslateHistoryEntry] = []

    func load() async {
        async let profile = try? APIClient.shared.fetchProfile()
        async let streak = try? APIClient.shared.fetchStreak()
        async let history = try? APIClient.shared.fetchHistory(limit: 30, offset: 0)

        let p = await profile
        name = p?.profile?.name ?? p?.email?.components(separatedBy: "@").first ?? ""
        self.streak = await streak
        if let entries = await history?.history {
            savedWords = Array(entries.filter { $0.isSaved == true }.prefix(6))
            AppGroupStorage.shared.syncWidgetData(from: entries)
        }
    }
}

struct HomeView: View {
    @StateObject private var vm = HomeViewModel()
    @EnvironmentObject private var router: AppRouter

    private let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    greeting
                    streakCard
                    SectionHeader(title: "Học hôm nay")
                    LazyVGrid(columns: columns, spacing: 12) {
                        Button { router.selectedTab = .translate } label: {
                            ActionCard(title: "Dịch & tra từ", subtitle: "Từ điển AI, lưu từ để ôn", systemImage: "character.book.closed.fill")
                        }
                        Button { router.selectedTab = .speak } label: {
                            ActionCard(title: "Luyện với Alex", subtitle: "Nói chuyện với giáo viên AI", systemImage: "waveform", color: WordlyColors.duoBlue)
                        }
                        NavigationLink { QuizView() } label: {
                            ActionCard(title: "Quiz từ vựng", subtitle: "10 câu từ những từ đã lưu", systemImage: "bolt.fill", color: WordlyColors.duoOrange)
                        }
                        NavigationLink { JournalView() } label: {
                            ActionCard(title: "Sổ tay câu hay", subtitle: "Ghi lại câu muốn nhớ", systemImage: "book.closed.fill", color: WordlyColors.duoPurple)
                        }
                        NavigationLink { SpeakSpinnerView() } label: {
                            ActionCard(title: "Vòng quay chủ đề", subtitle: "IELTS, phỏng vấn, deep talk", systemImage: "dice.fill", color: WordlyColors.error)
                        }
                        NavigationLink { TopicVocabularyView() } label: {
                            ActionCard(title: "Từ vựng theo chủ đề", subtitle: "IELTS, TOEIC, 12 chủ đề", systemImage: "square.grid.2x2.fill", color: WordlyColors.grass)
                        }
                    }
                    .buttonStyle(.plain)
                    if !vm.savedWords.isEmpty { savedWordsSection }
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle("Wordly")
            .navigationBarTitleDisplayMode(.inline)
            .task { await vm.load() }
            .refreshable { await vm.load() }
        }
    }

    private var greeting: some View {
        HStack(spacing: 14) {
            WordlyLogo(size: 48)
            VStack(alignment: .leading, spacing: 2) {
                Text(vm.name.isEmpty ? "Xin chào! 👋" : "Xin chào, \(vm.name)! 👋")
                    .font(WordlyFonts.display(22))
                    .foregroundStyle(WordlyColors.ink)
                Text("Mỗi ngày một chút, tiến bộ đều đặn.")
                    .font(WordlyFonts.body(13))
                    .foregroundStyle(WordlyColors.inkSoft)
            }
        }
    }

    private var streakCard: some View {
        HStack(spacing: 16) {
            Text("🔥").font(.system(size: 40))
            VStack(alignment: .leading, spacing: 4) {
                Text("\(vm.streak?.streak ?? 0) ngày liên tiếp")
                    .font(WordlyFonts.display(22))
                    .foregroundStyle(WordlyColors.ink)
                Text("Tổng \(vm.streak?.totalDays ?? 0) ngày đã học")
                    .font(WordlyFonts.body(13, weight: .medium))
                    .foregroundStyle(WordlyColors.inkSoft)
            }
            Spacer()
        }
        .padding(18)
        .background(
            LinearGradient(colors: [WordlyColors.duoOrange.opacity(0.22), WordlyColors.duoYellow.opacity(0.12)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(WordlyColors.duoOrange.opacity(0.35), lineWidth: 1))
    }

    private var savedWordsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionHeader(title: "Từ đã lưu gần đây")
                NavigationLink("Ôn bằng quiz") { QuizView() }
                    .font(WordlyFonts.body(13, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
            }
            VStack(spacing: 0) {
                ForEach(vm.savedWords) { entry in
                    HStack {
                        Text(entry.sourceText).font(WordlyFonts.body(15, weight: .bold)).foregroundStyle(WordlyColors.ink)
                        Spacer()
                        Text(entry.translatedText)
                            .font(WordlyFonts.body(13))
                            .foregroundStyle(WordlyColors.inkSoft)
                            .lineLimit(1)
                    }
                    .padding(.vertical, 10)
                    if entry.id != vm.savedWords.last?.id { Divider() }
                }
            }
            .wordlyCard(padding: 14)
        }
    }
}
