import SwiftUI

/// Tuỳ biến widget MÀN HÌNH CHÍNH (home screen hỗ trợ nền tuỳ ý, khác màn
/// hình khoá bị OS giới hạn chỉ đơn sắc) — màu nền/gradient, màu chữ,
/// đậm/nghiêng/nhạt riêng cho từ và nghĩa.
struct HomeStyleView: View {
    @ObservedObject var vm: WidgetSettingsViewModel

    var body: some View {
        Form {
            Section { preview }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            Section("Màu nền") {
                ColorPicker("Màu 1", selection: colorBinding(\.bgHex1))
                ColorPicker("Màu 2 (gradient)", selection: colorBinding(\.bgHex2))
            }

            Section("Chữ — Từ vựng") {
                ColorPicker("Màu chữ", selection: colorBinding(\.wordColorHex))
                weightPicker(\.wordWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.wordItalic)).tint(WordlyColors.electric)
            }

            Section("Chữ — Ý nghĩa") {
                ColorPicker("Màu chữ", selection: colorBinding(\.meaningColorHex))
                weightPicker(\.meaningWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.meaningItalic)).tint(WordlyColors.electric)
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Màn hình chính")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var preview: some View {
        let style = vm.settings.homeStyle
        let align = vm.settings.textAlign
        return VStack(alignment: .leading, spacing: 8) {
            Text("XEM TRƯỚC").font(WordlyFonts.body(11, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                .padding(.leading, 12)
            VStack(alignment: align.horizontal, spacing: 4) {
                Text("resilient")
                    .font(.system(size: 26, weight: style.wordWeight.swiftUIWeight))
                    .italic(style.wordItalic)
                    .foregroundStyle(Color(hex: style.wordColorHex))
                Text("kiên cường, mau phục hồi")
                    .font(.system(size: 15, weight: style.meaningWeight.swiftUIWeight))
                    .italic(style.meaningItalic)
                    .foregroundStyle(Color(hex: style.meaningColorHex))
            }
            .multilineTextAlignment(align.multiline)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: align.frame)
            .padding(16)
            .frame(height: 140)
            .background(LinearGradient(colors: [Color(hex: style.bgHex1), Color(hex: style.bgHex2)],
                                       startPoint: .topLeading, endPoint: .bottomTrailing))
            .clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private func colorBinding(_ keyPath: WritableKeyPath<WidgetSettings.HomeStyle, String>) -> Binding<Color> {
        Binding(
            get: { Color(hex: vm.settings.homeStyle[keyPath: keyPath]) },
            set: { vm.settings.homeStyle[keyPath: keyPath] = $0.toHex() }
        )
    }
    private func boolBinding(_ keyPath: WritableKeyPath<WidgetSettings.HomeStyle, Bool>) -> Binding<Bool> {
        Binding(
            get: { vm.settings.homeStyle[keyPath: keyPath] },
            set: { vm.settings.homeStyle[keyPath: keyPath] = $0 }
        )
    }
    private func weightPicker(_ keyPath: WritableKeyPath<WidgetSettings.HomeStyle, WidgetSettings.TextWeight>) -> some View {
        Picker("Độ đậm", selection: Binding(
            get: { vm.settings.homeStyle[keyPath: keyPath] },
            set: { vm.settings.homeStyle[keyPath: keyPath] = $0 }
        )) {
            Text("Nhạt").tag(WidgetSettings.TextWeight.light)
            Text("Thường").tag(WidgetSettings.TextWeight.regular)
            Text("Đậm").tag(WidgetSettings.TextWeight.bold)
        }
    }
}
