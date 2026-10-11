import WidgetKit
import SwiftUI
import UIKit

// Widget từ vựng — màn hình khoá (chữ nhật, tròn, một dòng) + màn hình chính
// (nhỏ, vừa). Đọc từ + cài đặt mà app lưu vào App Group (AppGroupStorage), lịch
// hiển thị do WidgetSchedule tính (dùng chung với app, có test).

private let appGroup = Bundle.main.object(forInfoDictionaryKey: "WordlyAppGroup") as? String ?? ""
private let wordsKey = "wordly.widget.items"
private let settingsKey = "wordly.widget.settings"
private let bankKey = "wordly.widget.bank"

struct WordlyEntry: TimelineEntry {
    let date: Date
    let word: WidgetWordItem?
    let showMeaning: Bool
    /// Có từ nhưng đang ngoài khung giờ hiển thị
    let resting: Bool
    let lockStyle: WidgetSettings.LockStyle
    let homeStyle: WidgetSettings.HomeStyle
}

struct WordlyProvider: TimelineProvider {
    private static let sample = WidgetWordItem(id: "sample", word: "resilient", meaning: "kiên cường, mau phục hồi", isSaved: true)

    func placeholder(in context: Context) -> WordlyEntry {
        WordlyEntry(date: Date(), word: Self.sample, showMeaning: true, resting: false,
                    lockStyle: .full, homeStyle: WidgetSettings.HomeStyle())
    }

