#if DEBUG
import Foundation

// Chế độ xem trước giao diện — CHỈ có trong bản Debug (không vào TestFlight).
// Chạy app với launch argument `-WordlyUIPreview <tab>` (translate | journal |
// practice | profile): bỏ qua đăng nhập, mọi lời gọi web API trả dữ liệu mẫu.
// Dùng để chụp màn hình kiểm giao diện mà không cần tài khoản thật.
enum PreviewMode {
    static let flag = "-WordlyUIPreview"

    static var isOn: Bool { isEnabled(in: CommandLine.arguments) }
    static var initialTab: String? { initialTab(from: CommandLine.arguments) }

    static func isEnabled(in arguments: [String]) -> Bool { arguments.contains(flag) }

    static func initialTab(from arguments: [String]) -> String? {
        guard let i = arguments.firstIndex(of: flag), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }

    /// Dữ liệu mẫu cho một lời gọi web API; nil nếu không có.
    static func fixture(path: String, method: String) -> Data? {
        let route = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        let json: String?
        switch (method, route) {
        case ("GET", "/api/translate-history"): json = history
        case ("GET", "/api/journal"): json = journal
        case ("GET", "/api/practice/sessions"): json = sessions
        case ("GET", "/api/profile"): json = profile
        case ("GET", "/api/stats/streak"): json = #"{"streak": 12, "total_days": 47}"#
        case ("POST", "/api/translate"): json = #"{"translated": "thoáng qua, không bền", "detectedLang": "EN"}"#
        case ("POST", "/api/practice"):
            return Data("Great job! Tell me more about your weekend — what did you do?".utf8)
        case ("POST", "/api/translate-history"), ("DELETE", "/api/translate-history"),
             ("DELETE", "/api/journal"), ("PATCH", _), ("DELETE", _):
            json = #"{"success": true}"#
        case ("POST", "/api/journal"):
            json = #"{"entry": {"id": "j-new", "content": "New entry", "created_at": "2026-10-06T09:00:00.000000+00:00"}}"#
        case ("PUT", "/api/profile"): json = #"{"success": true, "profile": {"id": "u1", "name": "Thiên"}}"#
        default: json = nil
        }
        return json.map { Data($0.utf8) }
    }

    private static let history = #"""
    {"hasMore": false, "history": [
      {"id": "h1", "source_text": "ephemeral", "translated_text": "thoáng qua, không bền", "direction": "EN→VI", "saved_at": "2026-10-06T08:15:02.123456+00:00"},
      {"id": "h2", "source_text": "resilient", "translated_text": "kiên cường, mau phục hồi", "direction": "EN→VI", "saved_at": "2026-10-06T02:40:10.5+00:00"},
      {"id": "h3", "source_text": "cơ hội", "translated_text": "opportunity", "direction": "VI→EN", "saved_at": "2026-10-05T14:05:00+00:00"},
      {"id": "h4", "source_text": "meticulous", "translated_text": "tỉ mỉ, kỹ lưỡng", "direction": "EN→VI", "saved_at": "2026-10-03T11:30:00.000001+00:00"}
    ]}
    """#

    private static let journal = #"""
    {"entries": [
      {"id": "j1", "content": "Today I learned the word 'ephemeral'. Beautiful moments are often ephemeral.", "created_at": "2026-10-06T08:20:00.000000+00:00"},
      {"id": "j2", "content": "Practiced ordering coffee with Alex. I need to work on my pronunciation.", "created_at": "2026-10-05T13:00:00.000000+00:00"}
    ]}
    """#

    private static let sessions = #"""
    {"sessions": [
      {"id": "s1", "title": "Weekend plans", "created_at": "2026-10-06T07:00:00.000000+00:00", "updated_at": "2026-10-06T07:12:00.000000+00:00"},
      {"id": "s2", "title": "Job interview practice", "created_at": "2026-10-04T10:00:00.000000+00:00", "updated_at": "2026-10-04T10:25:00.000000+00:00"}
    ]}
    """#

    private static let profile = #"""
    {"profile": {"id": "u1", "name": "Thiên", "skill_level": "B1", "learning_goal": "ielts", "timezone": "Asia/Ho_Chi_Minh"},
     "email": "preview@wordly.app", "auth_provider": "email"}
    """#
}
#endif
