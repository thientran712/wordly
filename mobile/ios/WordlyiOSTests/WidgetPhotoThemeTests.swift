import XCTest
@testable import Wordly

// Theme ảnh (ảnh Unsplash kèm app, nguồn ở docs/design/widget-photo-credits.md):
// là THEME, tách khỏi ảnh nền người dùng chọn — ảnh người dùng đè ảnh theme, xoá
// ảnh người dùng thì widget quay về ảnh theme. Widget chỉ đọc file đã cắt sẵn.
final class WidgetPhotoThemeTests: XCTestCase {
    private var dir: URL!
    private var store: WidgetBackgroundStore!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        store = WidgetBackgroundStore(directory: dir)
    }

    override func tearDownWithError() throws { try? FileManager.default.removeItem(at: dir) }

    private var photoThemes: [WidgetTheme] { WidgetTheme.all.filter { $0.photo != nil } }

    func testCatalog() {
        XCTAssertEqual(WidgetTheme.themes(in: .color).count, 10, "10 theme màu cơ bản")
        for g in WidgetTheme.Group.allCases where g.isPhoto {
            XCTAssertEqual(WidgetTheme.themes(in: g).count, 5, "\(g) có 5 ảnh")
            XCTAssertTrue(WidgetTheme.themes(in: g).allSatisfy { $0.photo != nil })
        }
        XCTAssertTrue(WidgetTheme.themes(in: .color).allSatisfy { $0.photo == nil })
        XCTAssertEqual(WidgetTheme.Group.allCases.first, .color, "màu cơ bản đứng đầu (theme mặc định Wordly)")
    }

    func testPhotoThemesHaveLightTextAndSaneDim() {
        for t in photoThemes {
            XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(t.word, "#000000"), 12, t.id)
            XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(t.meaning, "#000000"), 12, t.id)
            XCTAssertTrue((0.25...WidgetSettings.HomeStyle.maxDim).contains(t.dim), t.id)
        }
    }

    /// Ảnh lớn ≤ 1600 px, ảnh nhỏ cho lưới ≤ 400 px — app không nặng, lưới không giải mã ảnh lớn.
    func testBundledPhotosExistAndAreSmall() throws {
        for t in photoThemes {
            let full = try XCTUnwrap(WidgetThemePhoto.url(t, thumbnail: false), "thiếu ảnh \(t.id)")
            let thumb = try XCTUnwrap(WidgetThemePhoto.url(t, thumbnail: true), "thiếu ảnh nhỏ \(t.id)")
            let fullImg = try XCTUnwrap(WidgetImageIO.downsample(url: full, maxPixel: 4000))
            let thumbImg = try XCTUnwrap(WidgetImageIO.downsample(url: thumb, maxPixel: 4000))
            XCTAssertLessThanOrEqual(max(fullImg.width, fullImg.height), 1600, t.id)
            XCTAssertGreaterThanOrEqual(min(fullImg.width, fullImg.height), 600, t.id)
            XCTAssertLessThanOrEqual(max(thumbImg.width, thumbImg.height), 400, t.id)
            let bytes = try XCTUnwrap(try FileManager.default.attributesOfItem(atPath: full.path)[.size] as? Int)
            XCTAssertLessThanOrEqual(bytes, 400_000, "\(t.id) \(bytes) byte")
        }
    }

    func testOldHomeStyleDecodesWithoutThemePhoto() throws {
        let s = try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: Data(##"{"bgHex1":"#000000"}"##.utf8))
        XCTAssertNil(s.themePhotoId)
        var t = s
        t.themePhotoId = "x"
        XCTAssertEqual(try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: JSONEncoder().encode(t)).themePhotoId, "x")
    }

    func testApplyPhotoThemeWritesCroppedFilesAndKeepsUserPhoto() throws {
        let theme = try XCTUnwrap(photoThemes.first)
        var old = WidgetSettings.HomeStyle()
        old.backgroundVersion = 3
        let s = try WidgetThemePhoto.apply(theme, to: old, store: store)
        XCTAssertEqual(s.themePhotoId, theme.id)
        XCTAssertEqual(s.backgroundVersion, 3, "ảnh người dùng giữ nguyên — vẫn đè theme")
        XCTAssertEqual(s.backgroundDim, theme.dim, accuracy: 0.0001)
        XCTAssertEqual(s.wordColorHex, theme.word)
        XCTAssertTrue(s.matches(theme))
        for kind in WidgetBackgroundKind.allCases {
            XCTAssertEqual(store.loadThemePhoto(kind, id: theme.id)?.width, Int(kind.pixelSize.width), "\(kind)")
        }
    }

    func testApplyColorThemeClearsThemePhotoAndItsFiles() throws {
        let photo = try XCTUnwrap(photoThemes.first)
        let color = try XCTUnwrap(WidgetTheme.themes(in: .color).last)
        var s = try WidgetThemePhoto.apply(photo, to: WidgetSettings.HomeStyle(), store: store)
        XCTAssertFalse(s.matches(color))
        s = try WidgetThemePhoto.apply(color, to: s, store: store)
        XCTAssertNil(s.themePhotoId)
        XCTAssertTrue(s.matches(color))
        XCTAssertFalse(s.matches(photo))
        XCTAssertNil(store.loadThemePhoto(.medium, id: photo.id), "dọn file theme không còn dùng")
    }

    func testSwitchingPhotoThemesKeepsOnlyCurrentFiles() throws {
        let a = photoThemes[0], b = photoThemes[1]
        var s = try WidgetThemePhoto.apply(a, to: WidgetSettings.HomeStyle(), store: store)
        s = try WidgetThemePhoto.apply(b, to: s, store: store)
        XCTAssertNil(store.loadThemePhoto(.small, id: a.id))
        XCTAssertNotNil(store.loadThemePhoto(.small, id: b.id))
    }

    /// Thứ tự hiển thị nền: ảnh người dùng → ảnh theme → (nil = nền màu).
    func testResolvedBackgroundPrecedence() throws {
        let theme = try XCTUnwrap(photoThemes.first)
        var s = try WidgetThemePhoto.apply(theme, to: WidgetSettings.HomeStyle(), store: store)
        XCTAssertNotNil(store.resolvedBackground(.medium, style: s), "chỉ có theme → ảnh theme")

        // Người dùng thêm ảnh (màu đỏ) → đè theme
        let red = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40)).image { ctx in
            UIColor.red.setFill(); ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }.cgImage!
        var files: [WidgetBackgroundKind: Data] = [:]
        for k in WidgetBackgroundKind.allCases {
            files[k] = WidgetImageIO.renderJPEG(red, crop: CGRect(x: 0, y: 0, width: 40, height: 40), kind: k)
        }
        s.backgroundVersion = try store.save(files, previous: 0)
        let user = try XCTUnwrap(store.resolvedBackground(.small, style: s))
        XCTAssertEqual(user.width, Int(WidgetBackgroundKind.small.pixelSize.width))
        XCTAssertTrue(isMostlyRed(user), "ảnh người dùng đè ảnh theme")

        // Xoá ảnh người dùng → quay lại ảnh theme, không trống
        s.backgroundVersion = 0
        store.removeAll(except: 0)
        let back = try XCTUnwrap(store.resolvedBackground(.small, style: s))
        XCTAssertFalse(isMostlyRed(back))

        s.themePhotoId = nil
        XCTAssertNil(store.resolvedBackground(.small, style: s), "không ảnh nào → nền màu")
    }

    func testThumbnailIsSmall() throws {
        let theme = try XCTUnwrap(photoThemes.first)
        let img = try XCTUnwrap(WidgetThemePhoto.thumbnail(theme))
        XCTAssertLessThanOrEqual(max(img.width, img.height), 400)
    }

    private func isMostlyRed(_ img: CGImage) -> Bool {
        var px = [UInt8](repeating: 0, count: 4)
        let ctx = CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(img, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return px[0] > 200 && px[1] < 60 && px[2] < 60
    }
}
