# Ảnh nền widget màn hình chính — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng đặt ảnh từ thư viện làm nền widget màn hình chính (nhỏ + vừa), chỉnh khung từng cỡ, mà widget không bao giờ crash vì bộ nhớ.

**Architecture:** Logic thuần (tính khung cắt, giải mã thu nhỏ bằng ImageIO, xuất JPEG đúng cỡ pixel, lưu file có phiên bản) nằm trong một file `Shared/Widget/WidgetBackgroundImage.swift`, dùng chung cho app và widget extension, có unit test. App chỉ giải mã bản thu nhỏ ≤ 2048 px để chỉnh khung, rồi lưu 2 file JPEG đúng cỡ widget. Widget đọc file **một lần trong Provider**, mọi entry trong timeline dùng chung một `UIImage`.

**Tech Stack:** SwiftUI, WidgetKit, ImageIO (`CGImageSourceCreateThumbnailAtIndex`), PhotosUI, XCTest, XcodeGen.

**Spec:** `docs/superpowers/specs/2026-10-12-widget-background-image-design.md`

## Global Constraints

- Yêu cầu số 1: **KHÔNG được crash.** Lỗi ảnh nào (thiếu file, hỏng, quá cỡ) cũng phải rơi về nền màu.
- App **không bao giờ** gọi `UIImage(data:)` trên ảnh gốc. Chỉ giải mã qua `WidgetImageIO.downsample`, cạnh dài ≤ 2048 px.
- Cỡ pixel đầu ra: Nhỏ **510×510**, Vừa **1092×510**, `UIGraphicsImageRendererFormat.scale = 1`, `opaque = true`, JPEG chất lượng 0.8.
- Widget bỏ qua file > 1 MB.
- Thanh làm tối: 0–0.6, mặc định 0.3.
- Ghi file `.atomic`, tên file có phiên bản (`widget-bg-<small|medium>-<version>.jpg`). Lưu xong mới đổi `backgroundVersion` trong cài đặt, rồi xoá file phiên bản cũ.
- Chỉ widget màn hình chính. Accessory (màn hình khoá) giữ `Color.clear`.
- `HomeStyle` giải mã chịu thiếu khoá (dữ liệu cũ không có khoá ảnh nền vẫn decode được).
- Test iOS chạy trên **một** simulator (`BedWar-iPhone16`), `-parallel-testing-enabled NO`.
- **Không archive / upload TestFlight** khi chủ dự án chưa yêu cầu.
- **Đơn giản hoá so với spec:** vị trí/độ phóng **không** lưu lại. Muốn chỉnh khung lần nữa thì chọn lại ảnh (không giữ bản gốc trong App Group). Độ tối thì có lưu.

## Review Focus

1. **Ảnh dọc rất dài (panorama dọc 1:4) hoặc ngang rất rộng (8:1):** khung cắt vẫn phủ kín, không có viền trống, không chia cho 0. Test thuộc Task 2.
2. **Ảnh có EXIF xoay (chụp dọc):** sau khi thu nhỏ, ảnh đứng đúng chiều (`kCGImageSourceCreateThumbnailWithTransform`). Test thuộc Task 3.
3. **PNG trong suốt:** JPEG ra không có nền đen loang lổ. Vẽ nền trắng trước khi vẽ ảnh. Test thuộc Task 3.
4. **Lưu 2 lần liên tiếp nhanh:** không bao giờ còn cài đặt trỏ tới file đã bị xoá. Test thuộc Task 4.
5. **File ảnh hỏng hoặc bị thay bằng file khổng lồ:** widget trả `nil` (dùng nền màu). Test thuộc Task 4.

---

### Task 1: Thêm trường ảnh nền vào `HomeStyle`

**Files:**
- Modify: `mobile/ios/WordlyiOS/Shared/Widget/WidgetSchedule.swift` (struct `HomeStyle` ~dòng 71, `init(from:)` ~dòng 109)
- Test: `mobile/ios/WordlyiOSTests/WidgetBackgroundImageTests.swift` (tạo mới)

**Interfaces:**
- Produces: `WidgetSettings.HomeStyle.backgroundVersion: Int` (0 = không có ảnh), `WidgetSettings.HomeStyle.backgroundDim: Double` (0…0.6, mặc định 0.3), `WidgetSettings.HomeStyle.hasBackgroundImage: Bool`

