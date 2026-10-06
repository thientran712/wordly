import WidgetKit
import SwiftUI

// MARK: - App Group key (must match main app)
private let appGroup = Bundle.main.object(forInfoDictionaryKey: "WordlyAppGroup") as? String ?? ""
private let wordsKey = "wordly.widget.words"

// MARK: - Widget Entry
struct WordlyEntry: TimelineEntry {
    let date: Date
    let word: WidgetWordEntry?
    let wordIndex: Int
}

// MARK: - Timeline Provider
struct WordlyProvider: TimelineProvider {
    func placeholder(in context: Context) -> WordlyEntry {
        WordlyEntry(
            date: Date(),
            word: WidgetWordEntry(sourceText: "ephemeral", translatedText: "thoáng qua, không bền", direction: "EN→VI"),
            wordIndex: 0
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (WordlyEntry) -> Void) {
        let words = loadWords()
        let entry = WordlyEntry(date: Date(), word: words.first, wordIndex: 0)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WordlyEntry>) -> Void) {
        let words = loadWords()
        guard !words.isEmpty else {
            // No words — show placeholder, refresh in 30min
            let entry = WordlyEntry(date: Date(), word: nil, wordIndex: 0)
            let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
            return
        }

        // Create one entry per hour, cycling through words
        var entries: [WordlyEntry] = []
        let now = Date()
        let calendar = Calendar.current

        for hourOffset in 0..<12 {
            let entryDate = calendar.date(byAdding: .hour, value: hourOffset, to: now)!
            let wordIndex = hourOffset % words.count
            entries.append(WordlyEntry(date: entryDate, word: words[wordIndex], wordIndex: wordIndex))
        }

        // Reload after 12 hours to pick up new words from main app
        let reloadDate = calendar.date(byAdding: .hour, value: 12, to: now)!
        completion(Timeline(entries: entries, policy: .after(reloadDate)))
    }

    private func loadWords() -> [WidgetWordEntry] {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: wordsKey),
              let words = try? JSONDecoder().decode([WidgetWordEntry].self, from: data)
        else { return [] }
        return words
    }
}

// MARK: - Widget Configuration
@main
struct WordlyWidget: Widget {
    let kind: String = "WordlyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WordlyProvider()) { entry in
            WordlyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Wordly")
        .description("Hiển thị từ vựng tiếng Anh trên màn hình khoá và Home Screen")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,   // Lock Screen rectangular
            .accessoryCircular,      // Lock Screen circular
            .accessoryInline         // Lock Screen inline
        ])
    }
}

// MARK: - Entry View (router)
struct WordlyWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: WordlyEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            LockScreenRectangularView(entry: entry)
        case .accessoryCircular:
            LockScreenCircularView(entry: entry)
        case .accessoryInline:
            LockScreenInlineView(entry: entry)
        case .systemSmall:
            HomeSmallView(entry: entry)
        case .systemMedium:
            HomeMediumView(entry: entry)
        default:
            HomeSmallView(entry: entry)
        }
    }
}

// MARK: - Lock Screen: Rectangular (best for showing word + meaning)
struct LockScreenRectangularView: View {
    let entry: WordlyEntry

    var body: some View {
        if let word = entry.word {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Image(systemName: "book.fill")
                        .font(WordlyFonts.body(9, weight: .bold))
                    Text("WORDLY")
                        .font(WordlyFonts.body(9, weight: .bold))
                        .tracking(1.5)
                }
                .foregroundStyle(.secondary)

                Text(word.sourceText)
                    .font(WordlyFonts.display(15))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Text(word.translatedText)
                    .font(WordlyFonts.body(12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.horizontal, 2)
        } else {
            LockScreenEmptyView()
        }
    }
}

// MARK: - Lock Screen: Circular
struct LockScreenCircularView: View {
    let entry: WordlyEntry

    var body: some View {
        if let word = entry.word {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 2) {
                    Image(systemName: "book.fill")
                        .font(WordlyFonts.body(12, weight: .bold))
                    Text(String(word.sourceText.prefix(4)))
                        .font(WordlyFonts.display(10))
                        .lineLimit(1)
                }
            }
        } else {
            ZStack {
                AccessoryWidgetBackground()
                Image(systemName: "book.fill").font(WordlyFonts.body(18))
            }
        }
    }
}

// MARK: - Lock Screen: Inline
struct LockScreenInlineView: View {
    let entry: WordlyEntry

    var body: some View {
        if let word = entry.word {
            Label {
                Text("\(word.sourceText) · \(word.translatedText)")
                    .lineLimit(1)
            } icon: {
                Image(systemName: "book.fill")
            }
        } else {
            Label("Wordly", systemImage: "book.fill")
        }
    }
}

// MARK: - Home Screen: Small
struct HomeSmallView: View {
    let entry: WordlyEntry

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [Color(hex: "#131F24"), Color(hex: "#1F2E36")],  // nền tối của web; widget luôn tối vì chữ trắng
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Green accent glow
            Circle()
                .fill(WordlyColors.electric.opacity(0.15))
                .frame(width: 120)
                .offset(x: 40, y: -40)
                .blur(radius: 20)

