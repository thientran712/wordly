import XCTest
@testable import Wordly

// Luyện nói với Alex theo một từ — giống web /practice?word=… .
final class PracticeLogicTests: XCTestCase {
    func testWordKickoffMatchesWebPrompt() {
        let k = PracticeLogic.kickoff(word: "resilient")
        XCTAssertTrue(k.contains("teach me the word \"resilient\""))
        XCTAssertTrue(k.contains("example sentence"))
    }

    func testPlaceholderTitle() {
        XCTAssertEqual(PracticeLogic.placeholderTitle(word: "resilient", date: Date()), "\"resilient\"")
        XCTAssertTrue(PracticeLogic.placeholderTitle(word: nil, date: Date()).hasPrefix("Conversation "))
    }

    // Web: chỉ tạo phiên trong DB khi người dùng gửi tin nhắn THẬT đầu tiên —
    // xem lời chào rồi rời đi thì không để lại cuộc trò chuyện rác.
    func testCreateSessionOnlyOnFirstRealMessage() {
        XCTAssertTrue(PracticeLogic.needsSessionOnSend(activeSessionId: nil))
        XCTAssertFalse(PracticeLogic.needsSessionOnSend(activeSessionId: "s1"))
    }

    // Tiêu đề tự sinh sau lượt trao đổi đầu tiên (user + Alex), chỉ một lần
    func testGenerateTitleAfterFirstExchangeOnly() {
        let u = ChatMessage(role: "user", content: "hi"), a = ChatMessage(role: "assistant", content: "hello")
        XCTAssertFalse(PracticeLogic.shouldGenerateTitle(messages: [u]))
        XCTAssertTrue(PracticeLogic.shouldGenerateTitle(messages: [u, a]))
        XCTAssertTrue(PracticeLogic.shouldGenerateTitle(messages: [u, a, u, a]))  // phiên theo từ: kickoff + lời chào + lượt đầu
        XCTAssertFalse(PracticeLogic.shouldGenerateTitle(messages: [u, a, u, a, u, a]))
    }

    func testPracticeRequestEncodesWord() throws {
        let body = PracticeRequest(messages: [], vocabularyContext: true, word: "resilient")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        XCTAssertEqual(json?["word"] as? String, "resilient")
    }

    func testCreateSessionRequestEncodesWordId() throws {
        let body = CreateSessionRequest(title: "t", messages: [], wordId: "w1")
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any]
        XCTAssertEqual(json?["word_id"] as? String, "w1")
    }
}
