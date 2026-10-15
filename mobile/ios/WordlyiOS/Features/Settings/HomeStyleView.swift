import SwiftUI
import PhotosUI

/// Tuỳ biến widget MÀN HÌNH CHÍNH (home screen hỗ trợ nền tuỳ ý, khác màn
/// hình khoá bị OS giới hạn chỉ đơn sắc) — theme phối sẵn, ảnh nền hoặc màu
/// nền (một màu / gradient), màu chữ, đậm/nghiêng/nhạt riêng cho từ và nghĩa.
/// Chọn màu bằng bảng ô vuông (WidgetTheme.swatches), không dùng ColorPicker.
struct HomeStyleView: View {
    @ObservedObject var vm: WidgetSettingsViewModel

    var body: some View {
        Form {
            HomeStylePreviewSection(vm: vm)
            HomeStyleSections(vm: vm)
        }
            .scrollContentBackground(.hidden)
            .screenBackground()
            .navigationTitle("Màn hình chính")
            .navigationBarTitleDisplayMode(.inline)
    }
}

/// Các khối riêng của widget màn hình chính — dùng trong trang Widget gộp
/// (spec 2026-10-15 §5.5) và màn xem trước Debug. Thứ tự: xem trước → Theme →
/// Ảnh của bạn → ▸ Tuỳ chỉnh thêm (màu nền, chữ — thu gọn để trang không dài).
struct HomeStyleSections: View {
    @ObservedObject var vm: WidgetSettingsViewModel
    @State private var photoItem: PhotosPickerItem?
    /// Ảnh vừa chọn, đã thu nhỏ ≤ 2048 px → mở màn chỉnh khung
    @State private var editorSource: CGImage?
    @State private var loadError: String?
    /// Nhóm theme đang mở trong dropdown (nil = nhóm của theme đang dùng)
    @State private var themeGroup: WidgetTheme.Group?
    @State private var moreOpen = false

    var body: some View {
        Section {
            Picker("Nhóm", selection: Binding(
                get: { themeGroup ?? WidgetTheme.group(containing: vm.settings.homeStyle) },
                set: { themeGroup = $0 }
            )) {
                ForEach(WidgetTheme.Group.allCases) { g in
                    Text("\(g.title) (\(WidgetTheme.themes(in: g).count))").tag(g)
                }
            }
            .pickerStyle(.menu)
            themeGrid
        } header: {
            HubHeader("Theme", systemImage: "paintpalette")
        } footer: {
            Text("Theme màu hoặc theme ảnh có sẵn, chữ đều dễ đọc.")
        }

        Section {
            PhotosPicker(selection: $photoItem, matching: .images) {
                Label(vm.settings.homeStyle.hasBackgroundImage ? "Đổi ảnh khác" : "Chọn ảnh của bạn",
                      systemImage: "photo")
            }
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
            .fullScreenCover(isPresented: Binding(get: { editorSource != nil },
                                                  set: { if !$0 { editorSource = nil } })) {
                if let editorSource {
                    WidgetBackgroundEditorView(source: editorSource, vm: vm) { self.editorSource = nil }
                }
            }
            if vm.settings.homeStyle.hasBackgroundImage {
                Button {
                    let v = vm.settings.homeStyle.backgroundVersion
                    if let src = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).loadSource(version: v) {
                        loadError = nil
                        editorSource = src
                    } else {
                        // Ảnh đặt từ build 15 chưa lưu bản gốc → phải chọn lại
                        loadError = "Ảnh này đặt từ bản cũ, chọn lại ảnh để chỉnh khung."
                    }
                } label: {
                    Label("Chỉnh lại khung", systemImage: "crop")
                }
            }
            if vm.settings.homeStyle.hasAnyBackground {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Làm tối")
                    Slider(value: $vm.settings.homeStyle.backgroundDim,
                           in: 0...WidgetSettings.HomeStyle.maxDim).tint(WordlyColors.electric)
                }
            }
            if vm.settings.homeStyle.hasBackgroundImage {
                Button("Xoá ảnh của bạn", role: .destructive) {
                    vm.settings.homeStyle.backgroundVersion = 0
                    WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).removeAll(except: 0)
                }
                if vm.settings.homeStyle.themePhotoId != nil {
                    Text("Ảnh của bạn đang đè lên ảnh theme. Xoá ảnh của bạn thì widget dùng lại ảnh theme.")
                        .font(WordlyFonts.body(12))
                        .foregroundStyle(WordlyColors.inkSoft)
                }
            }
            if let loadError {
                Text(loadError).foregroundStyle(WordlyColors.error)
            }
        } header: {
            HubHeader("Ảnh của bạn", systemImage: "photo.on.rectangle")
        } footer: {
            Text("Ảnh bạn tự chọn sẽ đè lên ảnh của theme.")
        }

        Section {
            DisclosureGroup(isExpanded: $moreOpen) {
                Text("Màu nền").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                Toggle("Chuyển màu (gradient)", isOn: boolBinding(\.useGradient)).tint(WordlyColors.electric)
                swatchRow(vm.settings.homeStyle.useGradient ? "Màu 1" : "Màu nền", \.bgHex1)
                if vm.settings.homeStyle.useGradient {
                    swatchRow("Màu 2", \.bgHex2)
                }
                Text("Chữ — Từ vựng").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                swatchRow("Màu chữ", \.wordColorHex)
                weightPicker(\.wordWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.wordItalic)).tint(WordlyColors.electric)
                Text("Chữ — Ý nghĩa").font(WordlyFonts.body(13, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                swatchRow("Màu chữ", \.meaningColorHex)
                weightPicker(\.meaningWeight)
                Toggle("Chữ nghiêng", isOn: boolBinding(\.meaningItalic)).tint(WordlyColors.electric)
            } label: {
                Label("Tuỳ chỉnh thêm", systemImage: "slider.horizontal.3")
            }
            .accessibilityIdentifier("homeMoreToggle")
        } footer: {
            Text("Màu nền, màu và kiểu chữ — chọn theme ở trên là đủ, chỉnh ở đây nếu muốn khác.")
        }
    }

    /// Chọn theme (didSet lưu App Group + reload widget). Theme ảnh ghi file ảnh đã cắt sẵn.
    private func applyTheme(_ theme: WidgetTheme) {
        do {
            vm.settings.homeStyle = try WidgetThemePhoto.apply(theme, to: vm.settings.homeStyle,
                                                               store: WidgetBackgroundStore.appGroup(WordlyConfig.appGroup))
            loadError = nil
        } catch {
            loadError = "Không đặt được theme này, thử lại."
        }
    }

    /// Lưới theme: mỗi ô là widget thu nhỏ — theme màu vẽ màu, theme ảnh hiện ảnh nhỏ (360 px, có cache).
    private var themeGrid: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 10)], spacing: 10) {
            ForEach(WidgetTheme.themes(in: themeGroup ?? WidgetTheme.group(containing: vm.settings.homeStyle))) { theme in
                let selected = vm.settings.homeStyle.matches(theme)
                Button {
                    applyTheme(theme)
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Aa").font(.system(size: 18, weight: .bold)).foregroundStyle(Color(hex: theme.word))
                        Text(theme.name).font(.system(size: 11, weight: .medium)).lineLimit(1)
                            .foregroundStyle(Color(hex: theme.meaning))
                    }
                    .frame(maxWidth: .infinity, minHeight: 58, alignment: .leading)
                    .padding(.horizontal, 10)
                    .background { ThemeTileBackground(theme: theme) }
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12)
                        .stroke(selected ? WordlyColors.electric : Color.primary.opacity(0.12), lineWidth: selected ? 3 : 1))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(theme.name)
                .accessibilityIdentifier("theme.\(theme.id)")
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

