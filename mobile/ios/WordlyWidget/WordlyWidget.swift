import WidgetKit
import SwiftUI

// Widget từ vựng — màn hình khoá (chữ nhật, tròn, một dòng) + màn hình chính
// (nhỏ, vừa). Đọc từ + cài đặt mà app lưu vào App Group (AppGroupStorage), lịch
// hiển thị do WidgetSchedule tính (dùng chung với app, có test).

private let appGroup = Bundle.main.object(forInfoDictionaryKey: "WordlyAppGroup") as? String ?? ""
private let wordsKey = "wordly.widget.items"
private let settingsKey = "wordly.widget.settings"

struct WordlyEntry: TimelineEntry {
    let date: Date
    let word: WidgetWordItem?
    let showMeaning: Bool
    /// Có từ nhưng đang ngoài khung giờ hiển thị
    let resting: Bool
}

struct WordlyProvider: TimelineProvider {
    private static let sample = WidgetWordItem(id: "sample", word: "resilient", meaning: "kiên cường, mau phục hồi", isSaved: true)

    func placeholder(in context: Context) -> WordlyEntry {
        WordlyEntry(date: Date(), word: Self.sample, showMeaning: true, resting: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (WordlyEntry) -> Void) {
        let settings = loadSettings()
        let first = WidgetSchedule.pool(from: loadWords(), settings: settings).first
        completion(WordlyEntry(date: Date(), word: first ?? Self.sample, showMeaning: settings.showMeaning, resting: false))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WordlyEntry>) -> Void) {
        let settings = loadSettings()
        let words = loadWords()
        let hasWords = !WidgetSchedule.pool(from: words, settings: settings).isEmpty
        let entries = WidgetSchedule.entries(words: words, settings: settings).map {
            WordlyEntry(date: $0.date, word: $0.word, showMeaning: settings.showMeaning, resting: hasWords && $0.word == nil)
        }
        // Hết lịch thì xin lịch mới (app cũng gọi reload khi dữ liệu đổi)
        let schedule = WidgetSchedule.entries(words: words, settings: settings)
        completion(Timeline(entries: entries, policy: .after(WidgetSchedule.reloadDate(entries: schedule))))
    }

    private func loadWords() -> [WidgetWordItem] {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: wordsKey) else { return [] }
        return (try? JSONDecoder().decode([WidgetWordItem].self, from: data)) ?? []
    }

    private func loadSettings() -> WidgetSettings {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: settingsKey),
              let s = try? JSONDecoder().decode(WidgetSettings.self, from: data) else { return WidgetSettings() }
        return s
    }
}

