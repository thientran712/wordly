import SwiftUI

// Chọn từ riêng cho widget — trước đây xổ hết tất cả từ ngay trong trang cài
// đặt, không chịu được khi có hàng ngàn từ đã lưu/dịch. Giờ tách màn riêng,
// có thanh tìm kiếm gốc iOS (.searchable); không gõ gì thì chỉ hiện từ đã
// chọn + một ít từ gợi ý đầu danh sách, gõ mới lọc trong toàn bộ kho từ.
struct CustomWordPickerView: View {
    @ObservedObject var vm: WidgetSettingsViewModel
    @State private var search = ""

    private var selected: [WidgetWordItem] {
        vm.words.filter { vm.settings.selectedIds.contains($0.id) }
    }

    private var candidates: [WidgetWordItem] {
        let unselected = vm.words.filter { !vm.settings.selectedIds.contains($0.id) }
        guard !search.isEmpty else { return Array(unselected.prefix(30)) }
        return unselected.filter { $0.word.localizedCaseInsensitiveContains(search) }
    }

    var body: some View {
        List {
            if !selected.isEmpty {
                Section("Đã chọn (\(selected.count))") {
                    ForEach(selected) { w in row(w, isSelected: true) }
                }
            }
            Section {
                if candidates.isEmpty {
                    Text(search.isEmpty ? "Chưa có từ nào — dịch và lưu từ trước nhé." : "Không tìm thấy “\(search)”")
                        .foregroundStyle(WordlyColors.inkSoft)
                } else {
                    ForEach(candidates) { w in row(w, isSelected: false) }
                }
            } header: {
                if search.isEmpty, vm.words.count > candidates.count + selected.count {
                    Text("Gợi ý — gõ để tìm trong \(vm.words.count) từ")
                } else {
                    Text("Kết quả")
                }
            }
        }
        .searchable(text: $search, prompt: "Tìm từ…")
        .navigationTitle("Tự chọn từng từ")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ w: WidgetWordItem, isSelected: Bool) -> some View {
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
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? WordlyColors.electric : WordlyColors.inkGhost)
            }
        }
    }
}
