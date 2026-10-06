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

    enum CodingKeys: String, CodingKey {
        case id
        case sourceText = "source_text"
        case translatedText = "translated_text"
        case direction
        case savedAt = "saved_at"
    }

    var savedDate: Date {
        ISO8601DateFormatter().date(from: savedAt) ?? Date()
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
        ISO8601DateFormatter().date(from: createdAt) ?? Date()
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
}

struct PracticeResponse: Codable {
    let reply: String?
    let error: String?
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
        ISO8601DateFormatter().date(from: updatedAt) ?? Date()
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

// MARK: - Dictionary API
struct DictionaryEntry: Codable {
    let word: String
    let phonetic: String?
    let phonetics: [DictionaryPhonetic]?
    let meanings: [DictionaryMeaning]?
}

struct DictionaryPhonetic: Codable {
    let text: String?
    let audio: String?
}

struct DictionaryMeaning: Codable {
    let partOfSpeech: String
    let definitions: [DictionaryDefinition]
}

struct DictionaryDefinition: Codable {
    let definition: String
    let example: String?
    let synonyms: [String]?
}

// Local model after parsing
struct WordDetail {
    let word: String
    let phonetic: String
    let meanings: [ParsedMeaning]
}

struct ParsedMeaning {
    let pos: String
    let defs: [ParsedDef]
}

struct ParsedDef {
    let definition: String
    let example: String
}

// MARK: - Widget Data
struct WidgetWord: Codable {
    let sourceText: String
    let translatedText: String
    let direction: String
    let dueAt: String?
}
