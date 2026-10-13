import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import Wordly

// Ảnh nền widget màn hình chính — xem docs/superpowers/specs/2026-10-12-widget-background-image-design.md.
// Yêu cầu số 1: không crash → mọi đường lỗi trả nil (widget dùng nền màu).
final class WidgetBackgroundImageTests: XCTestCase {
    func testOldHomeStyleWithoutImageKeysDecodesDefaults() throws {
        let json = ##"{"bgHex1":"#000000"}"##.data(using: .utf8)!
        let s = try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: json)
        XCTAssertEqual(s.bgHex1, "#000000")
        XCTAssertEqual(s.backgroundVersion, 0)
        XCTAssertEqual(s.backgroundDim, 0.3, accuracy: 0.0001)
        XCTAssertFalse(s.hasBackgroundImage)
    }

    func testHomeStyleImageKeysRoundTrip() throws {
        var s = WidgetSettings.HomeStyle()
        s.backgroundVersion = 3
        s.backgroundDim = 0.5
        let back = try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(back.backgroundVersion, 3)
        XCTAssertEqual(back.backgroundDim, 0.5, accuracy: 0.0001)
        XCTAssertTrue(back.hasBackgroundImage)
    }

    func testDimIsClampedWhenDecoding() throws {
        let json = #"{"backgroundDim":5}"#.data(using: .utf8)!
        XCTAssertEqual(try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: json).backgroundDim, 0.6, accuracy: 0.0001)
    }

    // MARK: - Khung cắt (Task 2)

    private func assertInside(_ r: CGRect, _ size: CGSize, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertGreaterThanOrEqual(r.minX, -0.001, file: file, line: line)
        XCTAssertGreaterThanOrEqual(r.minY, -0.001, file: file, line: line)
        XCTAssertLessThanOrEqual(r.maxX, size.width + 0.001, file: file, line: line)
        XCTAssertLessThanOrEqual(r.maxY, size.height + 0.001, file: file, line: line)
    }

    func testKindPixelSizes() {
        XCTAssertEqual(WidgetBackgroundKind.small.pixelSize, CGSize(width: 510, height: 510))
        XCTAssertEqual(WidgetBackgroundKind.medium.pixelSize, CGSize(width: 1092, height: 510))
    }

    func testZoomOneCoversLargestCenteredArea() {
        let size = CGSize(width: 4000, height: 3000)
        let r = CropFrame.rect(imageSize: size, aspect: 1, frame: CropFrame(zoom: 1, center: CGPoint(x: 0.5, y: 0.5)))
        XCTAssertEqual(r, CGRect(x: 500, y: 0, width: 3000, height: 3000))
    }

    func testZoomTwoHalvesTheCrop() {
        let size = CGSize(width: 4000, height: 3000)
        let r = CropFrame.rect(imageSize: size, aspect: 1, frame: CropFrame(zoom: 2, center: CGPoint(x: 0.5, y: 0.5)))
        XCTAssertEqual(r.width, 1500, accuracy: 0.001)
        XCTAssertEqual(r.midX, 2000, accuracy: 0.001)
    }

    func testCenterNearEdgeIsClampedInside() {
        let size = CGSize(width: 4000, height: 3000)
        let f = CropFrame(zoom: 2, center: CGPoint(x: 0, y: 1)).clamped(imageSize: size, aspect: 1)
        let r = CropFrame.rect(imageSize: size, aspect: 1, frame: f)
        assertInside(r, size)
        XCTAssertEqual(r.minX, 0, accuracy: 0.001)
        XCTAssertEqual(r.maxY, 3000, accuracy: 0.001)
    }

    // Panorama dọc / ngang cực đoan, ảnh 1×1: vẫn phủ kín, đúng tỉ lệ, không chia 0
    func testExtremeAspectImagesStillCovered() {
        for size in [CGSize(width: 1000, height: 4000), CGSize(width: 8000, height: 1000), CGSize(width: 1, height: 1)] {
            for kind in WidgetBackgroundKind.allCases {
                let f = CropFrame(zoom: 0.2, center: CGPoint(x: -3, y: 9)).clamped(imageSize: size, aspect: kind.aspect)
                XCTAssertGreaterThanOrEqual(f.zoom, 1)
                let r = CropFrame.rect(imageSize: size, aspect: kind.aspect, frame: f)
                assertInside(r, size)
                XCTAssertEqual(r.width / r.height, kind.aspect, accuracy: 0.01)
                XCTAssertGreaterThan(r.width, 0)
            }
        }
    }

    func testZoomUpperLimit() {
        let f = CropFrame(zoom: 50, center: CGPoint(x: 0.5, y: 0.5)).clamped(imageSize: CGSize(width: 100, height: 100), aspect: 1)
        XCTAssertEqual(f.zoom, 8)
    }

    // MARK: - Giải mã thu nhỏ + xuất JPEG (Task 3)

    /// Ảnh xám (1 byte/pixel: 8000×6000 ≈ 48 MB khi tạo) ghi thẳng ra JPEG/PNG.
    private func makeImageData(width: Int, height: Int, type: UTType = .jpeg,
                               orientation: Int = 1, alpha: Bool = false) -> Data {
        let space = alpha ? CGColorSpaceCreateDeviceRGB() : CGColorSpaceCreateDeviceGray()
        let info = alpha ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.none.rawValue
        let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                            bytesPerRow: 0, space: space, bitmapInfo: info)!
        if !alpha { ctx.setFillColor(gray: 0.5, alpha: 1); ctx.fill(CGRect(x: 0, y: 0, width: width, height: height)) }
        let out = NSMutableData()
        let dest = CGImageDestinationCreateWithData(out, type.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        CGImageDestinationFinalize(dest)
        return out as Data
    }

    private func pixelSize(_ data: Data) -> CGSize {
        let src = CGImageSourceCreateWithData(data as CFData, nil)!
        let p = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as! [CFString: Any]
        return CGSize(width: p[kCGImagePropertyPixelWidth] as! Int, height: p[kCGImagePropertyPixelHeight] as! Int)
    }

    func testDownsample48MPStaysUnderLimit() {
        let img = WidgetImageIO.downsample(data: makeImageData(width: 8000, height: 6000), maxPixel: 2048)
        XCTAssertEqual(img?.width, 2048)
        XCTAssertEqual(img?.height, 1536)
    }

    func testDownsampleGarbageReturnsNil() {
        XCTAssertNil(WidgetImageIO.downsample(data: Data("không phải ảnh".utf8), maxPixel: 2048))
    }

    // Ảnh chụp dọc lưu ngang + cờ EXIF xoay 90°
    func testDownsampleAppliesExifRotation() {
        let img = WidgetImageIO.downsample(data: makeImageData(width: 400, height: 200, orientation: 6), maxPixel: 2048)
        XCTAssertEqual(img?.width, 200)
        XCTAssertEqual(img?.height, 400)
    }

    func testRenderJPEGExactPixelSize() {
        let src = WidgetImageIO.downsample(data: makeImageData(width: 3000, height: 2000), maxPixel: 2048)!
        for kind in WidgetBackgroundKind.allCases {
            let crop = CropFrame.rect(imageSize: CGSize(width: src.width, height: src.height), aspect: kind.aspect, frame: CropFrame())
            let data = WidgetImageIO.renderJPEG(src, crop: crop, kind: kind)!
            XCTAssertEqual(pixelSize(data), kind.pixelSize, "\(kind) phải đúng cỡ pixel, không nhân 3x")
            XCTAssertLessThan(data.count, 1_000_000)
        }
    }

    // PNG trong suốt → nền trắng, không đen
    func testTransparentPNGRendersOnWhite() {
        let src = WidgetImageIO.downsample(data: makeImageData(width: 600, height: 600, type: .png, alpha: true), maxPixel: 2048)!
        let data = WidgetImageIO.renderJPEG(src, crop: CGRect(x: 0, y: 0, width: 600, height: 600), kind: .small)!
        let out = WidgetImageIO.downsample(data: data, maxPixel: 16)!
        let ctx = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.draw(out, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        let px = ctx.data!.assumingMemoryBound(to: UInt8.self)
        XCTAssertGreaterThan(px[0], 240)
    }

    // MARK: - Lưu / đọc file (Task 4)

    private func tempStore() -> (WidgetBackgroundStore, URL) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try! FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: dir) }
        return (WidgetBackgroundStore(directory: dir), dir)
    }

    private func renderedFiles() -> [WidgetBackgroundKind: Data] {
        let src = WidgetImageIO.downsample(data: makeImageData(width: 1200, height: 800), maxPixel: 2048)!
        var out: [WidgetBackgroundKind: Data] = [:]
        for kind in WidgetBackgroundKind.allCases {
            let crop = CropFrame.rect(imageSize: CGSize(width: src.width, height: src.height), aspect: kind.aspect, frame: CropFrame())
            out[kind] = WidgetImageIO.renderJPEG(src, crop: crop, kind: kind)!
        }
        return out
    }

    func testSaveThenLoadBothKinds() throws {
        let (store, _) = tempStore()
        let v = try store.save(renderedFiles(), previous: 0)
        XCTAssertEqual(v, 1)
        XCTAssertEqual(store.load(.small, version: v)?.width, 510)
        XCTAssertEqual(store.load(.medium, version: v)?.width, 1092)
    }

    func testVersionZeroOrMissingLoadsNil() {
        let (store, _) = tempStore()
        XCTAssertNil(store.load(.small, version: 0))
        XCTAssertNil(store.load(.small, version: 7))
        XCTAssertNil(WidgetBackgroundStore(directory: nil).load(.small, version: 1))
    }

    // Lưu 2 lần nhanh — phiên bản cũ vẫn đọc được cho tới khi dọn
    func testSaveKeepsOldVersionUntilCleanup() throws {
        let (store, _) = tempStore()
        let v1 = try store.save(renderedFiles(), previous: 0)
        let v2 = try store.save(renderedFiles(), previous: v1)
        XCTAssertNotNil(store.load(.small, version: v1), "widget đang đọc bản cũ không bị mất file giữa chừng")
        store.removeAll(except: v2)
        XCTAssertNil(store.load(.small, version: v1))
        XCTAssertNotNil(store.load(.small, version: v2))
        store.removeAll(except: 0)
        XCTAssertNil(store.load(.small, version: v2))
    }

    // File hỏng / khổng lồ → nil, không crash
    func testCorruptOrOversizedFileLoadsNil() throws {
        let (store, dir) = tempStore()
        try Data("hỏng".utf8).write(to: dir.appendingPathComponent("widget-bg-small-1.jpg"))
        XCTAssertNil(store.load(.small, version: 1))
        try Data(count: WidgetBackgroundStore.maxFileBytes + 1).write(to: dir.appendingPathComponent("widget-bg-medium-1.jpg"))
        XCTAssertNil(store.load(.medium, version: 1))
    }
}