/// Nền một ô theme: màu (gradient) hoặc ảnh nhỏ đã làm tối như trên widget.
private struct ThemeTileBackground: View {
    let theme: WidgetTheme
    @State private var image: CGImage?

    var body: some View {
        if theme.photo != nil {
            ZStack {
                Color(hex: theme.bg1)
                if let image {
                    Image(decorative: image, scale: 1).resizable().scaledToFill()
                    Color.black.opacity(theme.dim)
                }
            }
            .task(id: theme.id) { image = WidgetThemePhoto.thumbnail(theme) }
        } else {
            LinearGradient(colors: [Color(hex: theme.bg1), Color(hex: theme.bg2 ?? theme.bg1)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}


/// Xem trước widget màn hình chính, chọn cỡ Nhỏ/Vừa — tách khỏi HomeStyleSections để
/// trang Widget giữ cùng thứ tự ở cả 2 tab: xem trước → hướng dẫn → cài đặt.
struct HomeStylePreviewSection: View {
    @ObservedObject var vm: WidgetSettingsViewModel
    @State private var previewSize: WidgetBackgroundKind = .medium
    /// Ảnh nền cho phần xem trước — đọc lại chỉ khi đổi ảnh / cỡ
    @State private var savedBackground: CGImage?

    var body: some View {
        Section {
            preview
            Picker("Cỡ", selection: $previewSize) {
                Text("Nhỏ").tag(WidgetBackgroundKind.small)
                Text("Vừa").tag(WidgetBackgroundKind.medium)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 4)
        } header: {
            HubHeader("Xem trước", systemImage: "eye")
        }
        .listRowBackground(Color.clear)
        .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 8, trailing: 0))
    }

    private var preview: some View {
        let style = vm.settings.homeStyle
        let align = vm.settings.textAlign
        return VStack(alignment: .leading, spacing: 8) {
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
            .frame(height: 150)
            .frame(maxWidth: previewSize == .small ? 150 : .infinity)
            .background {
                if style.hasAnyBackground, let img = savedBackground {
                    Image(decorative: img, scale: 1).resizable().scaledToFill()
                        .overlay(Color.black.opacity(style.backgroundDim))
                } else {
                    LinearGradient(colors: style.backgroundHexes.map { Color(hex: $0) },
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 22))
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
        // Xem trước đúng như widget: ảnh người dùng → ảnh theme → nền màu
        .task(id: "\(vm.settings.homeStyle.backgroundVersion)-\(vm.settings.homeStyle.themePhotoId ?? "")-\(previewSize.rawValue)") {
            savedBackground = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup)
                .resolvedBackground(previewSize, style: vm.settings.homeStyle)
        }
    }

}

/// Tiêu đề nhóm trong trang Widget — có biểu tượng, chữ đậm hơn tiêu đề mặc định
/// để các khối tách bạch, không thành một trang dài liền.
struct HubHeader: View {
    let title: String
    let systemImage: String
    var tint: Color = WordlyColors.inkSoft

    init(_ title: String, systemImage: String, tint: Color = WordlyColors.inkSoft) {
        (self.title, self.systemImage, self.tint) = (title, systemImage, tint)
    }

    var body: some View {
        Label(title, systemImage: systemImage)
            .font(WordlyFonts.body(13, weight: .bold))
            .foregroundStyle(tint)
            .textCase(nil)
    }
}
