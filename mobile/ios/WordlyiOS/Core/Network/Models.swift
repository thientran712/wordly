import Foundation

// MARK: - Profile
struct UserProfile: Codable, Identifiable {
    let id: String
    var name: String?
    var skillLevel: String?
    var learningGoal: String?
    var timezone: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case skillLevel = "skill_level"
        case learningGoal = "learning_goal"
        case timezone
    }
}

struct ProfileResponse: Codable {
    let profile: UserProfile?
    let email: String?
    let authProvider: String?

    enum CodingKeys: String, CodingKey {
        case profile
        case email
        case authProvider = "auth_provider"
    }
}

// MARK: - Translation
struct TranslateRequest: Codable {
    let text: String
    let source: String
    let target: String
}

struct TranslateResponse: Codable {
    let translated: String?
    let detectedLang: String?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case translated
        case detectedLang
        case error
    }
}

struct TranslateHistoryEntry: Codable, Identifiable {
    let id: String
    let sourceText: String
    let translatedText: String
    let direction: String
    let savedAt: String
    var isSaved: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case sourceText = "source_text"
        case translatedText = "translated_text"
        case direction
        case savedAt = "saved_at"
        case isSaved = "is_saved"
    }

    var savedDate: Date {
        APIDate.parse(savedAt) ?? Date()
    }
}

struct TranslateHistoryResponse: Codable {
    let history: [TranslateHistoryEntry]
    let hasMore: Bool
}

struct SaveTranslationRequest: Codable {
    let sourceText: String
    let translatedText: String
    let direction: String

    enum CodingKeys: String, CodingKey {
        case sourceText = "source_text"
        case translatedText = "translated_text"
        case direction
    }
}

// MARK: - Journal
struct JournalEntry: Codable, Identifiable {
    let id: String
    let content: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id, content
        case createdAt = "created_at"
    }

    var createdDate: Date {
        APIDate.parse(createdAt) ?? Date()
    }
}

struct JournalResponse: Codable {
    let entries: [JournalEntry]
}

struct AddJournalRequest: Codable {
    let content: String
}

// MARK: - Practice
struct ChatMessage: Codable, Identifiable, Equatable {
    var id = UUID()
    let role: String  // "user" | "assistant"
    let content: String

    enum CodingKeys: String, CodingKey {
        case role, content
    }
}

struct PracticeRequest: Codable {
    let messages: [ChatMessage]
    let vocabularyContext: Bool?
    /// Luyện theo một từ (web: /practice?word=…) — Alex dạy đúng từ này.
    var word: String? = nil
}

struct PracticeSession: Codable, Identifiable {
    let id: String
    var title: String
    var messages: [ChatMessage]?
    let createdAt: String
    var updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, title, messages
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var updatedDate: Date {
        APIDate.parse(updatedAt) ?? Date()
    }
}

struct PracticeSessionsResponse: Codable {
    let sessions: [PracticeSession]
}

struct PracticeSessionResponse: Codable {
    let session: PracticeSession?
}

struct CreateSessionRequest: Codable {
    let title: String
    let messages: [ChatMessage]
    var wordId: String? = nil

    enum CodingKeys: String, CodingKey {
        case title, messages
        case wordId = "word_id"
    }
}

struct PatchSessionRequest: Codable {
    let title: String?
    let messages: [ChatMessage]?
}

// MARK: - Streak
struct StreakResponse: Codable {
    let streak: Int
    let totalDays: Int

    enum CodingKeys: String, CodingKey {
        case streak
        case totalDays = "total_days"
    }
}

// MARK: - Word Suggestions (Datamuse)
struct DatamuseWord: Codable {
    let word: String
    let score: Int?
    let tags: [String]?
}
