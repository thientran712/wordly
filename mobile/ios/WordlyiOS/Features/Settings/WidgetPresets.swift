import CoreGraphics
import Foundation

/// Mẫu widget màn hình chính: theme màu + kiểu chữ phối sẵn, có mẫu kèm ảnh nền
/// vẽ sẵn trong app (Resources/WidgetPresets, bản vẽ gốc ở docs/design/).
/// Chọn mẫu = thay trọn kiểu widget màn hình chính (màu, chữ, ảnh nền); không
/// đụng căn lề vì căn lề dùng chung với widget màn hình khoá.
struct WidgetPreset: Identifiable, Equatable {
    struct Background: Equatable {
        /// Tên file .jpg trong bundle app
        let resource: String
        let dim: Double
    }

    let id: String
    let name: String
    let tagline: String
    let theme: WidgetTheme
    var wordWeight: WidgetSettings.TextWeight = .bold
    var meaningWeight: WidgetSettings.TextWeight = .regular
    var wordItalic = false
    var meaningItalic = false
    var background: Background?

    /// Kiểu widget của mẫu — chưa có ảnh nền (ảnh do WidgetPresetBackground ghi ra file).
    var style: WidgetSettings.HomeStyle {
        var s = WidgetSettings.HomeStyle()
        s.apply(theme)
        s.wordWeight = wordWeight
        s.meaningWeight = meaningWeight
        s.wordItalic = wordItalic
        s.meaningItalic = meaningItalic
        if let background { s.backgroundDim = background.dim }
        return s
    }

    /// Widget đang dùng đúng mẫu này (để đánh dấu ô đang chọn).
    func matches(_ s: WidgetSettings.HomeStyle) -> Bool {
        guard s.matches(theme), s.wordWeight == wordWeight, s.meaningWeight == meaningWeight,
              s.wordItalic == wordItalic, s.meaningItalic == meaningItalic else { return false }
        guard let background else { return !s.hasBackgroundImage }
        return s.hasBackgroundImage && abs(s.backgroundDim - background.dim) < 0.001
    }

    private static func theme(_ id: String) -> WidgetTheme {
        WidgetTheme.all.first { $0.id == id } ?? WidgetTheme.all[0]
    }

    static let all: [WidgetPreset] = [
        WidgetPreset(id: "night-desk", name: "Góc học đêm", tagline: "Màn hình sáng, đèn vàng, cà phê nóng",
                     theme: theme("espresso"), background: Background(resource: "widget-preset-night-desk", dim: 0.45)),
        WidgetPreset(id: "coffee", name: "Cà phê sáng", tagline: "Nâu ấm như ly phin đầu ngày",
                     theme: theme("espresso"), meaningItalic: true),
        WidgetPreset(id: "tokyo", name: "Phố đêm", tagline: "Neon xanh tím, thức khuya học bài",
                     theme: theme("tokyo")),
        WidgetPreset(id: "hacker", name: "Code đêm khuya", tagline: "Tối, tím, đúng chất dân code",
                     theme: theme("dracula"), meaningItalic: true),
        WidgetPreset(id: "sticky", name: "Giấy note vàng", tagline: "Như tờ note dán trên màn hình",
                     theme: theme("lemon"), meaningItalic: true),
        WidgetPreset(id: "sunset", name: "Hoàng hôn biển", tagline: "Cam hồng rực, chữ nghiêng bay bổng",
                     theme: theme("sunset"), wordItalic: true),
        WidgetPreset(id: "mint", name: "Bạc hà mát lạnh", tagline: "Xanh nhạt, nhìn là tỉnh ngủ",
                     theme: theme("mint")),
        WidgetPreset(id: "minimal", name: "Tối giản", tagline: "Đen tuyền, chữ mảnh, không gì thừa",
                     theme: theme("ink"), wordWeight: .light, meaningWeight: .light),
        WidgetPreset(id: "forest", name: "Rừng sau mưa", tagline: "Xanh lá đậm, dịu mắt",
                     theme: theme("forest")),
        WidgetPreset(id: "dreamy", name: "Mộng mơ", tagline: "Tím oải hương, chữ nghiêng nhẹ",
                     theme: theme("lavender"), wordItalic: true, meaningItalic: true),
        WidgetPreset(id: "candy", name: "Kẹo bông", tagline: "Hồng ngọt, học từ cũng ngọt",
                     theme: theme("candy")),
        WidgetPreset(id: "deepsea", name: "Biển sâu", tagline: "Xanh đại dương, từ hiện như sóng",
                     theme: theme("ocean")),
    ]
}

/// Đặt ảnh nền của mẫu: đi đúng đường ảnh người dùng chọn (thu nhỏ → cắt giữa
/// cho từng cỡ → lưu phiên bản mới), nên vẫn "Chỉnh lại khung" được sau đó.
enum WidgetPresetBackground {
    private final class BundleToken {}

    /// Ảnh của mẫu đã thu nhỏ ≤ 2048 px — nil nếu thiếu file trong app.
    static func source(_ background: WidgetPreset.Background, maxPixel: Int = WidgetBackgroundStore.sourceMaxPixel) -> CGImage? {
        guard let url = Bundle(for: BundleToken.self).url(forResource: background.resource, withExtension: "jpg") else { return nil }
        return WidgetImageIO.downsample(url: url, maxPixel: maxPixel)
    }

    /// Kiểu widget mới cho mẫu. Mẫu có ảnh → ghi ảnh thành phiên bản sau `old`;
    /// người gọi gán kiểu mới rồi mới `removeAll(except:)` để dọn bản cũ.
    static func apply(_ preset: WidgetPreset, to old: WidgetSettings.HomeStyle,
                      store: WidgetBackgroundStore) throws -> WidgetSettings.HomeStyle {
        var style = preset.style
        guard let background = preset.background else { return style }
        guard let src = source(background) else { throw CocoaError(.fileNoSuchFile) }
        let size = CGSize(width: src.width, height: src.height)
        var files: [WidgetBackgroundKind: Data] = [:]
        for kind in WidgetBackgroundKind.allCases {
            let crop = CropFrame.rect(imageSize: size, aspect: kind.aspect, frame: CropFrame())
            guard let data = WidgetImageIO.renderJPEG(src, crop: crop, kind: kind) else { throw CocoaError(.fileWriteUnknown) }
            files[kind] = data
        }
        style.backgroundVersion = try store.save(files, source: src, previous: old.backgroundVersion)
        return style
    }
}
