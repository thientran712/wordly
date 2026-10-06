import XCTest
@testable import Wordly

// Supabase/PostgREST trả timestamptz có phần lẻ giây ("…21.136123+00:00").
// ISO8601DateFormatter() mặc định KHÔNG đọc được dạng này → trước đây mọi mục
// lịch sử / journal / phiên luyện nói đều hiện là "bây giờ".
final class APIDateTests: XCTestCase {
    func testParsesPostgresTimestampWithMicroseconds() throws {
        let date = try XCTUnwrap(APIDate.parse("2026-10-06T09:13:21.136123+00:00"))
        XCTAssertEqual(date.timeIntervalSince1970, 1_791_278_001.136, accuracy: 0.001)
    }

    func testParsesTimestampWithoutFraction() throws {
        let date = try XCTUnwrap(APIDate.parse("2026-10-06T09:13:21Z"))
        XCTAssertEqual(date.timeIntervalSince1970, 1_791_278_001, accuracy: 0.001)
    }

    func testRejectsGarbage() {
        XCTAssertNil(APIDate.parse("not-a-date"))
        XCTAssertNil(APIDate.parse(""))
    }

    // Nhóm lịch sử theo ngày ĐỊA PHƯƠNG: 23:30 UTC ngày 5 là 06:30 sáng ngày 6
    // ở Việt Nam — trước đây bị xếp vào ngày 5 vì cắt chuỗi UTC.
    func testDayKeyUsesLocalTimeZone() throws {
        let date = try XCTUnwrap(APIDate.parse("2026-10-05T23:30:00Z"))
        let vietnam = try XCTUnwrap(TimeZone(identifier: "Asia/Ho_Chi_Minh"))
        XCTAssertEqual(APIDate.dayKey(date, timeZone: vietnam), "2026-10-06")
        XCTAssertEqual(APIDate.dayKey(date, timeZone: TimeZone(identifier: "UTC")!), "2026-10-05")
    }
}