- [ ] **Step 1: Viết test fail**

```swift
import XCTest
@testable import Wordly

final class WidgetBackgroundImageTests: XCTestCase {
    func testOldHomeStyleWithoutImageKeysDecodesDefaults() throws {
        let json = #"{"bgHex1":"#000000"}"#.data(using: .utf8)!
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
}
```

- [ ] **Step 2: Chạy, thấy fail** (`value of type 'HomeStyle' has no member 'backgroundVersion'`)

```bash
cd mobile/ios && xcodegen generate -q && xcodebuild -project WordlyiOS.xcodeproj -scheme WordlyiOS \
  -destination 'id=7F03B63D-A2D3-40A3-82BC-AC0020671B1E' -parallel-testing-enabled NO \
  -only-testing:WordlyiOSTests/WidgetBackgroundImageTests test
```

- [ ] **Step 3: Thêm vào `struct HomeStyle`**

```swift
        /// Ảnh nền (file trong App Group, xem WidgetBackgroundStore). 0 = không có ảnh.
        var backgroundVersion: Int = 0
        /// Lớp làm tối phủ lên ảnh để chữ đọc được, 0…0.6.
        var backgroundDim: Double = 0.3
        var hasBackgroundImage: Bool { backgroundVersion > 0 }
        static let maxDim = 0.6
```

Trong `init(from:)` của `HomeStyle` thêm:

```swift
        backgroundVersion = try c.decodeIfPresent(Int.self, forKey: .backgroundVersion) ?? d.backgroundVersion
        backgroundDim = min(max(try c.decodeIfPresent(Double.self, forKey: .backgroundDim) ?? d.backgroundDim, 0), Self.maxDim)
```

- [ ] **Step 4: Chạy lại, thấy pass** (cùng lệnh)
- [ ] **Step 5: Commit** — `feat(ios): HomeStyle có trường ảnh nền (phiên bản file + độ tối)`

---

### Task 2: Tính khung cắt (logic thuần)

**Files:**
- Create: `mobile/ios/WordlyiOS/Shared/Widget/WidgetBackgroundImage.swift`
- Modify: `mobile/ios/project.yml` — thêm `- path: WordlyiOS/Shared/Widget/WidgetBackgroundImage.swift` vào `WordlyWidget.sources`
- Test: `mobile/ios/WordlyiOSTests/WidgetBackgroundImageTests.swift`

**Interfaces:**
- Produces:
  - `enum WidgetBackgroundKind: String, CaseIterable { case small, medium }`, với `pixelSize: CGSize` (510×510 / 1092×510) và `aspect: CGFloat` (rộng / cao)
  - `struct CropFrame: Equatable { var zoom: CGFloat; var center: CGPoint }`: `zoom ≥ 1`, `center` chuẩn hoá 0…1 theo ảnh
  - `static func CropFrame.rect(imageSize: CGSize, aspect: CGFloat, frame: CropFrame) -> CGRect`: hình chữ nhật cắt theo pixel ảnh, đúng tỉ lệ, luôn nằm trọn trong ảnh
  - `func CropFrame.clamped(imageSize: CGSize, aspect: CGFloat) -> CropFrame`: kẹp `zoom` vào 1…8 và `center` sao cho khung không ra ngoài ảnh

- [ ] **Step 1: Viết test fail** (thêm vào `WidgetBackgroundImageTests`)

```swift
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

    // Review Focus 1: panorama dọc / ngang cực đoan
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
```

- [ ] **Step 2: Chạy, thấy fail** (`cannot find 'WidgetBackgroundKind'`)
- [ ] **Step 3: Viết code** trong `WidgetBackgroundImage.swift`

