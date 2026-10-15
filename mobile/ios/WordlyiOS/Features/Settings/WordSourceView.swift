import SwiftUI
import TipKit

/// Trang "Nguồn từ" — dùng chung cho widget màn hình khoá, màn hình chính và
/// thông báo nhắc ôn (spec 2026-10-15-shared-word-source-design.md §5.2).
/// Không hiện số lượng từ (chủ dự án chốt), chỉ giới hạn ghim "x/30".
struct WordSourceView: View {
    @ObservedObject private var store = WordSourceStore.shared

    var body: some View {
        Form {
            Section {
                checkbox("Từ đã lưu", detail: "Những từ bạn bấm Lưu khi dịch",
                         isOn: store.settings.includeSaved, id: "sourceSaved") {
                    store.update { $0.setIncludeSaved(!$0.includeSaved) }
                }
                checkbox("Trộn từ mới trong kho", detail: "1 từ mới sau mỗi 2 từ của bạn, theo trình độ của bạn",
                         isOn: store.settings.includeBank, id: "sourceBank", locked: store.settings.bankLocked) {
                    store.update { $0.setIncludeBank(!$0.includeBank) }
                }
            } header: {
                Text("Nguồn từ")
            } footer: {
                Label("Nếu bạn không chọn “Từ đã lưu” (hoặc chưa lưu từ nào), Wordly luôn dùng từ mới trong kho.",
                      systemImage: "info.circle")
            }

            Section {
                NavigationLink { PinnedWordsView() } label: {
                    HStack {
                        Label("Từ ghim", systemImage: "pin.fill")
                        Spacer()
                        Text("\(store.settings.validPinCount(savedIds: store.savedIds))/\(WordSourceSettings.maxPins)")
                            .foregroundStyle(WordlyColors.inkSoft)
                    }
                }
                .accessibilityIdentifier("pinnedEntry")
                Toggle(isOn: Binding(get: { store.settings.pinnedOnly },
                                     set: { on in store.update { $0.pinnedOnly = on } })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Chỉ dùng từ ghim")
                        Text("Bật khi muốn ôn tập trung một danh sách ngắn")
                            .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                    }
                }
                .tint(WordlyColors.electric)
                .accessibilityIdentifier("pinnedOnly")
                if store.settings.pinnedOnly && store.settings.validPinCount(savedIds: store.savedIds) == 0 {
                    Text("Chưa có từ ghim nào — đang dùng nguồn từ ở trên.")
                        .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.duoOrange)
                }
            } header: {
                Text("Từ ghim")
            } footer: {
                Text("Từ ghim được nhắc nhiều gấp đôi. Ghim nhanh bằng nút 📌 khi xem chi tiết một từ đã lưu.")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .safeAreaInset(edge: .bottom) {
            Text("Dùng chung cho widget màn hình khoá, màn hình chính và thông báo nhắc ôn.")
                .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24).padding(.vertical, 10)
        }
        .navigationTitle("Nguồn từ")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { store.reload() }
    }

    private func checkbox(_ title: String, detail: String, isOn: Bool, id: String, locked: Bool = false,
                          action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 22))
                    .foregroundStyle(isOn ? WordlyColors.electric : WordlyColors.inkSoft)
                    .opacity(locked ? 0.5 : 1)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).foregroundStyle(WordlyColors.ink)
                    Text(locked ? "Đang là nguồn duy nhất nên luôn bật" : detail)
                        .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
                Spacer()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// Chọn từ ghim trong danh sách từ đã lưu (chủ dự án chốt). Từ ghim lên đầu.
struct PinnedWordsView: View {
    @ObservedObject private var store = WordSourceStore.shared
    @State private var query = ""
    @State private var toast: String?

    private var words: [WidgetWordItem] {
        let all = store.savedWords
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let filtered = q.isEmpty ? all : all.filter { $0.word.lowercased().contains(q) || $0.meaning.lowercased().contains(q) }
        let pinned = Set(store.settings.pinnedIds)
        return filtered.filter { pinned.contains($0.id) } + filtered.filter { !pinned.contains($0.id) }
    }

    var body: some View {
        List {
            if store.savedWords.isEmpty {
                Text("Lưu từ khi dịch để ghim").foregroundStyle(WordlyColors.inkSoft)
            } else {
                Section {
                    ForEach(words) { w in
                        let on = store.settings.isPinned(w.id)
                        Button {
                            switch store.update({ $0.togglePin(w.id) }) {
                            case .limitReached: toast = "Tối đa \(WordSourceSettings.maxPins) từ ghim"
                            default: break
                            }
                        } label: {
                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(w.word).font(WordlyFonts.body(15, weight: .semibold)).foregroundStyle(WordlyColors.ink)
                                    Text(w.meaning).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft).lineLimit(1)
                                }
                                Spacer()
                                Image(systemName: on ? "pin.fill" : "pin")
                                    .foregroundStyle(on ? WordlyColors.electric : WordlyColors.inkSoft)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("pin.\(w.id)")
                        .accessibilityLabel(w.word)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                } header: {
                    Text("Đã ghim \(store.settings.validPinCount(savedIds: store.savedIds))/\(WordSourceSettings.maxPins)")
                }
            }
        }
        .searchable(text: $query, prompt: "Tìm từ đã lưu")
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Từ ghim")
        .navigationBarTitleDisplayMode(.inline)
        .toast($toast, systemImage: "exclamationmark.circle.fill", color: WordlyColors.duoOrange)
    }
}

/// Nút 📌 ghim nhanh trong popup chi tiết từ đã lưu.
struct QuickPinButton: View {
    let id: String
    @ObservedObject private var store = WordSourceStore.shared
    @Binding var toast: String?

    var body: some View {
        let on = store.settings.isPinned(id)
        Button {
            PinTip().invalidate(reason: .actionPerformed)
            switch store.update({ $0.togglePin(id) }) {
            case .pinned: toast = "Đã ghim — gặp từ này nhiều hơn"
            case .unpinned: toast = "Đã bỏ ghim"
            case .limitReached: toast = "Tối đa \(WordSourceSettings.maxPins) từ ghim"
            }
        } label: {
            Image(systemName: on ? "pin.fill" : "pin")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(on ? WordlyColors.onElectric : WordlyColors.electric)
                .frame(width: 40, height: 40)
                .background(on ? WordlyColors.electric : WordlyColors.electricSubtle)
                .clipShape(Circle())
        }
        .accessibilityIdentifier("quickPin")
        .popoverTip(PinTip())
        .accessibilityLabel(on ? "Bỏ ghim" : "Ghim từ này")
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
