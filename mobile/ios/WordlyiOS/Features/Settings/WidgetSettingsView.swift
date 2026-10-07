import SwiftUI
import WidgetKit

// Cài đặt widget màn hình khoá / màn hình chính: chọn từ hiện (đã lưu / gần
// đây / tự chọn), đổi từ mỗi bao lâu, khung giờ hiển thị, ẩn nghĩa để tự kiểm tra.
// Lưu vào App Group → widget đọc và dựng lịch bằng WidgetSchedule.
@MainActor
final class WidgetSettingsViewModel: ObservableObject {
    @Published var settings: WidgetSettings {
        didSet { AppGroupStorage.shared.settings = settings }
    }
    @Published var words: [WidgetWordItem]
    @Published var syncing = false

    init() {
        settings = AppGroupStorage.shared.settings
        words = AppGroupStorage.shared.words
    }

    var preview: WidgetWordItem? {
        WidgetSchedule.entries(words: words, settings: settings).first { $0.word != nil }?.word
            ?? WidgetSchedule.pool(from: words, settings: settings).first
    }

    var allDay: Bool { settings.activeStartMinutes == settings.activeEndMinutes }

    func refresh() async {
        syncing = true
        await WidgetSync.refresh()
        words = AppGroupStorage.shared.words
        syncing = false
    }

    func toggle(_ id: String) {
        if let i = settings.selectedIds.firstIndex(of: id) { settings.selectedIds.remove(at: i) }
        else { settings.selectedIds.append(id) }
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

struct WidgetSettingsView: View {
    @StateObject private var vm = WidgetSettingsViewModel()
    @State private var search = ""

    var body: some View {
        Form {
            Section { preview }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            Section {
                Picker("Hiện từ", selection: $vm.settings.source) {
                    Text("Đã lưu").tag(WidgetSettings.Source.saved)
                    Text("Gần đây").tag(WidgetSettings.Source.recent)
                    Text("Tự chọn").tag(WidgetSettings.Source.custom)
                }
                .pickerStyle(.segmented)
            } header: {
                Text("Nguồn từ")
            } footer: {
                Text(sourceFooter)
            }

            if vm.settings.source == .custom { customPicker }

            Section("Đổi từ") {
                Picker("Đổi từ mỗi", selection: $vm.settings.intervalMinutes) {
                    ForEach(WidgetSettings.intervals, id: \.self) { m in
                        Text(m < 60 ? "\(m) phút" : "\(m / 60) giờ").tag(m)
                    }
                }
                Toggle("Hiện nghĩa tiếng Việt", isOn: $vm.settings.showMeaning)
                    .tint(WordlyColors.electric)
            }

            Section {
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
                Text("Thời điểm hiển thị")
            } footer: {
                Text("Ngoài khung giờ này widget hiện màn nghỉ 🌙 để không làm phiền (vd. khi ngủ).")
            }

            Section {
                Button {
                    Task { await vm.refresh() }
                } label: {
                    HStack {
                        if vm.syncing { ProgressView() }
                        Label("Cập nhật từ mới nhất", systemImage: "arrow.clockwise")
                    }
                }
                .foregroundStyle(WordlyColors.electric)
            } footer: {
                Text("\(vm.words.count) từ đang có trong widget (\(vm.words.filter(\.isSaved).count) từ đã lưu).")
            }

            Section("Thêm widget vào màn hình khoá") {
                step(1, "Khoá máy, rồi nhấn giữ màn hình khoá.")
                step(2, "Chọn Tuỳ chỉnh → Màn hình khoá.")
                step(3, "Bấm vào ô widget dưới đồng hồ, tìm “Wordly”.")
                step(4, "Chọn kiểu chữ nhật (từ + nghĩa) hoặc tròn, rồi Xong.")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Widget màn hình khoá")
        .navigationBarTitleDisplayMode(.inline)
        .task { if vm.words.isEmpty { await vm.refresh() } }
    }

    private var sourceFooter: String {
        switch vm.settings.source {
        case .saved: return "Các từ bạn bấm Lưu khi dịch. Chưa lưu từ nào thì hiện từ gần đây."
        case .recent: return "Mọi từ tiếng Anh bạn đã dịch gần đây."
        case .custom: return "Chỉ những từ bạn chọn bên dưới (\(vm.settings.selectedIds.count) từ)."
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("XEM TRƯỚC").font(WordlyFonts.body(11, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                .padding(.leading, 12)
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Image(systemName: "bookmark.fill").font(.system(size: 10))
                        Text("Wordly").font(.system(size: 11, weight: .semibold))
                    }
                    .opacity(0.7)
                    Text(vm.preview?.word ?? "Chưa có từ").font(.system(size: 18, weight: .bold))
                    Text(vm.preview.map { vm.settings.showMeaning ? $0.meaning : "Nghĩa là gì nhỉ? 🤔" } ?? "Lưu từ khi dịch để hiện ở đây")
                        .font(.system(size: 13)).opacity(0.85).lineLimit(2)
                }
                .foregroundStyle(.white)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.white.opacity(0.18))
                .clipShape(RoundedRectangle(cornerRadius: 18))
            }
            .padding(18)
            .background(LinearGradient(colors: [Color(hex: "#1CB0F6"), Color(hex: "#58CC02")], startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private var customPicker: some View {
        Section {
            TextField("Tìm từ…", text: $search)
            let shown = vm.words.filter { search.isEmpty || $0.word.localizedCaseInsensitiveContains(search) }
            if shown.isEmpty {
                Text("Chưa có từ nào — dịch và lưu từ trước nhé.").foregroundStyle(WordlyColors.inkSoft)
            }
            ForEach(shown) { w in
                Button { vm.toggle(w.id) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(w.word).font(WordlyFonts.body(15, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                                if w.isSaved { Image(systemName: "bookmark.fill").font(.system(size: 10)).foregroundStyle(WordlyColors.duoOrange) }
                            }
                            Text(w.meaning).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
                        }
                        Spacer()
                        Image(systemName: vm.settings.selectedIds.contains(w.id) ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(vm.settings.selectedIds.contains(w.id) ? WordlyColors.electric : WordlyColors.inkGhost)
                    }
                }
            }
        } header: {
            Text("Chọn từ (\(vm.settings.selectedIds.count))")
        }
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.onElectric)
                .frame(width: 22, height: 22).background(WordlyColors.electric).clipShape(Circle())
            Text(text).font(WordlyFonts.body(14))
        }
    }
}
