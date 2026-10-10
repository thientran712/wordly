import Foundation

// Gọi các API của tính năng mang từ web sang. Đường dẫn + body khớp đúng web
// (web/src/app/api/...). Mọi lời gọi đi qua request()/rawRequest() nên được
// hưởng Bearer token + xử lý 401 (AuthRecovery) + PreviewMode.
extension APIClient {
    private struct Ok: Decodable { let success: Bool?; let ok: Bool? }

    private func q(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }

    // MARK: Từ điển AI + lưu từ
    func lookupWord(_ word: String) async throws -> DictionaryDetail? {
        struct Body: Encodable { let word: String }
        let r = try await request(path: "/api/dictionary", method: "POST",
                                  body: Body(word: word.trimmingCharacters(in: .whitespaces).lowercased()),
                                  responseType: DictionaryResponse.self)
        return r.detail
    }

    /// Đánh dấu bản dịch là "Đã lưu" (web dùng PATCH) → vào quiz + email ôn tập.
    func markSaved(sourceText: String, translatedText: String, direction: String) async throws {
        _ = try await request(path: "/api/translate-history", method: "PATCH",
                              body: SaveTranslationRequest(sourceText: sourceText, translatedText: translatedText, direction: direction),
                              responseType: Ok.self)
    }

    // MARK: Quiz
    func fetchQuiz(mode: String, count: Int = 10) async throws -> QuizResponse {
        try await request(path: "/api/quiz?mode=\(mode)&count=\(count)&source=saved", responseType: QuizResponse.self)
    }

    func submitQuiz(_ body: QuizSubmitRequest) async throws -> QuizSubmitResponse {
        try await request(path: "/api/quiz", method: "POST", body: body, responseType: QuizSubmitResponse.self)
    }

    // MARK: Vòng quay luyện nói
    func fetchSpinnerTopics() async throws -> [SpinnerItem] {
        try await request(path: "/api/spinner/topics?language=en", responseType: SpinnerTopicsResponse.self).topics
    }

    func fetchInterviewQuestions(category: String) async throws -> [SpinnerItem] {
        try await request(path: "/api/spinner/interview?category=\(category)", responseType: SpinnerQuestionsResponse.self).questions
    }

    func fetchDeepTalkQuestions(category: String?) async throws -> [SpinnerItem] {
        let path = category.map { "/api/spinner/deep-talk?category=\($0)" } ?? "/api/spinner/deep-talk"
        return try await request(path: path, responseType: SpinnerQuestionsResponse.self).questions
    }

    func fetchSpinHistory(itemType: String) async throws -> [SpinHistoryItem] {
        try await request(path: "/api/spinner/history?item_type=\(itemType)", responseType: SpinHistoryResponse.self).items
    }

    func logSpin(itemId: Int, itemType: String, remove: Bool = false) async throws {
        struct Body: Encodable { let item_id: Int; let item_type: String }
        _ = try await request(path: "/api/spinner/history", method: remove ? "DELETE" : "POST",
                              body: Body(item_id: itemId, item_type: itemType), responseType: Ok.self)
    }

    func suggestVocab(question: String, kind: String) async throws -> [SuggestedWord] {
        struct Body: Encodable { let question: String; let kind: String }
        return try await request(path: "/api/spinner/vocab-suggest", method: "POST",
                                 body: Body(question: question, kind: kind), responseType: VocabSuggestResponse.self).words
    }

    // MARK: Từ vựng theo chủ đề
    func fetchWordsByTopic(exam: String?, topic: String?, level: String?, query: String, offset: Int, withCounts: Bool) async throws -> WordsByTopicResponse {
        var items = ["offset=\(offset)"]
        if let exam { items.append("exam=\(exam)") }
        if let topic { items.append("topic=\(topic)") }
        if let level { items.append("level=\(level)") }
        if !query.isEmpty { items.append("q=\(q(query))") }
        if withCounts { items.append("counts=1") }
        return try await request(path: "/api/words/by-topic?" + items.joined(separator: "&"), responseType: WordsByTopicResponse.self)
    }

    // MARK: Email nhắc học
    func fetchEmailPreferences() async throws -> EmailPreferences? {
        try await request(path: "/api/email-preferences", responseType: EmailPreferencesResponse.self).preferences
    }

    func saveEmailPreferences(_ prefs: EmailPreferences) async throws {
        _ = try await request(path: "/api/email-preferences", method: "PUT", body: prefs, responseType: EmailPreferencesResponse.self)
    }

    func fetchEmailSlots() async throws -> [EmailSlot] {
        try await request(path: "/api/email-slots", responseType: EmailSlotsResponse.self).slots
    }

    func addEmailSlot(time: String) async throws -> EmailSlot {
        struct Body: Encodable { let send_time: String }
        return try await request(path: "/api/email-slots", method: "POST", body: Body(send_time: time), responseType: EmailSlotResponse.self).slot
    }

    func updateEmailSlot(id: String, time: String) async throws {
        struct Body: Encodable { let id: String; let send_time: String }
        _ = try await request(path: "/api/email-slots", method: "PUT", body: Body(id: id, send_time: time), responseType: Ok.self)
    }

    func deleteEmailSlot(id: String) async throws {
        _ = try await request(path: "/api/email-slots?id=\(id)", method: "DELETE", responseType: Ok.self)
    }

    func sendTestEmail() async throws {
        _ = try await request(path: "/api/email/test", method: "POST", responseType: Ok.self)
    }

    func updateTimezone(_ tz: String) async throws {
        struct Body: Encodable { let timezone: String }
        _ = try await request(path: "/api/profile", method: "PUT", body: Body(timezone: tz), responseType: Ok.self)
    }

    // MARK: Luyện nói với Alex — tự đặt tiêu đề phiên
    func generateSessionTitle(id: String, messages: [ChatMessage]) async throws -> String? {
        struct Body: Encodable { let messages: [ChatMessage] }
        struct Resp: Decodable { let session: PracticeSession? }
        return try await request(path: "/api/practice/sessions/\(id)/title", method: "POST",
                                 body: Body(messages: messages), responseType: Resp.self).session?.title
    }
}