```swift
import CoreGraphics
import Foundation

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
struct CropFrame: Equatable {
    static let maxZoom: CGFloat = 8
    var zoom: CGFloat = 1
    /// Tâm khung theo ảnh, chuẩn hoá 0…1
    var center = CGPoint(x: 0.5, y: 0.5)

    /// Khung lớn nhất đúng tỉ lệ nằm trọn trong ảnh ở zoom 1.
    private static func baseSize(_ image: CGSize, _ aspect: CGFloat) -> CGSize {
        let w = max(image.width, 1), h = max(image.height, 1)
        return w / h > aspect ? CGSize(width: h * aspect, height: h) : CGSize(width: w, height: w / aspect)
    }

    func clamped(imageSize: CGSize, aspect: CGFloat) -> CropFrame {
        let z = min(max(zoom, 1), Self.maxZoom)
        let base = Self.baseSize(imageSize, aspect)
        let w = max(imageSize.width, 1), h = max(imageSize.height, 1)
        let halfX = base.width / z / 2 / w, halfY = base.height / z / 2 / h
        let cx = min(max(center.x, halfX), 1 - halfX)
        let cy = min(max(center.y, halfY), 1 - halfY)
        return CropFrame(zoom: z, center: CGPoint(x: cx.isFinite ? cx : 0.5, y: cy.isFinite ? cy : 0.5))
    }

    static func rect(imageSize: CGSize, aspect: CGFloat, frame: CropFrame) -> CGRect {
        let f = frame.clamped(imageSize: imageSize, aspect: aspect)
        let base = baseSize(imageSize, aspect)
        let size = CGSize(width: base.width / f.zoom, height: base.height / f.zoom)
        return CGRect(x: f.center.x * max(imageSize.width, 1) - size.width / 2,
                      y: f.center.y * max(imageSize.height, 1) - size.height / 2,
                      width: size.width, height: size.height)
    }
}
```

Thêm vào `project.yml`, mục `WordlyWidget.sources`, ngay dưới dòng `WidgetSchedule.swift`:

```yaml
      - path: WordlyiOS/Shared/Widget/WidgetBackgroundImage.swift
```

- [ ] **Step 4: `xcodegen generate`, chạy test, thấy pass**
- [ ] **Step 5: Commit** — `feat(ios): tính khung cắt ảnh nền widget (luôn phủ kín, kẹp biên)`

---

### Task 3: Giải mã thu nhỏ + xuất JPEG đúng cỡ

**Files:**
- Modify: `mobile/ios/WordlyiOS/Shared/Widget/WidgetBackgroundImage.swift`
- Test: `mobile/ios/WordlyiOSTests/WidgetBackgroundImageTests.swift`

**Interfaces:**
- Consumes: `WidgetBackgroundKind`, `CropFrame` (Task 2)
- Produces:
  - `enum WidgetImageIO`
  - `static func downsample(data: Data, maxPixel: Int) -> CGImage?`: không bao giờ giải mã toàn bộ ảnh gốc; xoay theo EXIF
  - `static func downsample(url: URL, maxPixel: Int) -> CGImage?`
  - `static func renderJPEG(_ image: CGImage, crop: CGRect, kind: WidgetBackgroundKind) -> Data?`: đúng `kind.pixelSize`, scale 1, nền trắng, JPEG 0.8

- [ ] **Step 1: Viết test fail**

```swift
    import ImageIO
    import UniformTypeIdentifiers
    // (đặt 2 import trên ở đầu file test)

    /// Ảnh xám cỡ lớn (1 byte/pixel: 8000×6000 ≈ 48 MB khi tạo) ghi thẳng ra JPEG.
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

    // Review Focus 2: ảnh chụp dọc lưu ngang + cờ EXIF xoay 90°
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

    // Review Focus 3: PNG trong suốt → nền trắng, không đen
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
```

- [ ] **Step 2: Chạy, thấy fail** (`cannot find 'WidgetImageIO'`)
- [ ] **Step 3: Viết code** (thêm `import ImageIO` và `import UIKit` vào đầu file)

```swift
/// Giải mã / xuất ảnh nền mà không bao giờ giải mã ảnh gốc: ảnh 48 MP giải mã
/// đầy đủ ≈ 190 MB (app) — widget extension chỉ có ~30 MB.
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
            UIColor.white.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
            UIImage(cgImage: cropped).draw(in: CGRect(origin: .zero, size: size))
        }
        return out.jpegData(compressionQuality: 0.8)
    }
}
```

- [ ] **Step 4: Chạy, thấy pass**
- [ ] **Step 5: Commit** — `feat(ios): giải mã thu nhỏ bằng ImageIO + xuất JPEG đúng cỡ widget`

---

### Task 4: Lưu / đọc file ảnh nền có phiên bản

**Files:**
- Modify: `mobile/ios/WordlyiOS/Shared/Widget/WidgetBackgroundImage.swift`
- Test: `mobile/ios/WordlyiOSTests/WidgetBackgroundImageTests.swift`

