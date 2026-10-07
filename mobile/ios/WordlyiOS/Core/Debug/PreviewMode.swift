#if DEBUG
import Foundation
import SwiftUI

// Chế độ xem trước giao diện — CHỈ có trong bản Debug (không vào TestFlight).
// Chạy app với launch argument `-WordlyUIPreview <tab>` (translate | vocab |
// review | speak | profile): bỏ qua đăng nhập, mọi lời gọi web API trả dữ liệu mẫu.
// Dùng để chụp màn hình kiểm giao diện mà không cần tài khoản thật.
enum PreviewMode {
    static let flag = "-WordlyUIPreview"

    static var isOn: Bool { isEnabled(in: CommandLine.arguments) }
    static var initialTab: String? { initialTab(from: CommandLine.arguments) }
    /// `-WordlyUIPreviewScreen <tên>` → mở thẳng một màn bị push sâu (quiz, vocab…)
    static var screen: String? {
        let args = CommandLine.arguments
        guard let i = args.firstIndex(of: "-WordlyUIPreviewScreen"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    static func isEnabled(in arguments: [String]) -> Bool { arguments.contains(flag) }

    static func initialTab(from arguments: [String]) -> String? {
        guard let i = arguments.firstIndex(of: flag), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }

    /// Dữ liệu mẫu cho một lời gọi web API; nil nếu không có.
    static func fixture(path: String, method: String) -> Data? {
        let route = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? path
        let parts = route.split(separator: "/").map(String.init)   // ["api", "classes", "<id>", "sessions"]
        let json: String?
        switch (method, route) {
        case ("GET", "/api/translate-history"): json = history
        case ("GET", "/api/journal"): json = journal
        case ("GET", "/api/practice/sessions"): json = sessions
        case ("GET", "/api/profile"): json = profile
        case ("GET", "/api/stats/streak"): json = #"{"streak": 12, "total_days": 47}"#
        case ("POST", "/api/translate"): json = #"{"translated": "kiên cường, mau phục hồi", "detectedLang": "EN"}"#
        case ("POST", "/api/practice"):
            return Data("Great job! Tell me more about your weekend — what did you do?".utf8)
        case ("POST", "/api/dictionary"): json = PreviewFixtures.dictionary
        case ("GET", "/api/quiz"): json = PreviewFixtures.quiz
        case ("POST", "/api/quiz"): json = PreviewFixtures.quizResult
        case ("GET", "/api/orgs"): json = PreviewFixtures.orgs
        case ("GET", "/api/classes"): json = PreviewFixtures.classes
        case ("POST", "/api/join"):
            json = #"{"ok": true, "class_id": "cff0ef10-7302-4d0b-bfff-6a5167c778b0", "class_name": "IELTS FOUNDATION 3"}"#
        case ("GET", "/api/homework"): json = PreviewFixtures.homework
        case ("GET", "/api/speaking"): json = PreviewFixtures.speaking
        case ("GET", "/api/spinner/topics"): json = PreviewFixtures.topics
        case ("GET", "/api/spinner/interview"): json = PreviewFixtures.interview
        case ("GET", "/api/spinner/deep-talk"): json = PreviewFixtures.deepTalk
        case ("GET", "/api/spinner/history"): json = PreviewFixtures.spinHistory
        case ("POST", "/api/spinner/vocab-suggest"): json = PreviewFixtures.vocabSuggest
        case ("GET", "/api/words/by-topic"): json = PreviewFixtures.wordsByTopic
        case ("GET", "/api/email-preferences"): json = PreviewFixtures.emailPrefs
        case ("PUT", "/api/email-preferences"): json = PreviewFixtures.emailPrefs
        case ("GET", "/api/email-slots"): json = PreviewFixtures.emailSlots
        case ("POST", "/api/email-slots"): json = #"{"slot": {"id": "slot-new", "send_time": "12:00:00"}}"#
        case ("POST", "/api/email/test"): json = #"{"success": true}"#
        case ("POST", "/api/journal"):
            json = #"{"entry": {"id": "j-new", "content": "New entry", "created_at": "2026-10-06T09:00:00.000000+00:00"}}"#
        case ("PUT", "/api/profile"): json = #"{"success": true, "profile": {"id": "u1", "name": "Thiên"}}"#
        // Route có id động: /api/classes/<id>/…, /api/homework/<id>/submit, /api/materials/<id>/url
        case ("GET", _) where parts.count == 4 && parts[1] == "classes" && parts[3] == "sessions":
            json = PreviewFixtures.sessions
        case ("GET", _) where parts.count == 4 && parts[1] == "classes" && parts[3] == "progress":
            json = PreviewFixtures.progress
        case ("GET", _) where parts.count == 4 && parts[1] == "materials":
            json = PreviewFixtures.materialURL
        case ("POST", _) where parts.count == 4 && parts[1] == "homework" && parts[3] == "submit":
            json = PreviewFixtures.homeworkSubmit
        case ("POST", _) where parts.count == 5 && parts[1] == "practice" && parts[4] == "title":
            json = #"{"session": {"id": "s1", "title": "Ordering coffee", "created_at": "2026-10-06T07:00:00.000000+00:00", "updated_at": "2026-10-06T07:12:00.000000+00:00"}}"#
        // Xoá mềm: "Xoá hết" trả id mục chưa lưu (h3) để hiện "Hoàn tác"
        case ("DELETE", "/api/translate-history"): json = #"{"success": true, "ids": ["h3"]}"#
        case ("POST", "/api/translate-history/restore"): json = #"{"success": true, "restored": 1}"#
        case ("POST", "/api/translate-history"), ("PATCH", _), ("DELETE", _), ("PUT", _), ("POST", "/api/spinner/history"):
            json = #"{"success": true}"#
        default: json = nil
        }
        return json.map { Data($0.utf8) }
    }

    private static let history = #"""
    {"hasMore": false, "history": [
      {"id": "h1", "is_saved": true, "source_text": "ephemeral", "translated_text": "thoáng qua, không bền", "direction": "EN→VI", "saved_at": "2026-10-06T08:15:02.123456+00:00"},
      {"id": "h2", "is_saved": true, "source_text": "resilient", "translated_text": "kiên cường, mau phục hồi", "direction": "EN→VI", "saved_at": "2026-10-06T02:40:10.5+00:00"},
      {"id": "h3", "source_text": "cơ hội", "translated_text": "opportunity", "direction": "VI→EN", "saved_at": "2026-10-05T14:05:00+00:00"},
      {"id": "h4", "is_saved": true, "source_text": "meticulous", "translated_text": "tỉ mỉ, kỹ lưỡng", "direction": "EN→VI", "saved_at": "2026-10-03T11:30:00.000001+00:00"}
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

/// Màn mở thẳng khi chụp ảnh kiểm giao diện (chỉ bản Debug).
enum PreviewScreens {
    @MainActor @ViewBuilder
    static func view(for name: String) -> some View {
        switch name {
        case "quiz": QuizView()
        case "vocab": TopicVocabularyView()
        case "spinner": SpeakSpinnerView()
        case "journal": JournalView()
        case "email": EmailSettingsView()
        case "widget": WidgetSettingsView()
        case "classes": ClassesListContent()
        default: Text("Không có màn \(name)")
        }
    }
}
#endif
