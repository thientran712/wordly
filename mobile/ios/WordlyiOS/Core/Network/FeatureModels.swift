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
    let classId: String?
    let durationMs: Int?

    enum CodingKeys: String, CodingKey {
        case answers, mode
        case classId = "class_id"
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

// MARK: - Trung tâm + lớp học
struct OrgsResponse: Decodable {
    let orgs: [Org]
}

struct Org: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let role: String?
}

struct ClassesResponse: Decodable {
    let classes: [ClassInfo]
    let role: String?
}

struct ClassInfo: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String?
    let memberCount: Int?

    enum CodingKeys: String, CodingKey {
        case id, name, description
        case memberCount = "member_count"
    }
}

struct JoinClassResponse: Decodable {
    let ok: Bool
    let classId: String?
    let className: String?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case ok, error
        case classId = "class_id"
        case className = "class_name"
    }
}

// MARK: - Bài tập (/api/homework)
struct HomeworkListResponse: Decodable {
    let homework: [Homework]
}

struct Homework: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let instructions: String?
    let questions: [HomeworkQuestion]
    let totalPoints: Int?
    let dueAt: String?
    let allowLate: Bool?
    let status: String?
    let mySubmission: HomeworkSubmission?

    enum CodingKeys: String, CodingKey {
        case id, title, instructions, questions, status
        case totalPoints = "total_points"
        case dueAt = "due_at"
        case allowLate = "allow_late"
        case mySubmission = "my_submission"
    }
}

struct HomeworkQuestion: Decodable, Identifiable, Equatable {
    struct Pairs: Decodable, Equatable {
        let lefts: [String]
        let rights: [String]
    }
    let id: String
    let type: String          // mcq | fill | essay | match
    let points: Int?
    let prompt: String
    let options: [String]?
    let pairs: Pairs?
}

struct HomeworkSubmission: Decodable, Equatable {
    let status: String        // draft | submitted | graded
    let totalScore: Double?
    let submittedAt: String?
    let isLate: Bool?

    enum CodingKeys: String, CodingKey {
        case status
        case totalScore = "total_score"
        case submittedAt = "submitted_at"
        case isLate = "is_late"
    }
}

/// Câu trả lời gửi lên — đúng định dạng web: mcq là index, fill/essay là chữ,
/// match là map { trái: phải }.
enum HomeworkAnswer: Encodable, Equatable {
    case choice(Int)
    case text(String)
    case pairs([String: String])

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .choice(let i): try c.encode(i)
        case .text(let s): try c.encode(s)
        case .pairs(let m): try c.encode(m)
        }
    }
}

struct HomeworkSubmitRequest: Encodable {
    let answers: [String: HomeworkAnswer]
    let draft: Bool
}

struct HomeworkSubmitResponse: Decodable {
    struct Result: Decodable, Equatable {
        struct Detail: Decodable, Equatable { let correct: Bool? }
        let autoScore: Double?
        let autoMax: Double?
        let manualMax: Double?
        let needsManual: Bool?
        let totalPoints: Double?
        let details: [String: Detail]?

        enum CodingKeys: String, CodingKey {
            case details
            case autoScore = "auto_score"
            case autoMax = "auto_max"
            case manualMax = "manual_max"
            case needsManual = "needs_manual"
            case totalPoints = "total_points"
        }
    }
    let result: Result?
}

// MARK: - Buổi học + tài liệu
struct ClassSessionsResponse: Decodable {
    let sessions: [ClassSession]
}

struct ClassSession: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let notes: String?
    let sessionDate: String?
    let lessonMaterials: [LessonMaterial]

    enum CodingKeys: String, CodingKey {
        case id, title, notes
        case sessionDate = "session_date"
        case lessonMaterials = "lesson_materials"
    }
}

struct LessonMaterial: Decodable, Identifiable, Equatable {
    let id: String
    let kind: String          // file | link | video
    let title: String
    let description: String?
    let mimeType: String?
    let sizeBytes: Int?

    enum CodingKeys: String, CodingKey {
        case id, kind, title, description
        case mimeType = "mime_type"
        case sizeBytes = "size_bytes"
    }
}

struct MaterialURLResponse: Decodable {
    let url: String
    let kind: String?
}

// MARK: - Bài nói (/api/speaking)
struct SpeakingListResponse: Decodable {
    let prompts: [SpeakingPrompt]
}

struct SpeakingPrompt: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let promptText: String
    let maxSeconds: Int
    let dueAt: String?
    let status: String?
    let mySubmission: SpeakingSubmission?

    enum CodingKeys: String, CodingKey {
        case id, title, status
        case promptText = "prompt_text"
        case maxSeconds = "max_seconds"
        case dueAt = "due_at"
        case mySubmission = "my_submission"
    }
}

struct SpeakingSubmission: Decodable, Equatable {
    let status: String
    let scoreOverall: Double?
    let submittedAt: String?
    let isLate: Bool?
    let feedback: String?

    enum CodingKeys: String, CodingKey {
        case status, feedback
        case scoreOverall = "score_overall"
        case submittedAt = "submitted_at"
        case isLate = "is_late"
    }
}

struct SpeakingUploadURLResponse: Decodable {
    let uploadUrl: String
    let storagePath: String

    enum CodingKeys: String, CodingKey {
        case uploadUrl = "upload_url"
        case storagePath = "storage_path"
    }
}

// MARK: - Tiến độ của tôi trong lớp
struct ClassProgressResponse: Decodable {
    struct ClassRef: Decodable { let id: String; let name: String }
    struct Student: Decodable, Equatable {
        let wordsSaved: Int?
        let wordsDue: Int?
        let streakDays: Int?
        let lastActiveAt: String?
        let state: String?

        enum CodingKeys: String, CodingKey {
            case state
            case wordsSaved = "words_saved"
            case wordsDue = "words_due"
            case streakDays = "streak_days"
            case lastActiveAt = "last_active_at"
        }
    }
    let `class`: ClassRef
    let students: [Student]

    var className: String { `class`.name }
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
