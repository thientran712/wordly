import CoreGraphics
import Foundation
import ImageIO
import UIKit

// Ảnh nền widget màn hình chính — dùng chung app + widget extension.
// Xem docs/superpowers/specs/2026-10-12-widget-background-image-design.md.
//
// Bản cũ (a3e15a7) bị gỡ vì crash: widget đọc ảnh trong body (tới 200 entry
// × một bitmap), ảnh lưu ở 3x (1500 px), app giải mã ảnh gốc 48 MP (~190 MB).
// Ở đây: không bao giờ giải mã ảnh gốc, lưu đúng cỡ pixel ở scale 1, mọi lỗi
// trả nil để widget rơi về nền màu.

/// Hai cỡ widget màn hình chính có ảnh nền. Cỡ pixel = widget lớn nhất của
/// iPhone (Pro Max, 3x): nhỏ 170pt, vừa 364×170pt.
enum WidgetBackgroundKind: String, CaseIterable {
    case small, medium

    var pixelSize: CGSize {
        switch self {
        case .small: CGSize(width: 510, height: 510)
        case .medium: CGSize(width: 1092, height: 510)
        }
    }
    var aspect: CGFloat { pixelSize.width / pixelSize.height }
}

/// Vị trí + độ phóng người dùng chọn trên màn chỉnh khung.
struct CropFrame: Equatable, Codable {
    static let maxZoom: CGFloat = 8
    var zoom: CGFloat = 1
    /// Tâm khung theo ảnh, chuẩn hoá 0…1
    var center = CGPoint(x: 0.5, y: 0.5)

    /// Khung lớn nhất đúng tỉ lệ nằm trọn trong ảnh ở zoom 1.
    private static func baseSize(_ image: CGSize, _ aspect: CGFloat) -> CGSize {
        let w = max(image.width, 1), h = max(image.height, 1)
        return w / h > aspect ? CGSize(width: h * aspect, height: h) : CGSize(width: w, height: w / aspect)
    }

    /// Kẹp zoom 1…maxZoom và tâm sao cho khung luôn nằm trọn trong ảnh.
    func clamped(imageSize: CGSize, aspect: CGFloat) -> CropFrame {
        let z = min(max(zoom, 1), Self.maxZoom)
        let base = Self.baseSize(imageSize, aspect)
        let w = max(imageSize.width, 1), h = max(imageSize.height, 1)
        let halfX = base.width / z / 2 / w, halfY = base.height / z / 2 / h
        let cx = min(max(center.x, halfX), 1 - halfX)
        let cy = min(max(center.y, halfY), 1 - halfY)
        return CropFrame(zoom: z, center: CGPoint(x: cx.isFinite ? cx : 0.5, y: cy.isFinite ? cy : 0.5))
    }

    /// Hình chữ nhật cắt (pixel của ảnh), đúng tỉ lệ `aspect`.
    static func rect(imageSize: CGSize, aspect: CGFloat, frame: CropFrame) -> CGRect {
        let f = frame.clamped(imageSize: imageSize, aspect: aspect)
        let base = baseSize(imageSize, aspect)
        let size = CGSize(width: base.width / f.zoom, height: base.height / f.zoom)
        return CGRect(x: f.center.x * max(imageSize.width, 1) - size.width / 2,
                      y: f.center.y * max(imageSize.height, 1) - size.height / 2,
                      width: size.width, height: size.height)
    }
}

/// Giải mã / xuất ảnh nền mà không bao giờ giải mã ảnh gốc.
enum WidgetImageIO {
    static func downsample(data: Data, maxPixel: Int) -> CGImage? {
        guard let src = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        return thumbnail(src, maxPixel)
    }

    static func downsample(url: URL, maxPixel: Int) -> CGImage? {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else { return nil }
        return thumbnail(src, maxPixel)
    }

    private static func thumbnail(_ src: CGImageSource, _ maxPixel: Int) -> CGImage? {
        guard CGImageSourceGetCount(src) > 0 else { return nil }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,   // xoay theo EXIF
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
    }

    /// Cắt `crop` (pixel của `image`) rồi vẽ đúng `kind.pixelSize` ở scale 1.
    static func renderJPEG(_ image: CGImage, crop: CGRect, kind: WidgetBackgroundKind) -> Data? {
        guard let cropped = image.cropping(to: crop.integral) else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1          // mặc định theo màn hình (3x) — lỗi của bản cũ
        format.opaque = true
        let size = kind.pixelSize
        let out = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            UIColor.white.setFill()   // PNG trong suốt không thành nền đen
            ctx.fill(CGRect(origin: .zero, size: size))
            UIImage(cgImage: cropped).draw(in: CGRect(origin: .zero, size: size))
        }
        return out.jpegData(compressionQuality: 0.8)
    }
}

/// File ảnh nền trong App Group. Tên có phiên bản: app ghi bản mới xong mới
/// đổi cài đặt sang nó, nên widget không bao giờ đọc phải file đang ghi dở.
struct WidgetBackgroundStore {
    static let maxFileBytes = 1_000_000
    /// Bản gốc đã thu nhỏ ≤ 2048 px (chỉ app đọc, để chỉnh lại khung)
    static let maxSourceBytes = 5_000_000
    static let sourceMaxPixel = 2048
    let directory: URL?

