import WidgetKit
import SwiftUI

// Widget từ vựng — màn hình khoá (chữ nhật, tròn, một dòng) + màn hình chính
// (nhỏ, vừa). Đọc từ + cài đặt mà app lưu vào App Group (AppGroupStorage), lịch
// hiển thị do WidgetSchedule tính (dùng chung với app, có test).
//
// Chỉ hiện từ + nghĩa, không nhãn/logo: chỗ trên widget rất hẹp, mỗi dòng nhãn
// là một dòng nghĩa bị cắt "…". Chữ dài được thu nhỏ (minimumScaleFactor)
// trước khi phải cắt.

private let appGroup = Bundle.main.object(forInfoDictionaryKey: "WordlyAppGroup") as? String ?? ""
private let wordsKey = "wordly.widget.items"
private let settingsKey = "wordly.widget.settings"
private let bankKey = "wordly.widget.bank"
private let signedOutKey = "wordly.widget.signedOut"   // AppGroupStorage.signedOutKey

struct WordlyEntry: TimelineEntry {
    let date: Date
    let word: WidgetWordItem?
    let showMeaning: Bool
    /// Có từ nhưng đang ngoài khung giờ hiển thị
    let resting: Bool
    let lockStyle: WidgetSettings.LockStyle
    let homeStyle: WidgetSettings.HomeStyle
    let textAlign: WidgetSettings.TextAlign
    /// Đã đăng xuất trong app → nhắc đăng nhập, không xoay từ
    var signedOut = false
}

struct WordlyProvider: TimelineProvider {
    private static let sample = WidgetWordItem(id: "sample", word: "resilient", meaning: "kiên cường, mau phục hồi", isSaved: true)

    func placeholder(in context: Context) -> WordlyEntry {
        WordlyEntry(date: Date(), word: Self.sample, showMeaning: true, resting: false,
                    lockStyle: .full, homeStyle: WidgetSettings.HomeStyle(), textAlign: .leading)
    }

    func getSnapshot(in context: Context, completion: @escaping (WordlyEntry) -> Void) {
        let settings = loadSettings()
        let first = WidgetSchedule.entries(words: loadWords(), bank: loadWords(bankKey), settings: settings)
            .first { $0.word != nil }?.word
        completion(entry(date: Date(), word: first ?? Self.sample, resting: false, settings: settings))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WordlyEntry>) -> Void) {
        let settings = loadSettings()
        if UserDefaults(suiteName: appGroup)?.bool(forKey: signedOutKey) == true {
            // App gọi reloadAllTimelines khi đăng nhập lại → không cần tự xin lịch mới
            var e = entry(date: Date(), word: nil, resting: false, settings: settings)
            e.signedOut = true
            completion(Timeline(entries: [e], policy: .never))
            return
        }
        let words = loadWords()
        let bank = loadWords(bankKey)
        let hasWords = !WidgetSchedule.pool(from: words, settings: settings).isEmpty
            || !WidgetSchedule.bankPool(bank, words: words, settings: settings).isEmpty
        let schedule = WidgetSchedule.entries(words: words, bank: bank, settings: settings)
        let entries = schedule.map { entry(date: $0.date, word: $0.word, resting: hasWords && $0.word == nil, settings: settings) }
        // Hết lịch thì xin lịch mới (app cũng gọi reload khi dữ liệu đổi)
        completion(Timeline(entries: entries, policy: .after(WidgetSchedule.reloadDate(entries: schedule))))
    }

    private func entry(date: Date, word: WidgetWordItem?, resting: Bool, settings: WidgetSettings) -> WordlyEntry {
        WordlyEntry(date: date, word: word, showMeaning: settings.showMeaning, resting: resting,
                    lockStyle: settings.lockStyle, homeStyle: settings.homeStyle, textAlign: settings.textAlign)
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
        } else {
            LinearGradient(colors: [Color(hex: style.bgHex1), Color(hex: style.bgHex2)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
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
        case .systemMedium: HomeWord(entry: entry, wordSize: 30, meaningSize: 16, meaningLines: 3)
        default: HomeWord(entry: entry, wordSize: 24, meaningSize: 14, meaningLines: 4)
        }
    }
}

