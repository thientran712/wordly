import XCTest
import UIKit
@testable import Wordly

// Chạm ra ngoài ô nhập → đóng bàn phím; chạm vào ô nhập (kể cả view con bên
// trong UITextView/UITextField) → giữ bàn phím để còn đặt con trỏ, chọn chữ.
final class KeyboardDismissTests: XCTestCase {
    func testTapOnPlainViewDismisses() {
        XCTAssertTrue(KeyboardDismiss.shouldDismiss(touched: UIView()))
        XCTAssertTrue(KeyboardDismiss.shouldDismiss(touched: UIButton()))
        XCTAssertTrue(KeyboardDismiss.shouldDismiss(touched: nil))
    }

    func testTapOnTextInputKeepsKeyboard() {
        XCTAssertFalse(KeyboardDismiss.shouldDismiss(touched: UITextField()))
        XCTAssertFalse(KeyboardDismiss.shouldDismiss(touched: UITextView()))
        XCTAssertFalse(KeyboardDismiss.shouldDismiss(touched: UISearchBar()))
    }

    func testTapInsideTextInputSubviewKeepsKeyboard() {
        let field = UITextView()
        let inner = UIView()
        field.addSubview(inner)
        XCTAssertFalse(KeyboardDismiss.shouldDismiss(touched: inner))
    }
}
