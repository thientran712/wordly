import Foundation

// MARK: - Configuration
// Giá trị thật nằm ở Config/Secrets.xcconfig (gitignore), được build chèn vào
// Info.plist. KHÔNG hardcode credential ở đây — file này được commit.
enum WordlyConfig {
    // Web app base URL (deployed Next.js) — used for /api/translate, /api/tts, /api/practice etc.
    static let webBaseURL = infoValue("WordlyWebBaseURL")

    // Supabase credentials (used directly for auth + CRUD)
    static let supabaseURL = infoValue("WordlySupabaseURL")
    static let supabaseAnonKey = infoValue("WordlySupabaseAnonKey")

    // App Group identifier (shared with Widget)
    static let appGroup = infoValue("WordlyAppGroup")

    private static func infoValue(_ key: String) -> String {
        guard let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
              !value.isEmpty, !value.contains("REPLACE_ME") else {
            fatalError("Thiếu \(key) — copy Config/Secrets.example.xcconfig thành Secrets.xcconfig và điền giá trị")
        }
        return value
    }
}

// MARK: - API Error
enum APIError: LocalizedError {
    case invalidURL
    case noData
    case unauthorized
    case serverError(String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:          return "URL không hợp lệ"
        case .noData:              return "Không có dữ liệu"
        case .unauthorized:        return "Phiên đăng nhập hết hạn"
        case .serverError(let m):  return m
        case .decodingError(let e): return "Lỗi parse: \(e.localizedDescription)"
        case .networkError(let e): return "Lỗi mạng: \(e.localizedDescription)"
        }
    }
}

