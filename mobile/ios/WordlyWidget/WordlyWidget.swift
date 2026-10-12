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
    /// Phiên âm US "/rɪˈzɪljənt/" — nil với câu hoặc khi app chưa tra được
    var phonetic: String? = nil
    /// Nghĩa hiện trên widget: từ kho dùng nghĩa Việt app đã tra (WidgetMeaning),
    /// chưa có thì định nghĩa tiếng Anh. `word.meaning` giữ nguyên cho link mở app.
    var meaning: String = ""
    /// Ảnh nền màn hình chính — một instance dùng chung cho mọi entry của timeline
    var background: UIImage? = nil
}

struct WordlyProvider: TimelineProvider {
    private static let sample = WidgetWordItem(id: "sample", word: "resilient", meaning: "kiên cường, mau phục hồi", isSaved: true)

    func placeholder(in context: Context) -> WordlyEntry {
        WordlyEntry(date: Date(), word: Self.sample, showMeaning: true, resting: false,
                    lockStyle: .full, homeStyle: WidgetSettings.HomeStyle(), textAlign: .leading, phonetic: "/rɪˈzɪljənt/",
                    meaning: Self.sample.meaning)
    }

    func getSnapshot(in context: Context, completion: @escaping (WordlyEntry) -> Void) {
        let settings = loadSettings()
        let first = WidgetSchedule.entries(words: loadWords(), bank: loadWords(bankKey), settings: settings)
            .first { $0.word != nil }?.word
        completion(entry(date: Date(), word: first ?? Self.sample, resting: false, settings: settings,
                         phonetics: loadPhonetics(), meaningsVi: loadMeaningsVi(),
                         background: loadBackground(settings, family: context.family)))
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
        let phonetics = loadPhonetics()
        let meaningsVi = loadMeaningsVi()
        let background = loadBackground(settings, family: context.family)
        let entries = schedule.map { entry(date: $0.date, word: $0.word, resting: hasWords && $0.word == nil,
                                           settings: settings, phonetics: phonetics, meaningsVi: meaningsVi,
                                           background: background) }
        // Hết lịch thì xin lịch mới (app cũng gọi reload khi dữ liệu đổi)
        completion(Timeline(entries: entries, policy: .after(WidgetSchedule.reloadDate(entries: schedule))))
    }

    private func entry(date: Date, word: WidgetWordItem?, resting: Bool, settings: WidgetSettings,
                       phonetics: [String: String] = [:], meaningsVi: [String: String] = [:],
                       background: UIImage? = nil) -> WordlyEntry {
        WordlyEntry(date: date, word: word, showMeaning: settings.showMeaning, resting: resting,
                    lockStyle: settings.lockStyle, homeStyle: settings.homeStyle, textAlign: settings.textAlign,
                    phonetic: word.flatMap { WidgetPhonetic.phonetic(for: $0.word, cache: phonetics) },
                    meaning: word.map { WidgetMeaning.meaning(for: $0, cache: meaningsVi) } ?? "",
                    background: background)
    }

    /// Đọc MỘT lần cho cả timeline — mọi entry dùng chung một UIImage (bản cũ
    /// đọc trong body: tới 200 entry × một bitmap → vượt ~30 MB, widget bị kill).
    /// Lỗi gì cũng trả nil → nền màu.
    private func loadBackground(_ settings: WidgetSettings, family: WidgetFamily) -> UIImage? {
        let style = settings.homeStyle
        guard style.hasBackgroundImage else { return nil }
        let kind: WidgetBackgroundKind
        switch family {
        case .systemSmall: kind = .small
        case .systemMedium: kind = .medium
        default: return nil
        }
        return WidgetBackgroundStore.appGroup(appGroup).load(kind, version: style.backgroundVersion).map { UIImage(cgImage: $0) }
    }

    private func loadPhonetics() -> [String: String] {
        UserDefaults(suiteName: appGroup)?.dictionary(forKey: WidgetPhonetic.cacheKey) as? [String: String] ?? [:]
    }

