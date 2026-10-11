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
    @Published var bank: [WidgetWordItem]
    @Published var syncing = false

    init() {
        settings = AppGroupStorage.shared.settings
        words = AppGroupStorage.shared.words
        bank = AppGroupStorage.shared.bank
    }

    var preview: WidgetWordItem? {
        upcomingPreview.first
    }

    /// Vài từ sắp hiện tiếp theo trên widget — xem trước nhiều thẻ, không chỉ 1 từ.
    var upcomingPreview: [WidgetWordItem] {
        let scheduled = WidgetSchedule.entries(words: words, bank: bank, settings: settings).compactMap(\.word)
        if !scheduled.isEmpty { return Array(scheduled.prefix(5)) }
        if let fallback = WidgetSchedule.pool(from: words, settings: settings).first { return [fallback] }
        return []
    }

    /// Từ kho thực sự được trộn (đã bỏ từ trùng với từ của bạn)
    var bankInUse: Int { WidgetSchedule.bankPool(bank, words: words, settings: settings).count }

    var allDay: Bool { settings.activeStartMinutes == settings.activeEndMinutes }

    func refresh() async {
        syncing = true
        await WidgetSync.refresh()
        await WidgetSync.refreshBank(force: bank.isEmpty)
        words = AppGroupStorage.shared.words
        bank = AppGroupStorage.shared.bank
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

struct WidgetSettingsView: View {
    @StateObject private var vm = WidgetSettingsViewModel()

    var body: some View {
        Form {
            Section { preview }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            Section {
                if vm.settings.source == .custom {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Đang dùng danh sách tự chọn")
                                .font(WordlyFonts.body(14, weight: .semibold))
                            Text("\(vm.settings.selectedIds.count) từ")
                                .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                        }
                        Spacer()
                        Button("Đổi lại") { vm.settings.source = .saved }
                            .font(WordlyFonts.body(13, weight: .semibold))
                    }
                } else {
                    // Chỉ 2 lựa chọn phổ biến ở màn chính — "Tự chọn" chuyển
                    // xuống mục "Tùy chỉnh thêm" bên dưới để không làm rối
                    // (trước đây 3 lựa chọn + 1 toggle phụ thuộc gây khó hiểu).
                    Picker("Hiện từ", selection: $vm.settings.source) {
                        Text("Đã lưu").tag(WidgetSettings.Source.saved)
                        Text("Gần đây").tag(WidgetSettings.Source.recent)
                    }
                    .pickerStyle(.segmented)
                    Toggle(isOn: $vm.settings.includeBank) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Trộn từ mới từ kho")
                            Text("Xen kẽ 2 từ của bạn : 1 từ mới theo trình độ")
                                .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                        }
                    }
                    .tint(WordlyColors.electric)
                }
            } header: {
                Text("Nguồn từ")
            } footer: {
                Text(sourceFooter)
            }

            Section {
                NavigationLink {
                    CustomWordPickerView(vm: vm)
                } label: {
                    HStack {
                        Text("Tự chọn từng từ")
                        Spacer()
                        Text("\(vm.settings.selectedIds.count) từ").foregroundStyle(WordlyColors.inkSoft)
                    }
                }
            } footer: {
                Text("Chỉ dành riêng những từ bạn chọn, không trộn từ kho.")
            }

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
                Picker("Màn hình khoá", selection: $vm.settings.lockStyle) {
                    Text("Đầy đủ").tag(WidgetSettings.LockStyle.full)
                    Text("Gọn, chữ to").tag(WidgetSettings.LockStyle.compact)
                }
                Picker("Màu nền màn hình chính", selection: $vm.settings.homeTheme) {
                    Text("Mặc định").tag(WidgetSettings.HomeTheme.defaultTheme)
                    Text("Hoàng hôn").tag(WidgetSettings.HomeTheme.sunset)
                    Text("Nửa đêm").tag(WidgetSettings.HomeTheme.midnight)
                }
            } header: {
                Text("Kiểu hiển thị")
            } footer: {
                Text("Màn hình khoá chỉ đổi được cỡ chữ/bố cục — iOS tự tô màu đơn sắc, không đổi được nền/viền ở đây.")
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
                Text("\(vm.words.count) từ của bạn (\(vm.words.filter(\.isSaved).count) đã lưu) + \(vm.bankInUse) từ mới từ kho hôm nay. Từ trùng được lọc bỏ; mỗi vòng xáo thứ tự khác nhau.")
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
        case .saved: return "Các từ bạn bấm Lưu khi dịch (chưa lưu từ nào thì dùng từ gần đây), trộn thêm từ mới nếu bật."
        case .recent: return "Mọi từ tiếng Anh bạn đã dịch gần đây."
        case .custom: return "Chỉ những từ bạn chọn bên dưới (\(vm.settings.selectedIds.count) từ) — không trộn từ kho."
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("XEM TRƯỚC — CÁC THẺ SẮP TỚI").font(WordlyFonts.body(11, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                .padding(.leading, 12)
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
        }
        .padding(.vertical, 8)
    }

    private func previewCard(word: WidgetWordItem?, isNow: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: word?.fromBank == true ? "sparkles" : "bookmark.fill").font(.system(size: 10))
                Text(isNow ? "Bây giờ" : "Tiếp theo").font(.system(size: 11, weight: .semibold))
            }
            .opacity(0.7)
            Text(word?.word ?? "Chưa có từ").font(.system(size: 18, weight: .bold)).lineLimit(1)
            Text(word.map { vm.settings.showMeaning ? $0.meaning : "Nghĩa là gì nhỉ? 🤔" } ?? "Lưu từ khi dịch để hiện ở đây")
                .font(.system(size: 13)).opacity(0.85).lineLimit(2)
        }
        .foregroundStyle(.white)
        .padding(14)
        .frame(width: 180, alignment: .leading)
        .background(.white.opacity(isNow ? 0.18 : 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .padding(isNow ? 4 : 10)
        .background(LinearGradient(colors: [Color(hex: "#1CB0F6"), Color(hex: "#58CC02")], startPoint: .topLeading, endPoint: .bottomTrailing))
        .clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private func step(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)").font(WordlyFonts.body(12, weight: .bold)).foregroundStyle(WordlyColors.onElectric)
                .frame(width: 22, height: 22).background(WordlyColors.electric).clipShape(Circle())
            Text(text).font(WordlyFonts.body(14))
        }
    }
}
