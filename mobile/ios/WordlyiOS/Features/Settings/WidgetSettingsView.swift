import SwiftUI
import WidgetKit

// Cài đặt widget màn hình khoá / màn hình chính: chọn từ hiện (đã lưu và/hoặc
// dịch gần đây, hoặc tự chọn), đổi từ mỗi bao lâu, khung giờ hiển thị, ẩn nghĩa để tự kiểm tra.
// Lưu vào App Group → widget đọc và dựng lịch bằng WidgetSchedule.
@MainActor
final class WidgetSettingsViewModel: ObservableObject {
    @Published var settings: WidgetSettings {
        didSet { AppGroupStorage.shared.settings = settings }
    }
    @Published var words: [WidgetWordItem]
    @Published var bank: [WidgetWordItem]
    @Published var syncing = false
    @Published var phonetics: [String: String]
    @Published var meaningsVi: [String: String]

    init() {
        settings = AppGroupStorage.shared.settings
        words = AppGroupStorage.shared.words
        bank = AppGroupStorage.shared.bank
        phonetics = AppGroupStorage.shared.phonetics
        meaningsVi = AppGroupStorage.shared.meaningsVi
        AppGroupStorage.shared.deleteHomeBackgroundImage()
    }

    var preview: WidgetWordItem? {
        upcomingPreview.first
    }

    /// Vài từ sắp hiện tiếp theo trên widget — xem trước nhiều thẻ, không chỉ 1 từ.
    /// Từ kho hiện nghĩa Việt giống trên widget (WidgetMeaning).
    var upcomingPreview: [WidgetWordItem] {
        let source = AppGroupStorage.shared.wordSource
        let scheduled = WidgetSchedule.entries(words: words, bank: bank, source: source, settings: settings).compactMap(\.word)
        if !scheduled.isEmpty { return scheduled.prefix(5).map { WidgetMeaning.localized($0, cache: meaningsVi) } }
        let pool = WordSourcePool.build(settings: source, saved: words.filter(\.isSaved), bank: bank)
        return (pool.personal.first ?? pool.bank.first).map { [$0] } ?? []
    }

    var savedCount: Int { words.filter(\.isSaved).count }
    var unsavedCount: Int { words.count - savedCount }

    /// Từ kho thực sự được trộn (đã bỏ từ trùng với từ của bạn)

    var allDay: Bool { settings.activeStartMinutes == settings.activeEndMinutes }

    func refresh() async {
        syncing = true
        await WidgetSync.refresh()
        await WidgetSync.refreshBank(force: bank.isEmpty)
        words = AppGroupStorage.shared.words
        bank = AppGroupStorage.shared.bank
        await WidgetSync.refreshPhonetics()
        phonetics = AppGroupStorage.shared.phonetics
        meaningsVi = AppGroupStorage.shared.meaningsVi
        syncing = false
    }

    func toggle(_ id: String) {
        if let i = settings.selectedIds.firstIndex(of: id) { settings.selectedIds.remove(at: i) }
        else {
            settings.selectedIds.append(id)
            settings.source = .custom  // chọn 1 từ ở đây là chuyển sang chế độ tự chọn
        }
    }

    func setAllDay(_ on: Bool) {
        if on {
            settings.activeStartMinutes = 0
            settings.activeEndMinutes = 0
        } else {
            settings.activeStartMinutes = 7 * 60
            settings.activeEndMinutes = 22 * 60
        }
    }

    static func date(minutes: Int) -> Date {
        Calendar.current.date(bySettingHour: minutes / 60, minute: minutes % 60, second: 0, of: Date()) ?? Date()
    }
    static func minutes(_ date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
}

/// Trang "Widget" gộp (spec 2026-10-15-shared-word-source-design.md §5.5, cách B):
/// nút chuyển [Màn hình khoá | Màn hình chính] ở đầu; các khối là thẻ tách rời có
/// tiêu đề rõ — xem trước → hướng dẫn → riêng loại đang chọn → ÁP DỤNG CHO CẢ 2
/// WIDGET → cách thêm widget. Nguồn từ ở trang riêng (dùng chung với push).
struct WidgetSettingsView: View {
    enum Tab: String { case lock, home }

    @StateObject private var vm = WidgetSettingsViewModel()
    @ObservedObject private var source = WordSourceStore.shared
    @AppStorage("widgetHub.tab") private var tabRaw = Tab.lock.rawValue
    @State private var guideOpen = false

    private var tab: Tab { Tab(rawValue: tabRaw) ?? .lock }