    private func loadMeaningsVi() -> [String: String] {
        UserDefaults(suiteName: appGroup)?.dictionary(forKey: WidgetMeaning.cacheKey) as? [String: String] ?? [:]
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
                .containerBackground(for: .widget) { WidgetBackground(entry: entry) }
        }
        .configurationDisplayName("Wordly — Từ vựng")
        .description("Từ bạn đã lưu xen kẽ từ mới trong kho, trên màn hình khoá và màn hình chính. Chỉnh trong app: Cá nhân → Widget.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

private struct WidgetBackground: View {
    @Environment(\.widgetFamily) private var family
    let entry: WordlyEntry

    var body: some View {
        let style = entry.homeStyle
        if family.isAccessory {
            // Màn hình khoá không đổi được màu (OS tự tô) — style chỉ áp dụng
            // cho widget màn hình chính, nơi containerBackground cho phép nền tùy ý.
            Color.clear
        } else if let image = entry.background {
            Image(uiImage: image).resizable().scaledToFill()
                .overlay(Color.black.opacity(style.backgroundDim))
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
        Group {
            switch family {
            case .accessoryRectangular: LockRectangular(entry: entry)
            case .accessoryCircular: LockCircular(entry: entry)
            case .accessoryInline: LockInline(entry: entry)
            case .systemMedium: HomeWord(entry: entry, wordSize: 30, meaningSize: 16, meaningLines: 3)
            default: HomeWord(entry: entry, wordSize: 24, meaningSize: 14, meaningLines: 4)
            }
        }
        // Bấm widget → app mở đúng từ đang hiện (Từ vựng > Đã lưu / Từ mới + popup)
        .widgetURL(entry.signedOut ? nil : entry.word.flatMap { WidgetDeepLink(item: $0).url })
    }
}

// MARK: - Màn hình khoá
// lockStyle .full: từ + nghĩa. .compact: từ cỡ lớn, nghĩa nhỏ — Apple không cho
// đổi màu/nền ở đây, chỉ cỡ/đậm/bố cục.
//
// Khung chữ nhật cố định ~160×72pt (Apple không có kiểu to hơn). Để tận dụng hết
// chỗ: thử lần lượt các cỡ chữ, ViewThatFits chọn cỡ to nhất mà nghĩa xuống
// dòng hết vẫn vừa khung. Không vừa cỡ nào mới thu nhỏ/cắt "…" như trước.
struct LockRectangular: View {
    let entry: WordlyEntry
    var body: some View {
        let align = entry.textAlign
        if let w = entry.word {
            let compact = entry.lockStyle == .compact
            let meaning: String? = entry.showMeaning ? entry.meaning : (compact ? nil : "Nghĩa là gì nhỉ? 🤔")
            ViewThatFits(in: .vertical) {
                ForEach(Self.sizes(compact: compact), id: \.self) { size in
                    LockWordStack(word: w.word, phonetic: entry.phonetic, meaning: meaning, size: size,
                                  compact: compact, align: align)
                }
                LockWordStack(word: w.word, phonetic: entry.phonetic, meaning: meaning,
                              size: Self.sizes(compact: compact).last!, compact: compact, align: align, truncate: true)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: align.frame)
            .widgetAccentable()
        } else {
            LockMessage(resting: entry.resting, signedOut: entry.signedOut, align: align)
        }
    }

    /// Cỡ (từ, nghĩa) thử từ to đến nhỏ.
    static func sizes(compact: Bool) -> [LockWordStack.Size] {
        compact
            ? [.init(word: 24, meaning: 13), .init(word: 22, meaning: 12), .init(word: 20, meaning: 12)]
            : [.init(word: 17, meaning: 14), .init(word: 17, meaning: 13), .init(word: 15, meaning: 12)]
    }
}

struct LockWordStack: View {
    struct Size: Hashable { let word: CGFloat; let meaning: CGFloat }
    let word: String
    let phonetic: String?
    let meaning: String?
    let size: Size
    let compact: Bool
    let align: WidgetSettings.TextAlign
    /// Phương án cuối: giới hạn dòng + thu nhỏ thay vì đòi vừa khung
    var truncate = false

    var body: some View {
        VStack(alignment: align.horizontal, spacing: 1) {
            // Cụm từ ("take something for granted") được xuống 2 dòng thay vì
            // bị cắt "…"; từ đơn giữ 1 dòng và thu nhỏ — xuống dòng sẽ ngắt giữa chữ.
            Text(word)
                .font(.system(size: size.word, weight: compact ? .heavy : .bold))
                .lineLimit(word.contains(" ") ? 2 : 1)
                .minimumScaleFactor(0.6)
            // Phiên âm nằm giữa từ và nghĩa, nhỏ + nhạt để không tranh với từ
            if let phonetic {
                Text(phonetic)
                    .font(.system(size: max(size.meaning - 2, 11), weight: .regular))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .opacity(0.7)
            }
            if let meaning {
                let text = Text(meaning)
                    .font(.system(size: size.meaning, weight: .medium))
                    .opacity(0.85)
                if truncate {
                    text.lineLimit(compact ? 2 : 3).minimumScaleFactor(0.8)
                } else {
                    // Báo chiều cao thật khi xuống dòng hết → ViewThatFits biết có vừa không
                    text.fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .multilineTextAlignment(align.multiline)
        // Trải hết khung để căn trái/phải bám đúng mép khung
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: align.frame)
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
            Text(entry.showMeaning ? "\(w.word) — \(entry.meaning)" : w.word)
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
                if let phonetic = entry.phonetic {
                    Text(phonetic)
                        .font(.system(size: max(meaningSize - 1, 11)))
                        .foregroundStyle(Color(hex: style.meaningColorHex).opacity(0.75))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.top, -4)
                }
                Text(entry.showMeaning ? entry.meaning : "Đoán nghĩa rồi mở app kiểm tra nhé 🤔")
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
