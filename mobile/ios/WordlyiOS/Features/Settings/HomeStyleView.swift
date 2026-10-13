import SwiftUI
import PhotosUI

/// Tuỳ biến widget MÀN HÌNH CHÍNH (home screen hỗ trợ nền tuỳ ý, khác màn
/// hình khoá bị OS giới hạn chỉ đơn sắc) — theme phối sẵn, ảnh nền hoặc màu
/// nền (một màu / gradient), màu chữ, đậm/nghiêng/nhạt riêng cho từ và nghĩa.
/// Chọn màu bằng bảng ô vuông (WidgetTheme.swatches), không dùng ColorPicker.
struct HomeStyleView: View {
    @ObservedObject var vm: WidgetSettingsViewModel
    @State private var photoItem: PhotosPickerItem?
    /// Ảnh vừa chọn, đã thu nhỏ ≤ 2048 px → mở màn chỉnh khung
    @State private var editorSource: CGImage?
    @State private var loadError: String?
    /// Ảnh nền đã lưu cho phần xem trước — đọc lại chỉ khi đổi phiên bản
    @State private var savedBackground: CGImage?

    var body: some View {
        Form {
            Section { preview }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            Section {
                themeGrid
            } header: {
                Text("Theme")
            } footer: {
                Text("Phối sẵn màu nền và chữ, đều đủ tương phản để dễ đọc. Chọn xong vẫn chỉnh tiếp được bên dưới.")
            }

            Section {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(vm.settings.homeStyle.hasBackgroundImage ? "Đổi ảnh khác" : "Chọn ảnh từ thư viện",
                          systemImage: "photo")
                }
                if vm.settings.homeStyle.hasBackgroundImage {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Làm tối")
                        Slider(value: $vm.settings.homeStyle.backgroundDim,
                               in: 0...WidgetSettings.HomeStyle.maxDim).tint(WordlyColors.electric)
                    }
                    Button("Xoá ảnh nền", role: .destructive) {
                        vm.settings.homeStyle.backgroundVersion = 0
                        WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).removeAll(except: 0)
                    }
                }
                if let loadError {
                    Text(loadError).foregroundStyle(WordlyColors.error)
                }
            } header: {
                Text("Ảnh nền")
            } footer: {
                Text("Chỉ widget màn hình chính. Có ảnh thì màu nền bên dưới không dùng tới.")
            }

            Section("Màu nền") {
                Toggle("Chuyển màu (gradient)", isOn: boolBinding(\.useGradient)).tint(WordlyColors.electric)
                swatchRow(vm.settings.homeStyle.useGradient ? "Màu 1" : "Màu nền", \.bgHex1)
                if vm.settings.homeStyle.useGradient {
                    swatchRow("Màu 2", \.bgHex2)
                }
            }

            Section("Chữ — Từ vựng") {
                swatchRow("Màu chữ", \.wordColorHex)
                weightPicker(\.wordWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.wordItalic)).tint(WordlyColors.electric)
            }

            Section("Chữ — Ý nghĩa") {
                swatchRow("Màu chữ", \.meaningColorHex)
                weightPicker(\.meaningWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.meaningItalic)).tint(WordlyColors.electric)
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Màn hình chính")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                // Data của file gốc (vài MB) — KHÔNG UIImage(data:): giải mã thẳng
                // xuống ≤ 2048 px, ảnh 48 MP không bao giờ được giải mã đầy đủ.
                let data = try? await item.loadTransferable(type: Data.self)
                photoItem = nil
                guard let data, let img = WidgetImageIO.downsample(data: data, maxPixel: 2048) else {
                    loadError = "Không đọc được ảnh này, thử ảnh khác."
                    return
                }
                loadError = nil
                editorSource = img
            }
        }
        .task(id: vm.settings.homeStyle.backgroundVersion) {
            let v = vm.settings.homeStyle.backgroundVersion
            savedBackground = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).load(.medium, version: v)
        }
        .fullScreenCover(isPresented: Binding(get: { editorSource != nil },
                                              set: { if !$0 { editorSource = nil } })) {
            if let editorSource {
                WidgetBackgroundEditorView(source: editorSource, vm: vm) { self.editorSource = nil }
            }
        }
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
            .background {
                if style.hasBackgroundImage, let img = savedBackground {
                    Image(decorative: img, scale: 1).resizable().scaledToFill()
                        .overlay(Color.black.opacity(style.backgroundDim))
                } else {
                    LinearGradient(colors: style.backgroundHexes.map { Color(hex: $0) },
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    /// Lưới theme: mỗi ô là widget thu nhỏ với đúng màu nền + chữ của theme.
    private var themeGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 10)], spacing: 10) {
            ForEach(WidgetTheme.all) { theme in
                let selected = vm.settings.homeStyle.matches(theme)
                Button {
                    vm.settings.homeStyle.apply(theme)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Aa").font(.system(size: 18, weight: .bold)).foregroundStyle(Color(hex: theme.word))
                        Text(theme.name).font(.system(size: 11, weight: .medium)).lineLimit(1)
                            .foregroundStyle(Color(hex: theme.meaning))
                    }
                    .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                    .padding(.horizontal, 10)
                    .background(LinearGradient(colors: [Color(hex: theme.bg1), Color(hex: theme.bg2 ?? theme.bg1)],
                                               startPoint: .topLeading, endPoint: .bottomTrailing))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(selected ? WordlyColors.electric : Color.primary.opacity(0.12), lineWidth: selected ? 3 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(theme.name)
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .padding(.vertical, 6)
    }

    /// Bảng ô vuông màu — chạm để chọn, ô đang dùng có viền.
    private func swatchRow(_ title: String, _ keyPath: WritableKeyPath<WidgetSettings.HomeStyle, String>) -> some View {
        let current = vm.settings.homeStyle[keyPath: keyPath].uppercased()
        return VStack(alignment: .leading, spacing: 8) {
            Text(title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 32), spacing: 8)], spacing: 8) {
                ForEach(WidgetTheme.swatches, id: \.self) { hex in
                    let selected = current == hex
                    Button {
                        vm.settings.homeStyle[keyPath: keyPath] = hex
                    } label: {
                        RoundedRectangle(cornerRadius: 7)
                            .fill(Color(hex: hex))
                            .frame(height: 32)
                            .overlay(RoundedRectangle(cornerRadius: 7)
                                .stroke(selected ? WordlyColors.electric : Color.primary.opacity(0.15),
                                        lineWidth: selected ? 3 : 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(hex)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
        }
        .padding(.vertical, 4)
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
