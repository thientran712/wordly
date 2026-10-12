import XCTest
import SwiftUI
import UIKit
@testable import Wordly

// Độ mờ (thanh "Độ mờ" trong ColorPicker) ở Tuỳ chỉnh widget màn hình chính:
// trước đây `toHex()` chỉ ghi #RRGGBB → kéo thanh độ mờ bị mất ngay khi lưu,
// xem trước lẫn widget đều không đổi. Màu có độ mờ phải lưu dạng #AARRGGBB
// (đúng dạng `Color(hex:)` đọc) và đọc lại ra đúng độ mờ.
final class HomeStyleOpacityTests: XCTestCase {
    private func rgba(_ color: Color) -> (r: CGFloat, g: CGFloat, b: CGFloat, a: CGFloat) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (r, g, b, a)
    }

    // Màu đục giữ dạng 6 ký tự như dữ liệu cũ
    func testOpaqueColorKeepsSixDigitHex() {
        XCTAssertEqual(Color.hexString(red: 1, green: 0, blue: 0, alpha: 1), "#FF0000")
        XCTAssertEqual(Color.hexString(red: 28.0 / 255, green: 176.0 / 255, blue: 246.0 / 255, alpha: 1), "#1CB0F6")
    }

    func testTranslucentColorStoresAlphaFirst() {
        XCTAssertEqual(Color.hexString(red: 1, green: 1, blue: 1, alpha: 0.5), "#80FFFFFF")
        XCTAssertEqual(Color.hexString(red: 0, green: 0, blue: 0, alpha: 0), "#00000000")
    }

    // ColorPicker có thể trả màu ngoài sRGB (Display P3) → thành phần âm hoặc > 1
    func testComponentsAreClamped() {
        XCTAssertEqual(Color.hexString(red: -0.2, green: 1.3, blue: 0.5, alpha: 1.4), "#00FF80")
        XCTAssertEqual(Color.hexString(red: 0, green: 0, blue: 0, alpha: -1), "#00000000")
    }

    func testRoundTripKeepsOpacity() {
        let saved = Color(.sRGB, red: 1, green: 0, blue: 0, opacity: 0.4).toHex()
        XCTAssertEqual(saved, "#66FF0000")
        let c = rgba(Color(hex: saved))
        XCTAssertEqual(c.a, 0.4, accuracy: 0.01)
        XCTAssertEqual(c.r, 1, accuracy: 0.01)
        XCTAssertEqual(Color(.sRGB, red: 0, green: 0, blue: 1, opacity: 1).toHex(), "#0000FF")
    }

    // Widget đọc lại settings từ App Group: màu có độ mờ phải giữ nguyên qua mã hoá/giải mã
    func testHomeStyleKeepsTranslucentColorsThroughSettingsCoding() throws {
        var s = WidgetSettings()
        s.homeStyle.bgHex1 = "#661CB0F6"
        s.homeStyle.wordColorHex = "#80FFFFFF"
        let decoded = try JSONDecoder().decode(WidgetSettings.self, from: JSONEncoder().encode(s))
        XCTAssertEqual(decoded.homeStyle.bgHex1, "#661CB0F6")
        XCTAssertEqual(decoded.homeStyle.wordColorHex, "#80FFFFFF")
        XCTAssertEqual(rgba(Color(hex: decoded.homeStyle.bgHex1)).a, 0.4, accuracy: 0.01)
        XCTAssertEqual(rgba(Color(hex: decoded.homeStyle.wordColorHex)).a, 0.5, accuracy: 0.01)
    }

    // Dữ liệu cũ thiếu khoá vẫn giải mã, màu đục mặc định
    func testHomeStyleMissingKeysStayOpaqueDefaults() throws {
        let json = ##"{"homeStyle":{"bgHex1":"#80000000"}}"##.data(using: .utf8)!
        let s = try JSONDecoder().decode(WidgetSettings.self, from: json)
        XCTAssertEqual(s.homeStyle.bgHex1, "#80000000")
        XCTAssertEqual(s.homeStyle.bgHex2, WidgetSettings.HomeStyle().bgHex2)
        XCTAssertEqual(rgba(Color(hex: s.homeStyle.bgHex2)).a, 1, accuracy: 0.001)
    }
}
