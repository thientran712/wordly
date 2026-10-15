import CoreGraphics
import Foundation

/// Ảnh của theme ảnh: ảnh lớn ≤ 1400 px + ảnh nhỏ 360 px kèm app. Lưới chọn
/// theme chỉ đọc ảnh nhỏ (có cache); chọn theme mới cắt ảnh lớn thành đúng 2 cỡ
/// widget và ghi vào App Group — widget không bao giờ đọc ảnh gốc.
enum WidgetThemePhoto {
    private final class BundleToken {}
    private static let cache = NSCache<NSString, CGImage>()

    static func url(_ theme: WidgetTheme, thumbnail: Bool) -> URL? {
        guard let photo = theme.photo else { return nil }
        return Bundle(for: BundleToken.self).url(forResource: thumbnail ? "\(photo)-thumb" : photo, withExtension: "jpg")
    }

    /// Ảnh nhỏ cho ô theme — đọc một lần rồi giữ trong bộ nhớ (tự nhả khi máy thiếu RAM).
    static func thumbnail(_ theme: WidgetTheme) -> CGImage? {
        if let hit = cache.object(forKey: theme.id as NSString) { return hit }
        guard let url = url(theme, thumbnail: true),
              let img = WidgetImageIO.downsample(url: url, maxPixel: 400) else { return nil }
        cache.setObject(img, forKey: theme.id as NSString)
        return img
    }

    /// Kiểu widget sau khi chọn `theme`. Theme ảnh → cắt + ghi file theme (một lần),
    /// dọn file theme cũ. Ảnh người dùng (`backgroundVersion`) giữ nguyên và vẫn đè lên.
    static func apply(_ theme: WidgetTheme, to old: WidgetSettings.HomeStyle,
                      store: WidgetBackgroundStore) throws -> WidgetSettings.HomeStyle {
        var style = old
        style.apply(theme)
        guard theme.photo != nil else {
            store.removeThemePhotos(except: nil)
            return style
        }
        if !store.hasThemePhoto(id: theme.id) {
            guard let url = url(theme, thumbnail: false),
                  let src = WidgetImageIO.downsample(url: url, maxPixel: 2048) else { throw CocoaError(.fileNoSuchFile) }
            let size = CGSize(width: src.width, height: src.height)
            var files: [WidgetBackgroundKind: Data] = [:]
            for kind in WidgetBackgroundKind.allCases {
                let crop = CropFrame.rect(imageSize: size, aspect: kind.aspect, frame: CropFrame())
                guard let data = WidgetImageIO.renderJPEG(src, crop: crop, kind: kind) else { throw CocoaError(.fileWriteUnknown) }
                files[kind] = data
            }
            try store.saveThemePhoto(files, id: theme.id)
        }
        store.removeThemePhotos(except: theme.id)
        return style
    }
}
