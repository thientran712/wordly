import XCTest
import SwiftUI
import UIKit
@testable import Wordly

// Giao diện iOS phải khớp web (web/src/app/globals.css). Test này khoá các
// màu chính theo cả hai chế độ sáng/tối, và kiểm font Plus Jakarta Sans được
// đóng gói + có đủ dấu tiếng Việt.
final class DesignSystemTests: XCTestCase {
    private func hex(_ color: Color, _ style: UIUserInterfaceStyle) -> String {
        let ui = UIColor(color).resolvedColor(with: UITraitCollection(userInterfaceStyle: style))
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        let base = String(format: "#%02X%02X%02X", Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
        return a < 0.999 ? base + String(format: "@%.2f", a) : base
    }

    func testPaletteMatchesWebInDarkMode() {
        XCTAssertEqual(hex(WordlyColors.electric, .dark), "#58CC02")
        XCTAssertEqual(hex(WordlyColors.background, .dark), "#131F24")
        XCTAssertEqual(hex(WordlyColors.cardBG, .dark), "#1F2E36")
        XCTAssertEqual(hex(WordlyColors.surface, .dark), "#1A2930")
        XCTAssertEqual(hex(WordlyColors.ink, .dark), "#FFFFFF")
        XCTAssertEqual(hex(WordlyColors.inkSoft, .dark), "#AFAFAF")
        XCTAssertEqual(hex(WordlyColors.inkGhost, .dark), "#6B7A80")
        XCTAssertEqual(hex(WordlyColors.divider, .dark), "#FFFFFF@0.08")
        XCTAssertEqual(hex(WordlyColors.error, .dark), "#FF4B4B")
    }

    func testPaletteMatchesWebInLightMode() {
        XCTAssertEqual(hex(WordlyColors.electric, .light), "#58CC02")
        XCTAssertEqual(hex(WordlyColors.background, .light), "#FFFFFF")
        XCTAssertEqual(hex(WordlyColors.surface, .light), "#F7F7F7")
        XCTAssertEqual(hex(WordlyColors.ink, .light), "#3C3C3C")
        XCTAssertEqual(hex(WordlyColors.inkSoft, .light), "#777777")
        XCTAssertEqual(hex(WordlyColors.divider, .light), "#E5E5E5")
    }

    func testTextOnPrimaryButtonIsWhiteLikeWeb() {
        XCTAssertEqual(hex(WordlyColors.onElectric, .dark), "#FFFFFF")
        XCTAssertEqual(hex(WordlyColors.onElectric, .light), "#FFFFFF")
    }

    func testCategoryAccentsMatchWeb() {
        XCTAssertEqual(hex(WordlyColors.duoBlue, .dark), "#1CB0F6")
        XCTAssertEqual(hex(WordlyColors.duoOrange, .dark), "#FF9600")
        XCTAssertEqual(hex(WordlyColors.duoPurple, .dark), "#CE82FF")
        XCTAssertEqual(hex(WordlyColors.duoYellow, .dark), "#FFC800")
    }

    // Trước đây hoverBG/inkGhost/background đọc từ asset catalog không tồn tại
    func testSchemeHelpersAgreeWithAdaptiveTokens() {
        XCTAssertEqual(hex(WordlyColors.ink(scheme: .dark), .dark), hex(WordlyColors.ink, .dark))
        XCTAssertEqual(hex(WordlyColors.bg(scheme: .light), .light), hex(WordlyColors.background, .light))
    }

    func testJakartaFontsAreBundledWithVietnameseGlyphs() throws {
        let vietnamese = "Học tiếng Anh mỗi ngày — Đăng nhập, Hồ sơ, Luyện nói, ỵ ữ ặ"
        for name in WordlyFonts.postScriptNames {
            let font = try XCTUnwrap(UIFont(name: name, size: 17), "chưa đóng gói font \(name)")
            let ct = font as CTFont
            let chars = Array(vietnamese.utf16)
            var glyphs = [CGGlyph](repeating: 0, count: chars.count)
            XCTAssertTrue(CTFontGetGlyphsForCharacters(ct, chars, &glyphs, chars.count), "\(name) thiếu glyph tiếng Việt")
        }
    }
}
