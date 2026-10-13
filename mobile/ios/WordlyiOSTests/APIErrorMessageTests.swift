import XCTest
@testable import Wordly

final class APIErrorMessageTests: XCTestCase {
    func testServerMessageReadsErrorField() {
        let e = APIError.serverError(#"HTTP 400: {"error":"Đã có khung giờ 08:30"}"#)
        XCTAssertEqual(e.serverMessage, "Đã có khung giờ 08:30")
    }
    func testServerMessageNilForNonJSON() {
        XCTAssertNil(APIError.serverError("HTTP 500: Internal").serverMessage)
        XCTAssertNil(APIError.unauthorized.serverMessage)
    }
}
