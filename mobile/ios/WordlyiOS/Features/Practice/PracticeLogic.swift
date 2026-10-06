import Foundation

/// Logic thuần của Luyện nói với Alex — giống web (app/(learner)/practice/page.js).
enum PracticeLogic {
    /// Câu mở đầu khi luyện theo một từ (từ màn Dịch / Từ vựng theo chủ đề).
    static func kickoff(word: String) -> String {
        "Can you teach me the word \"\(word)\"? Please explain what it means, give me an example sentence, and share a common idiom or collocation with it if there is one."
    }

    /// Tiêu đề tạm trước khi AI đặt tên.
    static func placeholderTitle(word: String?, date: Date) -> String {
        if let word { return "\"\(word)\"" }
        return "Conversation " + DateFormatter.localizedString(from: date, dateStyle: .short, timeStyle: .short)
    }

    /// Chỉ tạo phiên trong DB khi người dùng gửi tin nhắn thật đầu tiên — xem lời
    /// chào rồi rời đi thì không để lại cuộc trò chuyện rác.
    static func needsSessionOnSend(activeSessionId: String?) -> Bool {
        activeSessionId == nil
    }

    /// Tự đặt tiêu đề sau lượt trao đổi đầu tiên (2 tin, hoặc 4 tin khi có lời
    /// chào mở đầu) — đúng một lần.
    static func shouldGenerateTitle(messages: [ChatMessage]) -> Bool {
        messages.count == 2 || messages.count == 4
    }
}