// MARK: - Màn hình khoá
// lockStyle .full: từ + nghĩa. .compact: từ cỡ lớn, nghĩa nhỏ 1 dòng — Apple
// không cho đổi màu/nền ở đây, chỉ cỡ/đậm/bố cục.
struct LockRectangular: View {
    let entry: WordlyEntry
    var body: some View {
        let align = entry.textAlign
        if let w = entry.word {
            VStack(alignment: align.horizontal, spacing: 1) {
                Text(w.word)
                    .font(.system(size: entry.lockStyle == .compact ? 24 : 17, weight: entry.lockStyle == .compact ? .heavy : .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if entry.showMeaning || entry.lockStyle == .full {
                    Text(entry.showMeaning ? w.meaning : "Nghĩa là gì nhỉ? 🤔")
                        .font(.system(size: entry.lockStyle == .compact ? 13 : 14, weight: .medium))
                        .lineLimit(entry.lockStyle == .compact ? 1 : 2)
                        .minimumScaleFactor(0.6)
                        .opacity(0.85)
                }
            }
            .multilineTextAlignment(align.multiline)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: align.frame)
            .widgetAccentable()
        } else {
            LockMessage(resting: entry.resting, signedOut: entry.signedOut, align: align)
        }
    }
}

struct LockCircular: View {
    let entry: WordlyEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let w = entry.word {
                Text(w.word)
                    .font(.system(size: 14, weight: entry.lockStyle == .compact ? .heavy : .bold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.5)
                    .multilineTextAlignment(.center)
                    .padding(4)
            } else {
                Image(systemName: entry.signedOut ? "person.crop.circle.badge.exclamationmark" : (entry.resting ? "moon.zzz.fill" : "character.book.closed"))
            }
        }
        .widgetAccentable()
    }
}

struct LockInline: View {
    let entry: WordlyEntry
    var body: some View {
        if let w = entry.word {
            Text(entry.showMeaning ? "\(w.word) — \(w.meaning)" : w.word)
        } else {
            Text(entry.signedOut ? "📖 Đăng nhập Wordly" : (entry.resting ? "🌙 Wordly nghỉ ngơi" : "📖 Mở Wordly để lưu từ"))
        }
    }
}

struct LockMessage: View {
    let resting: Bool
    var signedOut = false
    var align: WidgetSettings.TextAlign = .leading
    var body: some View {
        VStack(alignment: align.horizontal, spacing: 2) {
            Text(resting && !signedOut ? "🌙 Đang ngoài giờ học" : "📖 Wordly")
                .font(.system(size: 14, weight: .bold))
            Text(signedOut ? "Đăng nhập để hiện từ vựng" : (resting ? "Từ vựng sẽ quay lại theo giờ bạn đặt" : "Mở app và lưu từ để hiện ở đây"))
                .font(.system(size: 12))
                .opacity(0.8)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
        }
        .multilineTextAlignment(align.multiline)
        .frame(maxWidth: .infinity, alignment: align.frame)
    }
}

// MARK: - Màn hình chính
struct HomeWord: View {
    let entry: WordlyEntry
    let wordSize: CGFloat
    let meaningSize: CGFloat
    let meaningLines: Int

    var body: some View {
        let style = entry.homeStyle
        let align = entry.textAlign
        VStack(alignment: align.horizontal, spacing: 6) {
            if let w = entry.word {
                Text(w.word)
                    .font(.system(size: wordSize, weight: style.wordWeight.swiftUIWeight))
                    .italic(style.wordItalic)
                    .foregroundStyle(Color(hex: style.wordColorHex))
                    .lineLimit(2)
                    .minimumScaleFactor(0.5)
                Text(entry.showMeaning ? w.meaning : "Đoán nghĩa rồi mở app kiểm tra nhé 🤔")
                    .font(.system(size: meaningSize, weight: style.meaningWeight.swiftUIWeight))
                    .italic(style.meaningItalic)
                    .foregroundStyle(Color(hex: style.meaningColorHex).opacity(0.9))
                    .lineLimit(meaningLines)
                    .minimumScaleFactor(0.6)
            } else {
                Text(entry.resting ? "🌙" : "📖").font(.system(size: 30))
                Text(entry.signedOut ? "Đăng nhập Wordly để hiện từ vựng" : (entry.resting ? "Ngoài giờ học" : "Lưu từ trong app để hiện ở đây"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color(hex: style.meaningColorHex).opacity(0.85))
                    .minimumScaleFactor(0.7)
            }
        }
        .multilineTextAlignment(align.multiline)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: align.frame)
    }
}
