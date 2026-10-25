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
    func lookupWord(_ word: String, purpose: String? = nil) async throws -> DictionaryDetail? {
        let r = try await request(path: "/api/dictionary", method: "POST",
                                  body: DictionaryRequest(word: word.trimmingCharacters(in: .whitespaces).lowercased(), purpose: purpose),
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

    /// Chấm ngay 1 câu sau khi chọn — không có tác dụng phụ (không lưu lượt chơi).
    func checkQuizAnswer(_ body: QuizCheckRequest) async throws -> QuizCheckResponse {
        try await request(path: "/api/quiz/check", method: "POST", body: body, responseType: QuizCheckResponse.self)
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

    // MARK: Thông báo nhắc ôn (email nhắc học đã bỏ 13/10/2026)
    func fetchPushPreferences() async throws -> EmailPreferences? {
        try await request(path: "/api/push/preferences", responseType: EmailPreferencesResponse.self).preferences
    }

    func savePushPreferences(_ prefs: EmailPreferences) async throws {
        _ = try await request(path: "/api/push/preferences", method: "PUT", body: prefs, responseType: EmailPreferencesResponse.self)
    }

    func fetchPushSlots() async throws -> [EmailSlot] {
        try await request(path: "/api/push/slots", responseType: EmailSlotsResponse.self).slots
    }

    func addPushSlot(time: String) async throws -> EmailSlot {
        struct Body: Encodable { let send_time: String }
        return try await request(path: "/api/push/slots", method: "POST", body: Body(send_time: time), responseType: EmailSlotResponse.self).slot
    }

    func updatePushSlot(id: String, time: String) async throws {
        struct Body: Encodable { let id: String; let send_time: String }
        _ = try await request(path: "/api/push/slots", method: "PUT", body: Body(id: id, send_time: time), responseType: Ok.self)
    }

    func deletePushSlot(id: String) async throws {
        _ = try await request(path: "/api/push/slots?id=\(id)", method: "DELETE", responseType: Ok.self)
    }

    /// Từ app đã nhắc (push / widget / email cũ) — mới nhất trước.
    func fetchReminded(limit: Int, offset: Int) async throws -> RemindedPage {
        try await request(path: "/api/suggestion-log?limit=\(limit)&offset=\(offset)", responseType: RemindedPage.self)
    }

    func registerPushDevice(token: String, appVersion: String) async throws {
        struct Body: Encodable { let token: String; let platform = "ios"; let app_version: String }
        _ = try await request(path: "/api/push/devices", method: "POST", body: Body(token: token, app_version: appVersion), responseType: Ok.self)
    }

    func unregisterPushDevice(token: String) async throws {
        struct Body: Encodable { let token: String }
        // Gọi trong lúc đăng xuất → không qua AuthRecovery (tránh signOut lồng nhau)
        _ = try await request(path: "/api/push/devices", method: "DELETE", body: Body(token: token), responseType: Ok.self, recoverAuth: false)
    }

    func updateTimezone(_ tz: String) async throws {
        struct Body: Encodable { let timezone: String }
        _ = try await request(path: "/api/profile", method: "PUT", body: Body(timezone: tz), responseType: Ok.self)
    }

    // MARK: Tài khoản
    /// Xoá vĩnh viễn tài khoản + toàn bộ dữ liệu (Apple Guideline 5.1.1(v)).
    /// Có code Apple → gửi kèm để server thu hồi token Apple; không có → không gửi body (như cũ).
    func deleteAccount(appleAuthorizationCode: String? = nil) async throws {
        _ = try await request(path: "/api/account", method: "DELETE",
                              body: AccountDeletion.body(appleAuthorizationCode: appleAuthorizationCode),
                              responseType: Ok.self)
    }

    // MARK: Luyện nói với Alex — tự đặt tiêu đề phiên
    func generateSessionTitle(id: String, messages: [ChatMessage]) async throws -> String? {
        struct Body: Encodable { let messages: [ChatMessage] }
        struct Resp: Decodable { let session: PracticeSession? }
        return try await request(path: "/api/practice/sessions/\(id)/title", method: "POST",
                                 body: Body(messages: messages), responseType: Resp.self).session?.title
    }
}
