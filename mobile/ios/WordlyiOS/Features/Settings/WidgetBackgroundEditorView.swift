import SwiftUI

/// Chọn phần ảnh hiện trên widget nhỏ (vuông) và vừa (ngang): kéo để di chuyển,
/// chụm để phóng to — luôn phủ kín khung. Lưu = xuất 2 file đúng cỡ pixel
/// (WidgetImageIO.renderJPEG) rồi mới trỏ cài đặt sang bản mới.
struct WidgetBackgroundEditorView: View {
    /// Ảnh đã thu nhỏ ≤ 2048 px (không bao giờ là ảnh gốc)
    let source: CGImage
    @ObservedObject var vm: WidgetSettingsViewModel
    let onDone: () -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var kind: WidgetBackgroundKind = .small
    @State private var frames: [WidgetBackgroundKind: CropFrame] = [.small: CropFrame(), .medium: CropFrame()]
    @State private var gestureStart: CropFrame?
    @State private var previewWidth: CGFloat = 220
    @State private var dim: Double = 0.3
    @State private var isSaving = false
    @State private var saveError: String?

    private var imageSize: CGSize { CGSize(width: source.width, height: source.height) }

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Picker("Cỡ widget", selection: $kind) {
                    Text("Nhỏ").tag(WidgetBackgroundKind.small)
                    Text("Vừa").tag(WidgetBackgroundKind.medium)
                }
                .pickerStyle(.segmented)

                preview
                    .gesture(dragGesture.simultaneously(with: zoomGesture))

                VStack(alignment: .leading, spacing: 6) {
                    Text("Làm tối").font(WordlyFonts.body(13, weight: .semibold))
                    Slider(value: $dim, in: 0...WidgetSettings.HomeStyle.maxDim).tint(WordlyColors.electric)
                }
                Text("Kéo để di chuyển, chụm hai ngón để phóng to. Mỗi cỡ widget chỉnh riêng.")
                    .font(WordlyFonts.body(12))
                    .foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let saveError {
                    Text(saveError).font(WordlyFonts.body(13, weight: .medium)).foregroundStyle(WordlyColors.error)
                }
                Spacer()
            }
            .padding(20)
            .screenBackground()
            .navigationTitle("Ảnh nền widget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Huỷ", action: onDone) }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Lưu") { save() }.bold().disabled(isSaving)
                }
            }
            .onAppear {
                if vm.settings.homeStyle.hasBackgroundImage { dim = vm.settings.homeStyle.backgroundDim }
            }
        }
    }

    /// Xem trước đúng phần sẽ cắt, có chữ mẫu đè lên giống widget thật.
    private var preview: some View {
        let crop = CropFrame.rect(imageSize: imageSize, aspect: kind.aspect, frame: frames[kind] ?? CropFrame())
        let style = vm.settings.homeStyle
        let align = vm.settings.textAlign
        return GeometryReader { geo in
            ZStack {
                if let cropped = source.cropping(to: crop.integral) {
                    Image(decorative: cropped, scale: 1).resizable().scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height).clipped()
                }
                Color.black.opacity(dim)
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
            }
            .onAppear { previewWidth = geo.size.width }
            .onChange(of: geo.size.width) { _, w in previewWidth = w }
        }
        .aspectRatio(kind.aspect, contentMode: .fit)
        .frame(maxWidth: kind == .small ? 220 : .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .contentShape(Rectangle())
        .accessibilityIdentifier("widgetBackgroundPreview")
    }

    private var dragGesture: some Gesture {
        DragGesture().onChanged { g in
            let start = beginGesture()
            let crop = CropFrame.rect(imageSize: imageSize, aspect: kind.aspect, frame: start)
            // Kéo ảnh sang phải = khung lùi sang trái
            let imagePerPoint = crop.width / max(previewWidth, 1)
            var f = start
            f.center.x -= g.translation.width * imagePerPoint / imageSize.width
            f.center.y -= g.translation.height * imagePerPoint / imageSize.height
            frames[kind] = f.clamped(imageSize: imageSize, aspect: kind.aspect)
        }
        .onEnded { _ in gestureStart = nil }
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture().onChanged { g in
            var f = beginGesture()
            f.zoom *= g.magnification
            frames[kind] = f.clamped(imageSize: imageSize, aspect: kind.aspect)
        }
        .onEnded { _ in gestureStart = nil }
    }

    private func beginGesture() -> CropFrame {
        if let gestureStart { return gestureStart }
        let start = frames[kind] ?? CropFrame()
        gestureStart = start
        return start
    }

    private func save() {
        isSaving = true
        saveError = nil
        let store = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup)
        var files: [WidgetBackgroundKind: Data] = [:]
        for k in WidgetBackgroundKind.allCases {
            let crop = CropFrame.rect(imageSize: imageSize, aspect: k.aspect, frame: frames[k] ?? CropFrame())
            guard let data = WidgetImageIO.renderJPEG(source, crop: crop, kind: k) else {
                saveError = "Không lưu được ảnh, thử lại."
                isSaving = false
                return
            }
            files[k] = data
        }
        do {
            let v = try store.save(files, previous: vm.settings.homeStyle.backgroundVersion)
            // Đổi cài đặt (didSet lưu App Group + reload widget) rồi mới dọn bản cũ
            var style = vm.settings.homeStyle
            style.backgroundVersion = v
            style.backgroundDim = dim
            vm.settings.homeStyle = style
            store.removeAll(except: v)
            onDone()
        } catch {
            saveError = "Không lưu được ảnh, thử lại."
            isSaving = false
        }
    }
}