            if let word = entry.word {
                VStack(alignment: .leading, spacing: 8) {
                    // Header
                    HStack(spacing: 4) {
                        WordlyLogo(size: 16)
                        Text("Wordly")
                            .font(WordlyFonts.body(10, weight: .bold))
                            .foregroundStyle(WordlyColors.electric)
                    }

                    Spacer()

                    // Word
                    Text(word.sourceText)
                        .font(WordlyFonts.display(22))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)

                    // Translation
                    Text(word.translatedText)
                        .font(WordlyFonts.body(11))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .lineLimit(2)

                    // Direction badge
                    Text(word.direction)
                        .font(WordlyFonts.body(9, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(WordlyColors.electric.opacity(0.15))
                        .clipShape(Capsule())
                }
                .padding(14)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 6) {
                    WordlyLogo(size: 44.8)
                    Text("Wordly")
                        .font(WordlyFonts.body(14, weight: .bold))
                        .foregroundStyle(WordlyColors.electric)
                    Text("Mở app để tải từ")
                        .font(WordlyFonts.body(10))
                        .foregroundStyle(Color.white.opacity(0.4))
                        .multilineTextAlignment(.center)
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - Home Screen: Medium
struct HomeMediumView: View {
    let entry: WordlyEntry

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: "#131F24"), Color(hex: "#1F2E36")],  // nền tối của web; widget luôn tối vì chữ trắng
                startPoint: .leading,
                endPoint: .trailing
            )

            Circle()
                .fill(WordlyColors.electric.opacity(0.1))
                .frame(width: 200)
                .offset(x: 120, y: -30)
                .blur(radius: 30)

            if let word = entry.word {
                HStack(spacing: 0) {
                    // Left: word + details
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 4) {
                            WordlyLogo(size: 17.6)
                            Text("Wordly").font(WordlyFonts.body(11, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                            Spacer()
                            Text(word.direction)
                                .font(WordlyFonts.body(9, weight: .bold))
                                .foregroundStyle(WordlyColors.electric)
                                .padding(.horizontal, 5).padding(.vertical, 1)
                                .background(WordlyColors.electric.opacity(0.15))
                                .clipShape(Capsule())
                        }

                        Spacer()

                        Text(word.sourceText)
                            .font(WordlyFonts.display(26))
                            .foregroundStyle(.white)
                            .lineLimit(2)
                            .minimumScaleFactor(0.7)

                        Text(word.translatedText)
                            .font(WordlyFonts.body(12))
                            .foregroundStyle(Color.white.opacity(0.6))
                            .lineLimit(3)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)

                    // Right: decorative
                    VStack {
                        Spacer()
                        Text("📖")
                            .font(WordlyFonts.body(40))
                            .opacity(0.15)
                        Spacer()
                    }
                    .frame(width: 60)
                }
            } else {
                HStack(spacing: 12) {
                    WordlyLogo(size: 57.6)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Wordly").font(WordlyFonts.body(16, weight: .bold)).foregroundStyle(WordlyColors.electric)
                        Text("Mở app để tải từ vựng").font(WordlyFonts.body(12)).foregroundStyle(Color.white.opacity(0.4))
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }
}

// MARK: - Lock Screen Empty
struct LockScreenEmptyView: View {
    var body: some View {
        VStack(spacing: 3) {
            Image(systemName: "book.fill")
                .font(WordlyFonts.body(12))
                .foregroundStyle(.secondary)
            Text("Wordly")
                .font(WordlyFonts.body(10, weight: .bold))
                .foregroundStyle(.secondary)
        }
    }
}

// MARK: - Color Extension (duplicated for Widget target isolation)
// Color(hex:) + bảng màu dùng chung: WordlyiOS/Shared/Theme/DesignSystem.swift

// MARK: - Widget Preview
#Preview(as: .accessoryRectangular) {
    WordlyWidget()
} timeline: {
    WordlyEntry(date: .now, word: WidgetWordEntry(sourceText: "ephemeral", translatedText: "thoáng qua, không bền lâu", direction: "EN→VI"), wordIndex: 0)
    WordlyEntry(date: .now, word: WidgetWordEntry(sourceText: "serendipity", translatedText: "may mắn tình cờ", direction: "EN→VI"), wordIndex: 1)
}

#Preview(as: .systemSmall) {
    WordlyWidget()
} timeline: {
    WordlyEntry(date: .now, word: WidgetWordEntry(sourceText: "resilience", translatedText: "khả năng phục hồi", direction: "EN→VI"), wordIndex: 0)
}

#Preview(as: .systemMedium) {
    WordlyWidget()
} timeline: {
    WordlyEntry(date: .now, word: WidgetWordEntry(sourceText: "perseverance", translatedText: "sự kiên trì, bền bỉ", direction: "EN→VI"), wordIndex: 0)
}