**Interfaces:**
- Consumes: `WidgetBackgroundKind`, `WidgetImageIO` (Task 3)
- Produces:
  - `struct WidgetBackgroundStore { init(directory: URL?) }`
  - `static func appGroup(_ id: String) -> WidgetBackgroundStore`
  - `func save(_ files: [WidgetBackgroundKind: Data], previous: Int) throws -> Int`: ghi phiên bản mới `previous + 1`, `.atomic`, trả số phiên bản. **Không** xoá phiên bản cũ (để `removeAll(except:)` làm sau khi cài đặt đã đổi)
  - `func removeAll(except version: Int)`: `version = 0` xoá hết
  - `func load(_ kind: WidgetBackgroundKind, version: Int) -> CGImage?`: nil khi `version == 0`, thiếu file, file > 1 MB hoặc giải mã lỗi
  - `static let maxFileBytes = 1_000_000`

- [ ] **Step 1: Viết test fail**

```swift
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

    // Review Focus 4: lưu 2 lần nhanh — phiên bản cũ vẫn đọc được cho tới khi dọn
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

    // Review Focus 5: file hỏng / khổng lồ → nil, không crash
    func testCorruptOrOversizedFileLoadsNil() throws {
        let (store, dir) = tempStore()
        try Data("hỏng".utf8).write(to: dir.appendingPathComponent("widget-bg-small-1.jpg"))
        XCTAssertNil(store.load(.small, version: 1))
        try Data(count: WidgetBackgroundStore.maxFileBytes + 1).write(to: dir.appendingPathComponent("widget-bg-medium-1.jpg"))
        XCTAssertNil(store.load(.medium, version: 1))
    }
```

- [ ] **Step 2: Chạy, thấy fail** (`cannot find 'WidgetBackgroundStore'`)
- [ ] **Step 3: Viết code**

```swift
/// File ảnh nền trong App Group. Tên có phiên bản: app ghi bản mới xong mới
/// đổi cài đặt sang nó, nên widget không bao giờ đọc phải file đang ghi dở.
struct WidgetBackgroundStore {
    static let maxFileBytes = 1_000_000
    let directory: URL?

    init(directory: URL?) { self.directory = directory }

    static func appGroup(_ id: String) -> WidgetBackgroundStore {
        WidgetBackgroundStore(directory: FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id))
    }

    private func url(_ kind: WidgetBackgroundKind, _ version: Int) -> URL? {
        directory?.appendingPathComponent("widget-bg-\(kind.rawValue)-\(version).jpg")
    }

    func save(_ files: [WidgetBackgroundKind: Data], previous: Int) throws -> Int {
        let version = previous + 1
        for (kind, data) in files {
            guard let url = url(kind, version) else { throw CocoaError(.fileNoSuchFile) }
            try data.write(to: url, options: .atomic)
        }
        return version
    }

    func removeAll(except version: Int) {
        guard let directory, let names = try? FileManager.default.contentsOfDirectory(atPath: directory.path) else { return }
        let keep = Set(WidgetBackgroundKind.allCases.compactMap { url($0, version)?.lastPathComponent })
        for name in names where name.hasPrefix("widget-bg-") && !(version > 0 && keep.contains(name)) {
            try? FileManager.default.removeItem(at: directory.appendingPathComponent(name))
        }
    }

    func load(_ kind: WidgetBackgroundKind, version: Int) -> CGImage? {
        guard version > 0, let url = url(kind, version),
              let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int,
              size <= Self.maxFileBytes else { return nil }
        return WidgetImageIO.downsample(url: url, maxPixel: Int(max(kind.pixelSize.width, kind.pixelSize.height)))
    }
}
```

- [ ] **Step 4: Chạy, thấy pass**
- [ ] **Step 5: Commit** — `feat(ios): lưu/đọc file ảnh nền widget theo phiên bản, file lỗi trả nil`

---

### Task 5: Widget hiện ảnh nền (đọc một lần trong Provider)

**Files:**
- Modify: `mobile/ios/WordlyWidget/WordlyWidget.swift` (`WordlyEntry`, `WordlyProvider`, `WidgetBackground`, `WordlyWidget.body`)

**Interfaces:**
- Consumes: `WidgetBackgroundStore.appGroup(_:)`, `load(_:version:)`, `HomeStyle.backgroundVersion/backgroundDim`
- Produces: `WordlyEntry.background: UIImage?` (một instance dùng chung cho mọi entry)

