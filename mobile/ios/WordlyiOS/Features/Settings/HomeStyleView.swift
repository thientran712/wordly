import SwiftUI
import PhotosUI

/// Tuỳ biến đầy đủ widget MÀN HÌNH CHÍNH (home screen hỗ trợ nền tuỳ ý, khác
/// màn hình khoá bị OS giới hạn chỉ đơn sắc) — màu nền/gradient hoặc ảnh từ
/// thư viện, màu chữ, đậm/nghiêng/nhạt riêng cho từ và nghĩa.
struct HomeStyleView: View {
    @ObservedObject var vm: WidgetSettingsViewModel
    @State private var photoItem: PhotosPickerItem?
    @State private var bgImage: UIImage?
    @State private var isProcessingImage = false

    var body: some View {
        Form {
            Section { preview }
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())

            Section {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(bgImage == nil ? "Chọn ảnh từ thư viện" : "Đổi ảnh khác", systemImage: "photo")
                }
                if isProcessingImage {
                    HStack { ProgressView(); Text("Đang xử lý ảnh…") }
                }
                if bgImage != nil {
                    Picker("Lớp phủ", selection: $vm.settings.homeStyle.imageOverlay) {
                        Text("Không").tag(WidgetSettings.ImageOverlay.none)
                        Text("Tối").tag(WidgetSettings.ImageOverlay.dark)
                        Text("Sáng").tag(WidgetSettings.ImageOverlay.light)
                    }
                    Button("Xoá ảnh nền", role: .destructive) {
                        bgImage = nil
                        AppGroupStorage.shared.deleteHomeBackgroundImage()
                    }
                }
            } header: {
                Text("Ảnh nền")
            } footer: {
                Text("Lớp phủ làm mờ ảnh đi để chữ luôn đọc được, không bị ảnh lấn.")
            }

            Section("Màu nền") {
                ColorPicker("Màu 1", selection: colorBinding(\.bgHex1))
                ColorPicker("Màu 2 (gradient)", selection: colorBinding(\.bgHex2))
            }
            .disabled(bgImage != nil)
            .opacity(bgImage != nil ? 0.4 : 1)

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
        .task {
            if let data = AppGroupStorage.shared.homeBackgroundImageData() {
                bgImage = UIImage(data: data)
            }
        }
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                isProcessingImage = true
                defer { isProcessingImage = false }
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data),
                      let processed = WidgetImageStore.prepare(image) else { return }
                AppGroupStorage.shared.saveHomeBackgroundImageData(processed)
                bgImage = UIImage(data: processed)
            }
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("XEM TRƯỚC").font(WordlyFonts.body(11, weight: .bold)).foregroundStyle(WordlyColors.inkSoft)
                .padding(.leading, 12)
            ZStack(alignment: .bottomLeading) {
                if let bgImage {
                    Image(uiImage: bgImage).resizable().scaledToFill()
                    overlayColor.opacity(overlayOpacity)
                } else {
                    LinearGradient(colors: [Color(hex: vm.settings.homeStyle.bgHex1), Color(hex: vm.settings.homeStyle.bgHex2)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("resilient")
                        .font(.system(size: 18, weight: vm.settings.homeStyle.wordWeight.swiftUIWeight))
                        .italic(vm.settings.homeStyle.wordItalic)
                        .foregroundStyle(Color(hex: vm.settings.homeStyle.wordColorHex))
                    Text("kiên cường")
                        .font(.system(size: 13, weight: vm.settings.homeStyle.meaningWeight.swiftUIWeight))
                        .italic(vm.settings.homeStyle.meaningItalic)
                        .foregroundStyle(Color(hex: vm.settings.homeStyle.meaningColorHex))
                }
                .padding(14)
            }
            .frame(height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 4)
    }

    private var overlayColor: Color {
        vm.settings.homeStyle.imageOverlay == .light ? .white : .black
    }
    private var overlayOpacity: Double {
        switch vm.settings.homeStyle.imageOverlay {
        case .none: return 0
        case .dark: return 0.45
        case .light: return 0.35
        }
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

/// Resize ảnh thư viện về cỡ vừa đủ cho widget (vài trăm px là đủ, widget
/// không cần ảnh gốc) + nén JPEG — giảm dung lượng lưu ở App Group container.
enum WidgetImageStore {
    static func prepare(_ image: UIImage, maxDimension: CGFloat = 500, quality: CGFloat = 0.7) -> Data? {
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        let resized = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
        return resized.jpegData(compressionQuality: quality)
    }
}
