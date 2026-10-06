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
    func fetchQuiz(mode: String, count: Int = 10, classId: String? = nil) async throws -> QuizResponse {
        var path = "/api/quiz?mode=\(mode)&count=\(count)&source=saved"
        if let classId { path += "&class_id=\(classId)" }
        return try await request(path: path, responseType: QuizResponse.self)
    }

    func submitQuiz(_ body: QuizSubmitRequest) async throws -> QuizSubmitResponse {
        try await request(path: "/api/quiz", method: "POST", body: body, responseType: QuizSubmitResponse.self)
    }

    // MARK: Trung tâm + lớp học
    func fetchOrgs() async throws -> [Org] {
        try await request(path: "/api/orgs", responseType: OrgsResponse.self).orgs
    }

    func fetchClasses(orgId: String) async throws -> ClassesResponse {
        try await request(path: "/api/classes?org_id=\(orgId)", responseType: ClassesResponse.self)
    }

    func joinClass(code: String) async throws -> JoinClassResponse {
        struct Body: Encodable { let code: String }
        return try await request(path: "/api/join", method: "POST", body: Body(code: code), responseType: JoinClassResponse.self)
    }

    func fetchSessions(classId: String) async throws -> [ClassSession] {
        try await request(path: "/api/classes/\(classId)/sessions", responseType: ClassSessionsResponse.self).sessions
    }

    func materialURL(_ material: LessonMaterial) async throws -> URL? {
        let endpoint = material.kind == "video" ? "video-url" : "url"
        let r = try await request(path: "/api/materials/\(material.id)/\(endpoint)", responseType: MaterialURLResponse.self)
        return URL(string: r.url)
    }

    func fetchHomework(classId: String) async throws -> [Homework] {
        try await request(path: "/api/homework?class_id=\(classId)", responseType: HomeworkListResponse.self).homework
    }

    func submitHomework(id: String, answers: [String: HomeworkAnswer], draft: Bool) async throws -> HomeworkSubmitResponse {
        try await request(path: "/api/homework/\(id)/submit", method: "POST",
                          body: HomeworkSubmitRequest(answers: answers, draft: draft),
                          responseType: HomeworkSubmitResponse.self)
    }

    func fetchSpeaking(classId: String) async throws -> [SpeakingPrompt] {
        try await request(path: "/api/speaking?class_id=\(classId)", responseType: SpeakingListResponse.self).prompts
    }

    /// Nộp bài nói 3 bước giống web: xin signed URL → PUT audio thẳng lên
    /// Storage → đăng ký (server xác minh dung lượng thật).
    func submitSpeaking(promptId: String, audio: Data, durationMs: Int) async throws {
        struct UploadBody: Encodable {
            let action = "upload-url"
            let mime_type = "audio/mp4"
            let size_bytes: Int
            let duration_ms: Int
        }
        struct RegisterBody: Encodable { let storage_path: String; let duration_ms: Int }

        let slot = try await request(path: "/api/speaking/\(promptId)/submit", method: "POST",
                                     body: UploadBody(size_bytes: audio.count, duration_ms: durationMs),
                                     responseType: SpeakingUploadURLResponse.self)
        guard let url = URL(string: slot.uploadUrl) else { throw APIError.invalidURL }

        #if DEBUG
        let skipUpload = PreviewMode.isOn
        #else
        let skipUpload = false
        #endif
        if !skipUpload {
            var put = URLRequest(url: url)
            put.httpMethod = "PUT"
            put.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
            let (_, response) = try await session.upload(for: put, from: audio)
            guard let http = response as? HTTPURLResponse, http.statusCode < 400 else {
                throw APIError.serverError("Tải audio lên thất bại")
            }
        }

        _ = try await request(path: "/api/speaking/\(promptId)/submit", method: "POST",
                              body: RegisterBody(storage_path: slot.storagePath, duration_ms: durationMs),
                              responseType: Ok.self)
    }

    func fetchMyProgress(classId: String) async throws -> ClassProgressResponse {
        try await request(path: "/api/classes/\(classId)/progress", responseType: ClassProgressResponse.self)
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
