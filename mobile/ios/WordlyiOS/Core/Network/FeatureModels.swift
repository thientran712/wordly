import Foundation

// Model cho các tính năng mang từ web sang. Tên trường JSON khớp đúng API web
// (web/src/app/api/...) — kiểm bằng FeatureModelsTests với dữ liệu thật.

// MARK: - Từ điển AI (/api/dictionary)
struct DictionaryResponse: Decodable {
    let detail: DictionaryDetail?
}

struct DictionaryDetail: Decodable, Equatable {
    let word: String
    let phoneticUs: String
    let phoneticUk: String
    let meanings: [WordMeaning]
    let hasMoreMeanings: Bool?
}

struct WordMeaning: Decodable, Equatable, Identifiable {
    var id: String { pos }
    let pos: String
    let defs: [WordSense]
}

struct WordSense: Decodable, Equatable, Identifiable {
    var id: String { def }
    let def: String
    let defVi: String
    let example: String

    enum CodingKeys: String, CodingKey {
        case def, example
        case defVi = "def_vi"
    }
}

// MARK: - Quiz (/api/quiz)
struct QuizResponse: Decodable {
    let questions: [QuizQuestion]
    let mode: String?
    let error: String?
}

struct QuizQuestion: Decodable, Identifiable, Equatable {
    let id: String
    let wordId: String
    let prompt: String
    let options: [String]
    let level: String?

    enum CodingKeys: String, CodingKey {
        case id, prompt, options, level
        case wordId = "word_id"
    }
}

struct QuizSubmitRequest: Encodable {
    struct Answer: Encodable {
        let wordId: String
        let given: String
        enum CodingKeys: String, CodingKey {
            case given
            case wordId = "word_id"
        }
    }
    let answers: [String: Answer]
    let mode: String
    let durationMs: Int?

    enum CodingKeys: String, CodingKey {
        case answers, mode
        case durationMs = "duration_ms"
    }
}

struct QuizSubmitResponse: Decodable {
    let result: QuizResult
    let requeuedWords: Int?

    enum CodingKeys: String, CodingKey {
        case result
        case requeuedWords = "requeued_words"
    }
}

struct QuizResult: Decodable, Equatable {
    struct Detail: Decodable, Equatable {
        let correct: Bool
        let given: String?
        let correctAnswer: String?
        enum CodingKeys: String, CodingKey {
            case correct, given
            case correctAnswer = "correct_answer"
        }
    }
    let correct: Int
    let total: Int
    let percent: Int
    let details: [String: Detail]
}

// MARK: - Vòng quay luyện nói (/api/spinner/*)
struct SpinnerTopicsResponse: Decodable {
    let topics: [SpinnerItem]
}

struct SpinnerQuestionsResponse: Decodable {
    let questions: [SpinnerItem]
}

/// Một câu hỏi trong vòng quay — topics dùng `text`+`category`(part1-3),
/// interview có thêm `framework`, deep-talk chỉ có `category`.
struct SpinnerItem: Decodable, Identifiable, Equatable, Hashable {
    let id: Int
    let text: String
    let category: String?
    let framework: String?
}

struct SpinHistoryResponse: Decodable {
    let items: [SpinHistoryItem]
}

struct SpinHistoryItem: Decodable, Identifiable, Equatable {
    let id: Int
    let label: String?
    let spunAt: String?

    enum CodingKeys: String, CodingKey {
        case id, label
        case spunAt = "spun_at"
    }
}

struct VocabSuggestResponse: Decodable {
    let words: [SuggestedWord]
}

struct SuggestedWord: Decodable, Identifiable, Equatable {
    var id: String { word }
    let word: String
    let ipa: String?
    let meaningVi: String?
    let example: String

    enum CodingKeys: String, CodingKey {
        case word, ipa, example
        case meaningVi = "meaning_vi"
    }
}

// MARK: - Từ vựng theo chủ đề (/api/words/by-topic)
struct WordsByTopicResponse: Decodable {
    let words: [TopicWord]
    let total: Int?
    let examCounts: [String: Int]?
    let topicCounts: [String: Int]?
}

struct TopicWord: Decodable, Identifiable, Equatable {
    let id: String
    let word: String
    let pos: String?
    let level: String?
    let defEn: String?
    let exEn: String?
    let phonetic: String?
    let topic: String?
    let topicLabel: String?
    let collocations: [String]?
    let usageNotes: String?

    enum CodingKeys: String, CodingKey {
        case id, word, pos, level, phonetic, topic, topicLabel, collocations
        case defEn = "def_en"
        case exEn = "ex_en"
        case usageNotes = "usage_notes"
    }
}

// MARK: - Email nhắc học (/api/email-preferences, /api/email-slots)
struct EmailPreferencesResponse: Decodable {
    let preferences: EmailPreferences?
}

struct EmailPreferences: Codable, Equatable {
    var enabled: Bool
    var frequency: String     // daily | weekdays | custom
    var customDays: [Int]     // 0=CN … 6=T7 (theo web)

    enum CodingKeys: String, CodingKey {
        case enabled, frequency
        case customDays = "custom_days"
    }
}

struct EmailSlotsResponse: Decodable {
    let slots: [EmailSlot]
}

struct EmailSlot: Decodable, Identifiable, Equatable {
    let id: String
    let sendTime: String

    enum CodingKeys: String, CodingKey {
        case id
        case sendTime = "send_time"
    }

    /// "08:00:00" → "08:00" (Postgres trả kèm giây)
    var displayTime: String { String(sendTime.prefix(5)) }
}

struct EmailSlotResponse: Decodable {
    let slot: EmailSlot
}
