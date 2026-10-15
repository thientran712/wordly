import XCTest
@testable import Wordly

// Theme phối màu + bảng ô màu cho widget màn hình chính. Theme lấy từ bảng màu
// miễn phí (Tailwind CSS, Nord, Dracula, Catppuccin, Gruvbox, Solarized, Tokyo
// Night, Rosé Pine — đều MIT); mọi theme phải đạt WCAG AA (≥ 4.5:1) cho cả
// màu từ lẫn màu nghĩa, trên cả 2 đầu gradient.
final class WidgetThemeTests: XCTestCase {
    func testThemeCountAndUniqueIds() {
        XCTAssertTrue((40...60).contains(WidgetTheme.all.count), "\(WidgetTheme.all.count)")
        XCTAssertEqual(Set(WidgetTheme.all.map(\.id)).count, WidgetTheme.all.count)
    }

    func testEveryThemeMeetsWCAGAA() {
        for t in WidgetTheme.all {
            for bg in [t.bg1, t.bg2 ?? t.bg1] {
                XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(t.word, bg), 4.5, "\(t.id) từ trên \(bg)")
                XCTAssertGreaterThanOrEqual(WidgetTheme.contrastRatio(t.meaning, bg), 4.5, "\(t.id) nghĩa trên \(bg)")
            }
        }
    }

    func testContrastRatioKnownValues() {
        XCTAssertEqual(WidgetTheme.contrastRatio("#FFFFFF", "#000000"), 21, accuracy: 0.01)
        XCTAssertEqual(WidgetTheme.contrastRatio("#777777", "#777777"), 1, accuracy: 0.01)
    }

    func testApplyThemeKeepsWeightsAndImage() {
        var s = WidgetSettings.HomeStyle()
        s.wordWeight = .light
        s.meaningItalic = true
        s.backgroundVersion = 2
        let solid = WidgetTheme.all.first { $0.bg2 == nil }!
        s.apply(solid)
        XCTAssertEqual(s.bgHex1, solid.bg1)
        XCTAssertFalse(s.useGradient)
        XCTAssertEqual(s.wordColorHex, solid.word)
        XCTAssertEqual(s.meaningColorHex, solid.meaning)
        XCTAssertEqual(s.wordWeight, .light)
        XCTAssertTrue(s.meaningItalic)
        XCTAssertEqual(s.backgroundVersion, 2)
        XCTAssertTrue(s.matches(solid))

        let gradient = WidgetTheme.all.first { $0.bg2 != nil }!
        s.apply(gradient)
        XCTAssertTrue(s.useGradient)
        XCTAssertEqual(s.bgHex2, gradient.bg2)
        XCTAssertFalse(s.matches(solid))
    }

    func testGradientToggle() throws {
        var s = WidgetSettings.HomeStyle()
        XCTAssertTrue(s.useGradient, "mặc định giữ gradient như trước")
        XCTAssertEqual(s.backgroundHexes, [s.bgHex1, s.bgHex2])
        s.useGradient = false
        XCTAssertEqual(s.backgroundHexes, [s.bgHex1, s.bgHex1])
        let back = try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: JSONEncoder().encode(s))
        XCTAssertFalse(back.useGradient)
        let old = try JSONDecoder().decode(WidgetSettings.HomeStyle.self, from: Data("{}".utf8))
        XCTAssertTrue(old.useGradient, "cài đặt cũ không có khoá → vẫn gradient như đang thấy")
    }

    func testSwatchesAreValidAndUnique() {
        XCTAssertTrue((20...30).contains(WidgetTheme.swatches.count))
        XCTAssertEqual(Set(WidgetTheme.swatches).count, WidgetTheme.swatches.count)
        for h in WidgetTheme.swatches {
            XCTAssertNotNil(h.range(of: "^#[0-9A-F]{6}$", options: .regularExpression), h)
        }
    }

    func testEveryGroupHasThemesAndEveryThemeHasGroup() {
        for g in WidgetTheme.Group.allCases {
            XCTAssertGreaterThanOrEqual(WidgetTheme.themes(in: g).count, 5, "\(g)")
        }
        XCTAssertEqual(WidgetTheme.Group.allCases.map { WidgetTheme.themes(in: $0).count }.reduce(0, +), WidgetTheme.all.count)
        XCTAssertGreaterThanOrEqual(WidgetTheme.themes(in: .cartoon).count, 20, "nhóm rực rỡ đủ nhiều theme")
    }

    // Màu mặc định cũ (chữ trắng trên #1CB0F6/#58CC02) chỉ ~2.1–2.4 — người
    // dùng mới bắt đầu bằng theme Wordly (đạt AA).
    func testDefaultStyleIsReadableWordlyTheme() {
        let wordly = WidgetTheme.all.first { $0.id == "wordly" }!
        XCTAssertTrue(WidgetSettings.HomeStyle().matches(wordly))
        XCTAssertEqual(WidgetTheme.group(containing: WidgetSettings.HomeStyle()), .basic)
    }

    func testGroupContainingCustomColorsFallsBackToFirst() {
        var s = WidgetSettings.HomeStyle()
        s.bgHex1 = "#123456"
        XCTAssertEqual(WidgetTheme.group(containing: s), WidgetTheme.Group.allCases.first)
        let cartoon = WidgetTheme.themes(in: .cartoon)[0]
        s.apply(cartoon)
        XCTAssertEqual(WidgetTheme.group(containing: s), .cartoon)
    }

    // App Store 5.2: tên theme không gợi tên phim/nhân vật/thương hiệu có bản quyền.
    func testThemeNamesAvoidCopyrightedFranchises() {
        let banned = ["hiệp sĩ bóng đêm", "báo đen", "nữ hoàng băng giá", "ngọc rồng", "lính vàng", "mũ rơm",
                      "ninja", "kiếm ánh sáng", "phe bóng tối", "nhện", "siêu nhân", "giáp sắt", "khổng lồ xanh",
                      "đội trưởng", "thần sấm", "chuột điện", "mèo máy", "bọt biển", "phù thủy", "tiên cá",
                      "cao bồi", "bóng ma", "nữ chiến binh", "siêu anh hùng", "hoạt hình"]
        let names = WidgetTheme.all.map { $0.name.lowercased() } + WidgetTheme.Group.allCases.map { $0.title.lowercased() }
        for name in names {
            for word in banned {
                XCTAssertFalse(name.contains(word), "\(name) chứa \(word)")
            }
        }
        XCTAssertEqual(Set(WidgetTheme.all.map(\.name)).count, WidgetTheme.all.count, "tên theme không trùng")
    }
}