Phần này không unit test được: target widget không có test target, và simulator không áp giới hạn bộ nhớ. Kiểm bằng build + ảnh chụp ở Task 6 + máy thật ở Task 7.

- [ ] **Step 1: `WordlyEntry` thêm** `var background: UIImage? = nil`
- [ ] **Step 2: Provider đọc ảnh một lần cho mỗi timeline/snapshot**

```swift
    /// Đọc MỘT lần cho cả timeline — mọi entry dùng chung một UIImage (bản cũ
    /// đọc trong body: tới 200 entry × một bitmap → vượt ~30 MB, widget bị kill).
    private func loadBackground(_ settings: WidgetSettings, family: WidgetFamily) -> UIImage? {
        let style = settings.homeStyle
        guard style.hasBackgroundImage else { return nil }
        let kind: WidgetBackgroundKind
        switch family {
        case .systemSmall: kind = .small
        case .systemMedium: kind = .medium
        default: return nil
        }
        return WidgetBackgroundStore.appGroup(appGroup).load(kind, version: style.backgroundVersion).map { UIImage(cgImage: $0) }
    }
```

Trong `getSnapshot` và `getTimeline`: `let background = loadBackground(settings, family: context.family)`. Gán `e.background = background` cho mỗi entry tạo ra (sửa `entry(...)` nhận thêm tham số `background: UIImage? = nil`).

- [ ] **Step 3: `WidgetBackground` nhận `entry`**

```swift
private struct WidgetBackground: View {
    @Environment(\.widgetFamily) private var family
    let entry: WordlyEntry

    var body: some View {
        let style = entry.homeStyle
        if family.isAccessory {
            Color.clear
        } else if let image = entry.background {
            Image(uiImage: image).resizable().scaledToFill()
                .overlay(Color.black.opacity(style.backgroundDim))
        } else {
            LinearGradient(colors: [Color(hex: style.bgHex1), Color(hex: style.bgHex2)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}
```

`WordlyWidget.body`: `.containerBackground(for: .widget) { WidgetBackground(entry: entry) }`

- [ ] **Step 4: Build app + widget**

```bash
cd mobile/ios && xcodegen generate -q && xcodebuild -project WordlyiOS.xcodeproj -scheme WordlyiOS \
  -destination 'generic/platform=iOS Simulator' build | grep -E "error:|BUILD (SUCCEEDED|FAILED)"
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 5: Commit** — `feat(ios): widget màn hình chính hiện ảnh nền, đọc một lần cho cả timeline`

---

### Task 6: Màn chọn ảnh + chỉnh khung trong app

**Files:**
- Create: `mobile/ios/WordlyiOS/Features/Settings/WidgetBackgroundEditorView.swift`
- Modify: `mobile/ios/WordlyiOS/Features/Settings/HomeStyleView.swift` (thêm section "Ảnh nền" + xem trước dùng ảnh)
- Modify: `mobile/ios/WordlyiOS/Core/Debug/PreviewMode.swift` (`PreviewScreens`: thêm `"widgetbg"` mở editor với ảnh mẫu, chỉ Debug)

**Interfaces:**
- Consumes: `WidgetImageIO.downsample(data:maxPixel:)`, `renderJPEG`, `CropFrame`, `WidgetBackgroundStore.appGroup(WordlyConfig.appGroup)`, `save/removeAll`, `vm.settings.homeStyle`
- Produces: `struct WidgetBackgroundEditorView: View { init(source: CGImage, vm: WidgetSettingsViewModel, onDone: () -> Void) }`

- [ ] **Step 1: `HomeStyleView` thêm section "Ảnh nền"** (đặt trước "Màu nền")

```swift
            Section {
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label(vm.settings.homeStyle.hasBackgroundImage ? "Đổi ảnh khác" : "Chọn ảnh từ thư viện", systemImage: "photo")
                }
                if vm.settings.homeStyle.hasBackgroundImage {
                    Button("Xoá ảnh nền", role: .destructive) {
                        vm.settings.homeStyle.backgroundVersion = 0
                        WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).removeAll(except: 0)
                    }
                }
                if let loadError { Text(loadError).foregroundStyle(WordlyColors.error) }
            } header: { Text("Ảnh nền") } footer: { Text("Chỉ widget màn hình chính. Màn hình khoá do iOS tô một màu.") }