    var body: some View {
        Form {
            Section {
                Picker("Loại widget", selection: $tabRaw) {
                    Text("Màn hình khoá").tag(Tab.lock.rawValue)
                    Text("Màn hình chính").tag(Tab.home.rawValue)
                }
                .pickerStyle(.segmented)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))

            if tab == .home {
                HomeStylePreviewSection(vm: vm)
            } else {
                Section {
                    lockPreview
                    Picker("Kiểu", selection: $vm.settings.lockStyle) {
                        Text("Đầy đủ").tag(WidgetSettings.LockStyle.full)
                        Text("Gọn, chữ to").tag(WidgetSettings.LockStyle.compact)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 4)
                } header: {
                    HubHeader("Xem trước", systemImage: "eye")
                } footer: {
                    Text("Màn hình khoá iOS tự tô màu đơn sắc — chỉ chỉnh được kiểu chữ.")
                }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
            }

            Section {
                DisclosureGroup(isExpanded: $guideOpen) {
                    ForEach(guideItems, id: \.text) { item in
                        Label(item.text, systemImage: item.icon)
                            .font(WordlyFonts.body(14))
                    }
                } label: {
                    Label("Hướng dẫn sử dụng", systemImage: "lightbulb")
                        .font(WordlyFonts.body(15, weight: .semibold))
                }
                .accessibilityIdentifier("widgetGuideToggle")
            }

            if tab == .home {
                HomeStyleSections(vm: vm)
            }

            // ── Áp dụng cho cả 2 widget ──
            Section {
                Toggle("Hiện nghĩa tiếng Việt", isOn: $vm.settings.showMeaning)
                    .tint(WordlyColors.electric)
                Picker("Căn chữ", selection: $vm.settings.textAlign) {
                    Image(systemName: "text.alignleft").tag(WidgetSettings.TextAlign.leading)
                    Image(systemName: "text.aligncenter").tag(WidgetSettings.TextAlign.center)
                    Image(systemName: "text.alignright").tag(WidgetSettings.TextAlign.trailing)
                }
                .pickerStyle(.segmented)
            } header: {
                VStack(alignment: .leading, spacing: 10) {
                    Label("ÁP DỤNG CHO CẢ 2 WIDGET", systemImage: "square.on.square")
                        .font(WordlyFonts.body(13, weight: .heavy))
                        .foregroundStyle(WordlyColors.electric)
                        .accessibilityIdentifier("sharedSettingsHeader")
                    HubHeader("Chữ", systemImage: "textformat")
                }
                .textCase(nil)
                .padding(.top, 8)
            }

            Section {
                Picker("Đổi từ mỗi", selection: $vm.settings.intervalMinutes) {
                    ForEach(WidgetSettings.intervals, id: \.self) { m in
                        Text(m < 60 ? "\(m) phút" : "\(m / 60) giờ").tag(m)
                    }
                }
                .pickerStyle(.segmented)
                Toggle("Hiện cả ngày", isOn: Binding(get: { vm.allDay }, set: { vm.setAllDay($0) }))
                    .tint(WordlyColors.electric)
                if !vm.allDay {
                    DatePicker("Bắt đầu", selection: Binding(
                        get: { WidgetSettingsViewModel.date(minutes: vm.settings.activeStartMinutes) },
                        set: { vm.settings.activeStartMinutes = WidgetSettingsViewModel.minutes($0) }
                    ), displayedComponents: .hourAndMinute)
                    DatePicker("Kết thúc", selection: Binding(
                        get: { WidgetSettingsViewModel.date(minutes: vm.settings.activeEndMinutes) },
                        set: { vm.settings.activeEndMinutes = WidgetSettingsViewModel.minutes($0) }
                    ), displayedComponents: .hourAndMinute)
                }
            } header: {
                HubHeader("Đổi từ", systemImage: "clock.arrow.circlepath")
            } footer: {
                Text("Ngoài khung giờ này widget hiện màn nghỉ 🌙 để không làm phiền (vd. khi ngủ).")
            }

            Section {
                NavigationLink { WordSourceView() } label: {
                    HStack {
                        Label("Nguồn từ", systemImage: "books.vertical")
                        Spacer()
                        Text(source.summary).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
                    }
                }
            } footer: {
                Text("Dùng chung với thông báo nhắc ôn.")
            }

            // ── Cách thêm widget (theo loại đang chọn) ──
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(Array(addSteps.enumerated()), id: \.offset) { i, text in
                            stepCard(i + 1, text)
                        }
                    }
                    .padding(.vertical, 4)
                }
            } header: {
                HubHeader(tab == .lock ? "Cách thêm widget vào màn hình khoá" : "Cách thêm widget vào màn hình chính",
                          systemImage: "plus.square.on.square")
                    .accessibilityIdentifier(tab == .lock ? "addStepsLock" : "addStepsHome")
                    .padding(.top, 8)
            } footer: {
                if tab == .lock {
                    Text("iOS đặt hàng widget ở giữa khi hàng chưa đủ chỗ. Muốn Wordly sát mép trái: đặt Wordly đầu hàng rồi thêm 2 widget tròn bên phải cho kín hàng.")
                } else {
                    Text("Cỡ Vừa có thêm câu nhắc vui bên cạnh từ.")
                }
            }
        }
        .listSectionSpacing(20)
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Widget")
        .navigationBarTitleDisplayMode(.inline)
        .task { if vm.words.isEmpty { await vm.refresh() } }
        .onAppear { source.reload() }
    }

    private struct GuideItem { let icon: String; let text: String }

    private var guideItems: [GuideItem] {
        switch tab {
        case .lock:
            return [GuideItem(icon: "arrow.triangle.2.circlepath", text: "Từ đổi theo nhịp ở mục “Đổi từ”, lấy từ “Nguồn từ”."),
                    GuideItem(icon: "hand.tap", text: "Chạm widget để mở đúng từ đó trong app."),
                    GuideItem(icon: "eye.slash", text: "Tắt “Hiện nghĩa tiếng Việt” để tự đố mình."),
                    GuideItem(icon: "textformat.size", text: "Kiểu “Gọn, chữ to” chỉ hiện từ, dễ đọc khi liếc.")]
        case .home:
            return [GuideItem(icon: "paintpalette", text: "Chọn theme màu hoặc theme ảnh có sẵn."),
                    GuideItem(icon: "photo", text: "Ảnh của bạn sẽ đè lên ảnh của theme; xoá đi là về ảnh theme."),
                    GuideItem(icon: "rectangle.split.2x1", text: "Cỡ Vừa có thêm câu nhắc vui; cỡ Nhỏ gọn hơn."),
                    GuideItem(icon: "hand.tap", text: "Chạm widget để mở đúng từ đó trong app.")]
        }
    }

    private var addSteps: [String] {
        switch tab {
        case .lock:
            return ["Khoá máy, rồi nhấn giữ màn hình khoá.",
                    "Chọn Tuỳ chỉnh → Màn hình khoá.",
                    "Chạm ô widget dưới đồng hồ, tìm “Wordly”.",
                    "Chọn kiểu chữ nhật (từ + nghĩa), rồi Xong."]
        case .home:
            return ["Nhấn giữ chỗ trống trên màn hình chính đến khi biểu tượng rung.",
                    "Bấm Sửa ở góc trên trái → Thêm tiện ích.",
                    "Tìm “Wordly”.",
                    "Chọn cỡ Nhỏ hoặc Vừa → Thêm tiện ích → Xong."]
        }
    }

    private func stepCard(_ n: Int, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let img = UIImage(named: "widget-guide-\(tab.rawValue)-\(n)") {
                Image(uiImage: img).resizable().scaledToFit()
                    .frame(width: 170, height: 170)
                    .accessibilityHidden(true)
            }
            HStack(alignment: .top, spacing: 8) {
                Text("\(n)").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.onElectric)
                    .frame(width: 22, height: 22).background(WordlyColors.electric).clipShape(Circle())
                Text(text).font(WordlyFonts.body(13)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(width: 170, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var lockPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                if vm.upcomingPreview.isEmpty {
                    previewCard(word: nil, isNow: true)
                } else {
                    ForEach(Array(vm.upcomingPreview.enumerated()), id: \.offset) { i, w in
                        previewCard(word: w, isNow: i == 0)
                    }
                }
            }
            .padding(.horizontal, 4)
        }
        .padding(.vertical, 4)
    }

    private func previewCard(word: WidgetWordItem?, isNow: Bool) -> some View {
        let align = vm.settings.textAlign
        let compact = vm.settings.lockStyle == .compact
        return VStack(alignment: align.horizontal, spacing: 2) {
            Text(isNow ? "Bây giờ" : "Tiếp theo").font(.system(size: 11, weight: .semibold)).opacity(0.7)
            Text(word?.word ?? "Chưa có từ").font(.system(size: compact ? 24 : 18, weight: .bold))
                .lineLimit(1).minimumScaleFactor(0.5)
            if !compact {
                if let p = word.flatMap({ WidgetPhonetic.phonetic(for: $0.word, cache: vm.phonetics) }) {
                    Text(p).font(.system(size: 12)).opacity(0.75).lineLimit(1)
                }
                Text(word.map { vm.settings.showMeaning ? $0.meaning : WidgetCopy.pick(WidgetCopy.hiddenMeaningPrompts, seed: $0.id) } ?? WidgetCopy.emptySubtitle)
                    .font(.system(size: 13)).opacity(0.85)
                    .lineLimit(2).minimumScaleFactor(0.6)
            }
        }
        .multilineTextAlignment(align.multiline)
        .foregroundStyle(.white)
        .padding(14)
        .frame(width: 180, alignment: align.frame)
        .background(.white.opacity(isNow ? 0.18 : 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .padding(isNow ? 4 : 10)
        .background(LinearGradient(colors: [Color(hex: "#1CB0F6"), Color(hex: "#58CC02")], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}