// MARK: - API Client
@MainActor
final class APIClient: ObservableObject {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        session = URLSession(configuration: config)
        decoder = JSONDecoder()
        encoder = JSONEncoder()
    }

    // MARK: - Generic request
    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Encodable? = nil,
        responseType: T.Type,
        useWebBase: Bool = true
    ) async throws -> T {
        let base = useWebBase ? WordlyConfig.webBaseURL : WordlyConfig.supabaseURL
        guard let url = URL(string: base + path) else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Attach Supabase session token
        if let token = await AuthManager.shared.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            req.httpBody = try encoder.encode(body)
        }

        do {
            let (data, response) = try await session.data(for: req)
            guard let http = response as? HTTPURLResponse else { throw APIError.noData }

            if http.statusCode == 401 { throw APIError.unauthorized }
            if http.statusCode >= 400 {
                let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw APIError.serverError("HTTP \(http.statusCode): \(msg)")
            }

            return try decoder.decode(T.self, from: data)
        } catch let e as APIError {
            throw e
        } catch let e as DecodingError {
            throw APIError.decodingError(e)
        } catch {
            throw APIError.networkError(error)
        }
    }

    // MARK: - Raw data request (for TTS audio)
    func rawRequest(path: String, method: String = "GET", body: Encodable? = nil) async throws -> Data {
        guard let url = URL(string: WordlyConfig.webBaseURL + path) else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = await AuthManager.shared.currentToken() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body { req.httpBody = try encoder.encode(body) }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw APIError.noData }
        if http.statusCode == 401 { throw APIError.unauthorized }
        if http.statusCode >= 400 {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.serverError("HTTP \(http.statusCode): \(msg)")
        }
        return data
    }

    // MARK: - Profile
    func fetchProfile() async throws -> ProfileResponse {
        try await request(path: "/api/profile", responseType: ProfileResponse.self)
    }

    func updateProfile(name: String?, skillLevel: String?, learningGoal: String?) async throws -> UserProfile {
        struct Body: Encodable {
            let name: String?
            let skill_level: String?
            let learning_goal: String?
        }
        struct Resp: Decodable { let profile: UserProfile? }
        let resp = try await request(
            path: "/api/profile",
            method: "PUT",
            body: Body(name: name, skill_level: skillLevel, learning_goal: learningGoal),
            responseType: Resp.self
        )
        guard let profile = resp.profile else { throw APIError.noData }
        return profile
    }

    // MARK: - Translation
    func translate(text: String, source: String, target: String) async throws -> TranslateResponse {
        try await request(
            path: "/api/translate",
            method: "POST",
            body: TranslateRequest(text: text, source: source, target: target),
            responseType: TranslateResponse.self
        )
    }

    // MARK: - Translate History
    func fetchHistory(limit: Int = 20, offset: Int = 0) async throws -> TranslateHistoryResponse {
        try await request(
            path: "/api/translate-history?limit=\(limit)&offset=\(offset)",
            responseType: TranslateHistoryResponse.self
        )
    }

    func saveTranslation(sourceText: String, translatedText: String, direction: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(
            path: "/api/translate-history",
            method: "POST",
            body: SaveTranslationRequest(sourceText: sourceText, translatedText: translatedText, direction: direction),
            responseType: Resp.self
        )
    }

    func deleteHistoryEntry(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(
            path: "/api/translate-history?id=\(id)",
            method: "DELETE",
            responseType: Resp.self
        )
    }

    func clearAllHistory() async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(path: "/api/translate-history", method: "DELETE", responseType: Resp.self)
    }

    // MARK: - Journal
    func fetchJournal() async throws -> JournalResponse {
        try await request(path: "/api/journal", responseType: JournalResponse.self)
    }

    func addJournalEntry(content: String) async throws -> JournalEntry {
        struct Resp: Decodable { let entry: JournalEntry? }
        let resp = try await request(
            path: "/api/journal",
            method: "POST",
            body: AddJournalRequest(content: content),
            responseType: Resp.self
        )
        guard let entry = resp.entry else { throw APIError.noData }
        return entry
    }

    func deleteJournalEntry(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(path: "/api/journal?id=\(id)", method: "DELETE", responseType: Resp.self)
    }

    // MARK: - Practice Sessions
    func fetchSessions() async throws -> PracticeSessionsResponse {
        try await request(path: "/api/practice/sessions", responseType: PracticeSessionsResponse.self)
    }

    func fetchSession(id: String) async throws -> PracticeSession {
        struct Resp: Decodable { let session: PracticeSession? }
        let resp = try await request(path: "/api/practice/sessions/\(id)", responseType: Resp.self)
        guard let s = resp.session else { throw APIError.noData }
        return s
    }

    func createSession(title: String, messages: [ChatMessage]) async throws -> PracticeSession {
        struct Resp: Decodable { let session: PracticeSession? }
        let resp = try await request(
            path: "/api/practice/sessions",
            method: "POST",
            body: CreateSessionRequest(title: title, messages: messages),
            responseType: Resp.self
        )
        guard let s = resp.session else { throw APIError.noData }
        return s
    }

    func patchSession(id: String, title: String? = nil, messages: [ChatMessage]? = nil) async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(
            path: "/api/practice/sessions/\(id)",
            method: "PATCH",
            body: PatchSessionRequest(title: title, messages: messages),
            responseType: Resp.self
        )
    }

    func deleteSession(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        _ = try await request(path: "/api/practice/sessions/\(id)", method: "DELETE", responseType: Resp.self)
    }

    // MARK: - Practice Chat
    // Web trả về luồng text thuần (text/plain, stream từng đoạn), KHÔNG phải
    // JSON {reply}. Ở đây đọc trọn luồng rồi trả cả câu trả lời.
    func sendPracticeMessage(messages: [ChatMessage], vocabularyContext: Bool = true) async throws -> String {
        let data = try await rawRequest(
            path: "/api/practice",
            method: "POST",
            body: PracticeRequest(messages: messages, vocabularyContext: vocabularyContext)
        )
        let reply = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reply.isEmpty else { throw APIError.serverError("No reply") }
        return reply
    }

    // MARK: - TTS
    func synthesizeSpeech(text: String, lang: String = "en-US") async throws -> Data {
        struct Body: Encodable { let text: String; let lang: String }
        return try await rawRequest(
            path: "/api/tts",
            method: "POST",
            body: Body(text: text, lang: lang)
        )
    }

    // MARK: - Streak
    func fetchStreak() async throws -> StreakResponse {
        try await request(path: "/api/stats/streak", responseType: StreakResponse.self)
    }

    // MARK: - Datamuse suggestions
    func fetchSuggestions(query: String) async throws -> [String] {
        guard let url = URL(string: "https://api.datamuse.com/words?sp=\(query)*&max=8") else { return [] }
        let (data, _) = try await session.data(from: url)
        let words = try decoder.decode([DatamuseWord].self, from: data)
        return words.map(\.word)
    }

    // MARK: - Free Dictionary
    func fetchWordDetail(word: String) async throws -> WordDetail? {
        guard let encoded = word.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "https://api.dictionaryapi.dev/api/v2/entries/en/\(encoded)") else { return nil }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
        let entries = try decoder.decode([DictionaryEntry].self, from: data)
        guard let entry = entries.first else { return nil }

        let phonetic = entry.phonetic ?? entry.phonetics?.first(where: { $0.text != nil })?.text ?? ""
        let meanings = (entry.meanings ?? []).prefix(3).map { m in
            ParsedMeaning(
                pos: m.partOfSpeech,
                defs: m.definitions.prefix(3).map { d in
                    ParsedDef(definition: d.definition, example: d.example ?? "")
                }
            )
        }
        return WordDetail(word: word, phonetic: phonetic, meanings: Array(meanings))
    }
}