```

State: `@State private var photoItem: PhotosPickerItem?`, `@State private var editorSource: CGImage?`, `@State private var loadError: String?`.

```swift
        .onChange(of: photoItem) { _, item in
            guard let item else { return }
            Task {
                // Data của file gốc (vài MB) — KHÔNG UIImage(data:): giải mã thẳng xuống ≤ 2048 px
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let img = WidgetImageIO.downsample(data: data, maxPixel: 2048) else {
                    loadError = "Không đọc được ảnh này, thử ảnh khác."
                    photoItem = nil
                    return
                }
                loadError = nil
                editorSource = img
                photoItem = nil
            }
        }
        .fullScreenCover(isPresented: Binding(get: { editorSource != nil }, set: { if !$0 { editorSource = nil } })) {
            if let editorSource {
                WidgetBackgroundEditorView(source: editorSource, vm: vm) { self.editorSource = nil }
            }
        }
```

Thêm `import PhotosUI`. `CGImage` không phải `Identifiable` nên dùng `Binding<Bool>` như trên.

- [ ] **Step 2: Viết `WidgetBackgroundEditorView`**

```swift
import SwiftUI

/// Chọn phần ảnh hiện trên widget nhỏ (vuông) và vừa (ngang): kéo để di chuyển,
/// chụm để phóng to — luôn phủ kín khung. Lưu = xuất 2 file đúng cỡ pixel.
struct WidgetBackgroundEditorView: View {
    let source: CGImage
    @ObservedObject var vm: WidgetSettingsViewModel
    let onDone: () -> Void