    init(directory: URL?) { self.directory = directory }

    static func appGroup(_ id: String) -> WidgetBackgroundStore {
        WidgetBackgroundStore(directory: FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id))
    }

    private func url(_ kind: WidgetBackgroundKind, _ version: Int) -> URL? {
        directory?.appendingPathComponent("widget-bg-\(kind.rawValue)-\(version).jpg")
    }

    private func sourceURL(_ version: Int) -> URL? {
        directory?.appendingPathComponent("widget-bg-source-\(version).jpg")
    }

    /// Ghi phiên bản `previous + 1` (kèm bản gốc thu nhỏ nếu có, để chỉnh lại
    /// khung sau này). Không xoá bản cũ — gọi `removeAll(except:)` sau khi cài
    /// đặt đã trỏ sang bản mới.
    func save(_ files: [WidgetBackgroundKind: Data], source: CGImage? = nil, previous: Int) throws -> Int {
        let version = previous + 1
        for (kind, data) in files {
            guard let url = url(kind, version) else { throw CocoaError(.fileNoSuchFile) }
            try data.write(to: url, options: .atomic)
        }
        if let source, let url = sourceURL(version),
           let data = UIImage(cgImage: source).jpegData(compressionQuality: 0.85) {
            try data.write(to: url, options: .atomic)
        }
        return version
    }

    /// Bản gốc thu nhỏ của phiên bản `version` — nil nếu không có / lỗi.
    func loadSource(version: Int) -> CGImage? {
        guard version > 0, let url = sourceURL(version),
              let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int,
              size <= Self.maxSourceBytes else { return nil }
        return WidgetImageIO.downsample(url: url, maxPixel: Self.sourceMaxPixel)
    }

    /// `version = 0` xoá hết.
    func removeAll(except version: Int) {
        guard let directory, let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return }
        let keep = Set(WidgetBackgroundKind.allCases.compactMap { url($0, version)?.lastPathComponent }
                       + [sourceURL(version)?.lastPathComponent].compactMap { $0 })
        for name in names where name.hasPrefix("widget-bg-") && !(version > 0 && keep.contains(name)) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    /// nil khi không có ảnh, thiếu file, file quá cỡ hoặc giải mã lỗi.
    func load(_ kind: WidgetBackgroundKind, version: Int) -> CGImage? {
        guard version > 0, let url = url(kind, version),
              let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int,
              size <= Self.maxFileBytes else { return nil }
        return WidgetImageIO.downsample(url: url, maxPixel: Int(max(kind.pixelSize.width, kind.pixelSize.height)))
    }
}

// MARK: - Ảnh theme
// File riêng `widget-theme-<cỡ>-<id>.jpg` — không trùng tiền tố `widget-bg-` của
// ảnh người dùng, nên xoá ảnh người dùng không đụng ảnh theme (và ngược lại).
extension WidgetBackgroundStore {
    private func themeURL(_ kind: WidgetBackgroundKind, _ id: String) -> URL? {
        directory?.appendingPathComponent("widget-theme-\(kind.rawValue)-\(id).jpg")
    }

    func saveThemePhoto(_ files: [WidgetBackgroundKind: Data], id: String) throws {
        for (kind, data) in files {
            guard let url = themeURL(kind, id) else { throw CocoaError(.fileNoSuchFile) }
            try data.write(to: url, options: .atomic)
        }
    }

    func hasThemePhoto(id: String) -> Bool {
        WidgetBackgroundKind.allCases.allSatisfy { kind in
            themeURL(kind, id).map { FileManager.default.fileExists(atPath: $0.path) } ?? false
        }
    }

    func loadThemePhoto(_ kind: WidgetBackgroundKind, id: String) -> CGImage? {
        guard let url = themeURL(kind, id),
              let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int,
              size <= Self.maxFileBytes else { return nil }
        return WidgetImageIO.downsample(url: url, maxPixel: Int(max(kind.pixelSize.width, kind.pixelSize.height)))
    }

    /// Xoá file theme khác `id` (nil = xoá hết).
    func removeThemePhotos(except id: String?) {
        guard let directory, let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return }
        let keep = Set(WidgetBackgroundKind.allCases.compactMap { kind in id.flatMap { themeURL(kind, $0)?.lastPathComponent } })
        for name in names where name.hasPrefix("widget-theme-") && !keep.contains(name) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    /// Nền widget: ảnh người dùng → ảnh theme → nil (nền màu). Lỗi gì cũng rơi xuống bậc sau.
    func resolvedBackground(_ kind: WidgetBackgroundKind, style: WidgetSettings.HomeStyle) -> CGImage? {
        if style.hasBackgroundImage, let user = load(kind, version: style.backgroundVersion) { return user }
        if let id = style.themePhotoId { return loadThemePhoto(kind, id: id) }
        return nil
    }
}
