import Foundation

// Đọc timestamp từ web API / Supabase.
// PostgREST trả timestamptz CÓ phần lẻ giây ("…21.136123+00:00"), mà
// ISO8601DateFormatter() mặc định không đọc được → phải thử cả hai dạng.
enum APIDate {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let plain = ISO8601DateFormatter()

    static func parse(_ string: String) -> Date? {
        withFraction.date(from: string) ?? plain.date(from: string)
    }

    /// "yyyy-MM-dd" theo múi giờ địa phương — dùng để nhóm theo ngày.
    static func dayKey(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