@main
struct WordlyWidget: Widget {
    let kind = "WordlyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WordlyProvider()) { entry in
            WordlyWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("Wordly — Từ vựng")
        .description("Hiện từ bạn đã lưu trên màn hình khoá và màn hình chính. Chỉnh nguồn từ, giờ hiển thị trong app: Hồ sơ → Widget.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

private struct WidgetBackground: View {
    @Environment(\.widgetFamily) private var family
    var body: some View {
        if family.isAccessory {
            Color.clear
        } else {
            LinearGradient(colors: [Color(hex: "#131F24"), Color(hex: "#1F2E36")], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

private extension WidgetFamily {
    var isAccessory: Bool { self == .accessoryRectangular || self == .accessoryCircular || self == .accessoryInline }
}

struct WordlyWidgetEntryView: View {
    let entry: WordlyEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular: LockRectangular(entry: entry)
        case .accessoryCircular: LockCircular(entry: entry)
        case .accessoryInline: LockInline(entry: entry)
        case .systemMedium: HomeMedium(entry: entry)
        default: HomeSmall(entry: entry)
        }
    }
}

// MARK: - Màn hình khoá
struct LockRectangular: View {
    let entry: WordlyEntry
    var body: some View {
        if let w = entry.word {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Image(systemName: w.isSaved ? "bookmark.fill" : "character.book.closed.fill")
                        .font(.system(size: 10, weight: .bold))
                    Text("Wordly").font(.system(size: 11, weight: .semibold))
                }
                .opacity(0.7)
                Text(w.word)
                    .font(.system(size: 17, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(entry.showMeaning ? w.meaning : "Nghĩa là gì nhỉ? 🤔")
                    .font(.system(size: 13))
                    .lineLimit(2)
                    .opacity(0.85)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .widgetAccentable()
        } else {
            LockMessage(resting: entry.resting)
        }
    }
}

struct LockCircular: View {
    let entry: WordlyEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let w = entry.word {
                VStack(spacing: 0) {
                    Image(systemName: "character.book.closed.fill").font(.system(size: 10))
                    Text(w.word)
                        .font(.system(size: 12, weight: .bold))
                        .lineLimit(2)
                        .minimumScaleFactor(0.5)
                        .multilineTextAlignment(.center)
                }
                .padding(4)
            } else {
                Image(systemName: entry.resting ? "moon.zzz.fill" : "character.book.closed")
            }
        }
        .widgetAccentable()
    }
}

struct LockInline: View {
    let entry: WordlyEntry
    var body: some View {
        if let w = entry.word {
            Text(entry.showMeaning ? "📖 \(w.word) — \(w.meaning)" : "📖 \(w.word)")
        } else {
            Text(entry.resting ? "🌙 Wordly nghỉ ngơi" : "📖 Mở Wordly để lưu từ")
        }
    }
}

struct LockMessage: View {
    let resting: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(resting ? "🌙 Đang ngoài giờ học" : "📖 Wordly")
                .font(.system(size: 14, weight: .bold))
            Text(resting ? "Từ vựng sẽ quay lại theo giờ bạn đặt" : "Mở app và lưu từ để hiện ở đây")
                .font(.system(size: 12))
                .opacity(0.8)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Màn hình chính
struct HomeSmall: View {
    let entry: WordlyEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                Image("Logo").resizable().frame(width: 18, height: 18).clipShape(RoundedRectangle(cornerRadius: 5))
                Text("Wordly").font(WordlyFonts.body(11, weight: .bold)).foregroundStyle(WordlyColors.electric)
                Spacer()
                if entry.word?.isSaved == true {
                    Image(systemName: "bookmark.fill").font(.system(size: 10)).foregroundStyle(WordlyColors.duoOrange)
                }
            }
            Spacer(minLength: 0)
            if let w = entry.word {
                Text(w.word)
                    .font(WordlyFonts.display(22))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                Text(entry.showMeaning ? w.meaning : "Nghĩa là gì nhỉ? 🤔")
                    .font(WordlyFonts.body(13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(2)
            } else {
                Text(entry.resting ? "🌙" : "📖").font(.system(size: 30))
                Text(entry.resting ? "Ngoài giờ học" : "Lưu từ trong app để hiện ở đây")
                    .font(WordlyFonts.body(12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }
}

struct HomeMedium: View {
    let entry: WordlyEntry
    var body: some View {
        HStack(spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image("Logo").resizable().frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 5))
                    Text("Từ vựng hôm nay").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.electric)
                }
                Spacer(minLength: 0)
                if let w = entry.word {
                    Text(w.word)
                        .font(WordlyFonts.display(28))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(entry.showMeaning ? w.meaning : "Đoán nghĩa rồi mở app kiểm tra nhé 🤔")
                        .font(WordlyFonts.body(14, weight: .medium))
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(2)
                } else {
                    Text(entry.resting ? "🌙 Đang ngoài giờ học" : "📖 Chưa có từ nào")
                        .font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(.white)
                    Text(entry.resting ? "Từ vựng quay lại theo giờ bạn đặt trong app." : "Dịch và bấm Lưu để từ hiện ở đây.")
                        .font(WordlyFonts.body(12)).foregroundStyle(.white.opacity(0.7))
                }
            }
            Spacer(minLength: 0)
        }
    }
}
