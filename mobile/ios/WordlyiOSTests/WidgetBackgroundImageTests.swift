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
}