    @Environment(\.colorScheme) private var scheme
    @State private var kind: WidgetBackgroundKind = .small
    @State private var frames: [WidgetBackgroundKind: CropFrame] = [.small: CropFrame(), .medium: CropFrame()]
    @State private var dragStart: CropFrame?
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
                Text("Kéo để di chuyển, chụm hai ngón để phóng to.")
                    .font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft(scheme: scheme))
                if let saveError { Text(saveError).foregroundStyle(WordlyColors.error) }
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
            .onAppear { dim = vm.settings.homeStyle.hasBackgroundImage ? vm.settings.homeStyle.backgroundDim : 0.3 }
        }
    }

    /// Xem trước đúng phần sẽ cắt, có chữ mẫu đè lên giống widget thật.
    private var preview: some View {
        let crop = CropFrame.rect(imageSize: imageSize, aspect: kind.aspect, frame: frames[kind] ?? CropFrame())
        let style = vm.settings.homeStyle
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                if let cropped = source.cropping(to: crop.integral) {
                    Image(decorative: cropped, scale: 1).resizable().scaledToFill()
                        .frame(width: geo.size.width, height: geo.size.height).clipped()
                }
                Color.black.opacity(dim)
                VStack(alignment: .leading, spacing: 4) {
                    Text("resilient").font(.system(size: 26, weight: style.wordWeight.swiftUIWeight))
                        .foregroundStyle(Color(hex: style.wordColorHex))
                    Text("kiên cường, mau phục hồi").font(.system(size: 15, weight: style.meaningWeight.swiftUIWeight))
                        .foregroundStyle(Color(hex: style.meaningColorHex))
                }
                .padding(16)
            }
        }
        .aspectRatio(kind.aspect, contentMode: .fit)
        .frame(maxWidth: kind == .small ? 220 : .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 22))
        .accessibilityIdentifier("widgetBackgroundPreview")
    }

    private var dragGesture: some Gesture {
        DragGesture().onChanged { g in
            let start = dragStart ?? frames[kind] ?? CropFrame()
            if dragStart == nil { dragStart = start }
            let crop = CropFrame.rect(imageSize: imageSize, aspect: kind.aspect, frame: start)
            // Kéo ảnh sang phải = khung lùi sang trái; 220pt ≈ chiều rộng xem trước
            let ptToImage = crop.width / 220
            var f = start
            f.center.x -= g.translation.width * ptToImage / imageSize.width
            f.center.y -= g.translation.height * ptToImage / imageSize.height
            frames[kind] = f.clamped(imageSize: imageSize, aspect: kind.aspect)
        }
        .onEnded { _ in dragStart = nil }
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture().onChanged { g in
            let start = dragStart ?? frames[kind] ?? CropFrame()
            if dragStart == nil { dragStart = start }
            var f = start
            f.zoom = start.zoom * g.magnification
            frames[kind] = f.clamped(imageSize: imageSize, aspect: kind.aspect)
        }
        .onEnded { _ in dragStart = nil }
    }

    private func save() {
        isSaving = true
        let store = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup)
        var files: [WidgetBackgroundKind: Data] = [:]
        for k in WidgetBackgroundKind.allCases {
            let crop = CropFrame.rect(imageSize: imageSize, aspect: k.aspect, frame: frames[k] ?? CropFrame())
            guard let data = WidgetImageIO.renderJPEG(source, crop: crop, kind: k) else {
                saveError = "Không lưu được ảnh, thử lại."; isSaving = false; return
            }
            files[k] = data
        }
        do {
            let v = try store.save(files, previous: vm.settings.homeStyle.backgroundVersion)
            // Đổi cài đặt (didSet lưu App Group + reload widget) rồi mới dọn bản cũ
            vm.settings.homeStyle.backgroundVersion = v
            vm.settings.homeStyle.backgroundDim = dim
            store.removeAll(except: v)
            onDone()
        } catch {
            saveError = "Không lưu được ảnh, thử lại."
            isSaving = false
        }
    }
}
```

- [ ] **Step 3: Xem trước trong `HomeStyleView`** dùng ảnh khi có: thay `.background(LinearGradient…)` của `preview` bằng

```swift
            .background {
                if style.hasBackgroundImage,
                   let img = WidgetBackgroundStore.appGroup(WordlyConfig.appGroup).load(.medium, version: style.backgroundVersion) {
                    Image(decorative: img, scale: 1).resizable().scaledToFill()
                        .overlay(Color.black.opacity(style.backgroundDim))
                } else {
                    LinearGradient(colors: [Color(hex: style.bgHex1), Color(hex: style.bgHex2)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
            }
```

- [ ] **Step 4: Màn xem trước Debug** trong `PreviewScreens.view(for:)`

```swift
        case "widgetbg":
            WidgetBackgroundEditorView(source: PreviewFixtures.sampleBackground, vm: WidgetSettingsViewModel(), onDone: {})
```

Trong `PreviewFixtures` (Debug) thêm ảnh mẫu dựng bằng code (gradient 3000×2000, không cần file):

```swift
    static let sampleBackground: CGImage = {
        let ctx = CGContext(data: nil, width: 3000, height: 2000, bitsPerComponent: 8, bytesPerRow: 0,
                            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        let colors = [UIColor.systemTeal.cgColor, UIColor.systemIndigo.cgColor] as CFArray
        let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: nil)!
        ctx.drawLinearGradient(g, start: .zero, end: CGPoint(x: 3000, y: 2000), options: [])
        return ctx.makeImage()!
    }()
```

- [ ] **Step 5: Build + chạy toàn bộ unit test** (165 + mới, tất cả pass)
- [ ] **Step 6: Chụp màn kiểm bằng mắt.** Chạy app với `-WordlyUIPreview profile -WordlyUIPreviewScreen widgetbg` trên simulator, `xcrun simctl io booted screenshot`, kiểm tab Nhỏ / Vừa và thanh làm tối.
- [ ] **Step 7: Commit** — `feat(ios): chọn ảnh + chỉnh khung ảnh nền widget màn hình chính`

---

### Task 7: Kiểm chứng + bàn giao

- [ ] **Step 1: Thêm widget lên màn hình chính simulator** (nhỏ + vừa), đặt ảnh qua app (chọn ảnh trong thư viện simulator), chụp màn hình. Ảnh hiện đúng phần đã chọn, có lớp tối, chữ đọc được. Xoá ảnh thì quay về nền màu.
- [ ] **Step 2: Full unit test + UI test liên quan** (`KeyboardDismissUITests`, `WidgetDeepLinkUITests`), tất cả pass.
- [ ] **Step 3: Cập nhật `PROGRESS.md`**: đã làm gì, bằng chứng, danh sách thử máy thật cho chủ dự án:
  - ảnh 48 MP từ camera, panorama, PNG trong suốt, ảnh chụp dọc
  - đổi ảnh 10 lần liên tục
  - để widget chạy qua đêm: không crash, không trắng
  - xoá ảnh → nền màu
- [ ] **Step 4: Push nhánh `feat/ios-widget-background`, mở PR.** Không archive/upload.