    func getSnapshot(in context: Context, completion: @escaping (WordlyEntry) -> Void) {
        let settings = loadSettings()
        let first = WidgetSchedule.entries(words: loadWords(), bank: loadWords(bankKey), settings: settings)
            .first { $0.word != nil }?.word
        completion(WordlyEntry(date: Date(), word: first ?? Self.sample, showMeaning: settings.showMeaning, resting: false,
                               lockStyle: settings.lockStyle, homeStyle: settings.homeStyle))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WordlyEntry>) -> Void) {
        let settings = loadSettings()
        let words = loadWords()
        let bank = loadWords(bankKey)
        let hasWords = !WidgetSchedule.pool(from: words, settings: settings).isEmpty
            || !WidgetSchedule.bankPool(bank, words: words, settings: settings).isEmpty
        let schedule = WidgetSchedule.entries(words: words, bank: bank, settings: settings)
        let entries = schedule.map {
            WordlyEntry(date: $0.date, word: $0.word, showMeaning: settings.showMeaning, resting: hasWords && $0.word == nil,
                       lockStyle: settings.lockStyle, homeStyle: settings.homeStyle)
        }
        // Hết lịch thì xin lịch mới (app cũng gọi reload khi dữ liệu đổi)
        completion(Timeline(entries: entries, policy: .after(WidgetSchedule.reloadDate(entries: schedule))))
    }

    private func loadWords(_ key: String = wordsKey) -> [WidgetWordItem] {
        guard let data = UserDefaults(suiteName: appGroup)?.data(forKey: key) else { return [] }
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
                .containerBackground(for: .widget) { WidgetBackground(style: entry.homeStyle) }
        }
        .configurationDisplayName("Wordly — Từ vựng")
        .description("Từ bạn đã lưu xen kẽ từ mới trong kho, trên màn hình khoá và màn hình chính. Chỉnh trong app: Cá nhân → Widget.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

private struct WidgetBackground: View {
    @Environment(\.widgetFamily) private var family
    let style: WidgetSettings.HomeStyle

    var body: some View {
        if family.isAccessory {
            // Màn hình khoá không đổi được màu (OS tự tô) — style chỉ áp dụng
            // cho widget màn hình chính, nơi containerBackground cho phép nền tùy ý.
            Color.clear
        } else if let image = Self.loadBackgroundImage() {
            Image(uiImage: image).resizable().scaledToFill()
                .overlay(overlayColor.opacity(overlayOpacity))
        } else {
            LinearGradient(colors: [Color(hex: style.bgHex1), Color(hex: style.bgHex2)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }

    private var overlayColor: Color { style.imageOverlay == .light ? .white : .black }
    private var overlayOpacity: Double {
        switch style.imageOverlay {
        case .none: return 0
        case .dark: return 0.45
        case .light: return 0.35
        }
    }

    private static func loadBackgroundImage() -> UIImage? {
        guard let url = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("widget_home_bg.jpg"),
            let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
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
// lockStyle .full: nhãn + từ + nghĩa (như trước). .compact: chỉ từ, cỡ chữ
// lớn + đậm hơn — Apple không cho đổi màu/nền ở đây, chỉ cỡ/đậm/bố cục.
struct LockRectangular: View {
    let entry: WordlyEntry
    var body: some View {
        if let w = entry.word {
            switch entry.lockStyle {
            case .full:
                VStack(alignment: .leading, spacing: 1) {
                    HStack(spacing: 4) {
                        Image(systemName: w.symbol)
                            .font(.system(size: 10, weight: .bold))
                        Text(w.tag).font(.system(size: 11, weight: .semibold))
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
            case .compact:
                VStack(alignment: .leading, spacing: 2) {
                    Text(w.word)
                        .font(.system(size: 24, weight: .heavy))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if entry.showMeaning {
                        Text(w.meaning)
                            .font(.system(size: 12, weight: .medium))
                            .lineLimit(1)
                            .opacity(0.8)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .widgetAccentable()
            }
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
                    if entry.lockStyle == .full {
                        Image(systemName: w.symbol).font(.system(size: 10))
                    }
                    Text(w.word)
                        .font(.system(size: entry.lockStyle == .compact ? 14 : 12, weight: entry.lockStyle == .compact ? .heavy : .bold))
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
            Text(entry.showMeaning ? "\(w.fromBank ? "✨" : "📖") \(w.word) — \(w.meaning)" : "\(w.fromBank ? "✨" : "📖") \(w.word)")
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
                if let w = entry.word {
                    Image(systemName: w.symbol).font(.system(size: 10))
                        .foregroundStyle(w.fromBank ? WordlyColors.duoBlue : WordlyColors.duoOrange)
                }
            }
            Spacer(minLength: 0)
            if let w = entry.word {
                Text(w.word)
                    .font(.system(size: 22, weight: entry.homeStyle.wordWeight.swiftUIWeight))
                    .italic(entry.homeStyle.wordItalic)
                    .foregroundStyle(Color(hex: entry.homeStyle.wordColorHex))
                    .lineLimit(2)
                    .minimumScaleFactor(0.6)
                Text(entry.showMeaning ? w.meaning : "Nghĩa là gì nhỉ? 🤔")
                    .font(.system(size: 13, weight: entry.homeStyle.meaningWeight.swiftUIWeight))
                    .italic(entry.homeStyle.meaningItalic)
                    .foregroundStyle(Color(hex: entry.homeStyle.meaningColorHex).opacity(0.85))
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
                    Text(entry.word.map { $0.fromBank ? "Từ mới từ kho" : "Từ của bạn" } ?? "Từ vựng hôm nay")
                        .font(WordlyFonts.body(12, weight: .bold))
                        .foregroundStyle(entry.word?.fromBank == true ? WordlyColors.duoBlue : WordlyColors.electric)
                }
                Spacer(minLength: 0)
                if let w = entry.word {
                    Text(w.word)
                        .font(.system(size: 28, weight: entry.homeStyle.wordWeight.swiftUIWeight))
                        .italic(entry.homeStyle.wordItalic)
                        .foregroundStyle(Color(hex: entry.homeStyle.wordColorHex))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(entry.showMeaning ? w.meaning : "Đoán nghĩa rồi mở app kiểm tra nhé 🤔")
                        .font(.system(size: 14, weight: entry.homeStyle.meaningWeight.swiftUIWeight))
                        .italic(entry.homeStyle.meaningItalic)
                        .foregroundStyle(Color(hex: entry.homeStyle.meaningColorHex).opacity(0.85))
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

// Phân biệt từ của bạn và từ mới từ kho ngay trên widget
private extension WidgetWordItem {
    var symbol: String { fromBank ? "sparkles" : (isSaved ? "bookmark.fill" : "clock.arrow.circlepath") }
    var tag: String { fromBank ? "Từ mới" : (isSaved ? "Đã lưu" : "Gần đây") }
}
