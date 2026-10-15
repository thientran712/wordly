import XCTest
@testable import Wordly

// Mẫu widget màn hình chính: phối sẵn theme + kiểu chữ (+ ảnh nền đi kèm app).
// Chọn mẫu = đổi trọn kiểu widget màn hình chính, không đụng cài đặt khác.
final class WidgetPresetTests: XCTestCase {
    func testPresetsHaveUniqueIdsAndAtLeastOneImagePreset() {
        let all = WidgetPreset.all
        XCTAssertGreaterThanOrEqual(all.count, 8)
        XCTAssertEqual(Set(all.map(\.id)).count, all.count)
        XCTAssertTrue(all.contains { $0.background != nil }, "phải có mẫu dùng ảnh nền")
    }

    func testColorPresetsMeetWCAGAA() {
        for p in WidgetPreset.all where p.background == nil {
            let s = p.style
            for bg in s.backgroundHexes {
                XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(s.wordColorHex, bg), 4.5, "\(p.id) từ")
                XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(s.meaningColorHex, bg), 4.5, "\(p.id) nghĩa")
            }
        }
    }

    func testImagePresetsUseLightTextAndEnoughDim() {
        for p in WidgetPreset.all {
            guard let bg = p.background else { continue }
            let s = p.style
            // Chữ sáng trên ảnh đã làm tối: tương phản với đen ≥ 12
            XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(s.wordColorHex, "#000000"), 12, p.id)
            XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(s.meaningColorHex, "#000000"), 12, p.id)
            XCTAssertTrue((0.35...WidgetSettings.HomeStyle.maxDim).contains(bg.dim), p.id)
        }
    }

    func testColorPresetReplacesWholeStyleAndDropsImage() throws {
        var old = WidgetSettings.HomeStyle()
        old.backgroundVersion = 4
        old.wordItalic = true
        old.cropSmall = CropFrame(zoom: 2, center: .init(x: 0.2, y: 0.2))
        let p = WidgetPreset.all.first { $0.background == nil && !$0.wordItalic }!
        let s = try WidgetPresetBackground.apply(p, to: old, store: WidgetBackgroundStore(directory: nil))
        XCTAssertEqual(s.backgroundVersion, 0, "mẫu không có ảnh thì bỏ ảnh nền cũ")
        XCTAssertNil(s.cropSmall)
        XCTAssertEqual(s.wordWeight, p.wordWeight)
        XCTAssertEqual(s.wordItalic, p.wordItalic)
        XCTAssertEqual(s.meaningItalic, p.meaningItalic)
        XCTAssertTrue(s.matches(p.theme))
        XCTAssertTrue(p.matches(s))
    }

    func testImagePresetMatchesOnlyWithItsImage() {
        let p = WidgetPreset.all.first { $0.background != nil }!
        var s = p.style
        XCTAssertFalse(p.matches(s), "chưa có ảnh nền thì chưa phải mẫu ảnh")
        s.backgroundVersion = 1
        XCTAssertTrue(p.matches(s))
    }

    func testEveryPresetThemeExists() {
        for p in WidgetPreset.all {
            XCTAssertTrue(WidgetTheme.all.contains(p.theme), p.id)
        }
    }

    func testBundledBackgroundImagesExistAndDecode() {
        for p in WidgetPreset.all {
            guard let bg = p.background else { continue }
            XCTAssertNotNil(WidgetPresetBackground.source(bg), "thiếu ảnh \(bg.resource) trong app")
        }
    }

    func testApplyImagePresetWritesBothSizesAndPointsStyleToNewVersion() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = WidgetBackgroundStore(directory: dir)
        let p = WidgetPreset.all.first { $0.background != nil }!

        var old = WidgetSettings.HomeStyle()
        old.backgroundVersion = 2
        let s = try WidgetPresetBackground.apply(p, to: old, store: store)

        XCTAssertEqual(s.backgroundVersion, 3)
        XCTAssertEqual(s.backgroundDim, p.background!.dim, accuracy: 0.0001)
        XCTAssertTrue(p.matches(s))
        for kind in WidgetBackgroundKind.allCases {
            let img = store.load(kind, version: 3)
            XCTAssertNotNil(img, "\(kind)")
            XCTAssertEqual(img?.width, Int(kind.pixelSize.width))
        }
        XCTAssertNotNil(store.loadSource(version: 3), "giữ bản gốc để còn chỉnh lại khung")
    }
}
