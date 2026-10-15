import SwiftUI

/// Danh sách mẫu widget màn hình chính — mở dạng tấm cỡ vừa (kéo lên được toàn
/// màn), nút X đóng. Mỗi ô là widget thu nhỏ đúng màu/chữ/ảnh của mẫu.
struct WidgetPresetGalleryView: View {
    let current: WidgetSettings.HomeStyle
    let onSelect: (WidgetPreset) -> Void

    @Environment(\.dismiss) private var dismiss
    /// Ảnh xem trước của mẫu có ảnh nền (thu nhỏ, đọc một lần)
    @State private var thumbnails: [String: CGImage] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 16) {
                    ForEach(WidgetPreset.all) { preset in
                        card(preset)
                    }
                }
                .padding(16)
            }
            .screenBackground()
            .navigationTitle("Mẫu widget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(WordlyColors.inkSoft)
                    }
                    .accessibilityLabel("Đóng")
                    .accessibilityIdentifier("widgetPresetClose")
                }
            }
            .task {
                for preset in WidgetPreset.all {
                    if let bg = preset.background, thumbnails[preset.id] == nil {
                        thumbnails[preset.id] = WidgetPresetBackground.source(bg, maxPixel: 600)
                    }
                }
            }
        }
    }

    private func card(_ preset: WidgetPreset) -> some View {
        let style = preset.style
        let selected = preset.matches(current)
        return Button {
            onSelect(preset)
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("resilient")
                        .font(.system(size: 18, weight: style.wordWeight.swiftUIWeight))
                        .italic(style.wordItalic)
                        .foregroundStyle(Color(hex: style.wordColorHex))
                    Text("kiên cường")
                        .font(.system(size: 12, weight: style.meaningWeight.swiftUIWeight))
                        .italic(style.meaningItalic)
                        .foregroundStyle(Color(hex: style.meaningColorHex))
                }
                .lineLimit(1)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .padding(12)
                .aspectRatio(WidgetBackgroundKind.medium.aspect, contentMode: .fit)
                .background { background(preset, style) }
                .clipShape(RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(selected ? WordlyColors.electric : Color.primary.opacity(0.12), lineWidth: selected ? 3 : 1))
                .overlay(alignment: .topTrailing) {
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundStyle(.white, WordlyColors.electric)
                            .padding(6)
                    }
                }

                Text(preset.name)
                    .font(WordlyFonts.body(14, weight: .bold))
                    .lineLimit(1)
                Text(preset.tagline)
                    .font(WordlyFonts.body(11))
                    .foregroundStyle(WordlyColors.inkSoft)
                    .lineLimit(2, reservesSpace: true)
                    .multilineTextAlignment(.leading)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(preset.name). \(preset.tagline)")
        .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("widgetPreset.\(preset.id)")
    }

    @ViewBuilder
    private func background(_ preset: WidgetPreset, _ style: WidgetSettings.HomeStyle) -> some View {
        if preset.background != nil, let img = thumbnails[preset.id] {
            Image(decorative: img, scale: 1).resizable().scaledToFill()
                .overlay(Color.black.opacity(style.backgroundDim))
        } else if preset.background != nil {
            Color(hex: style.bgHex1)
        } else {
            LinearGradient(colors: style.backgroundHexes.map { Color(hex: $0) },
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}
