import Foundation

/// Logic thuần của màn Dịch — giống web (InlineTranslate.js, dictionary-client.js).
enum TranslateLogic {
    /// Một từ tiếng Anh duy nhất → mới tra từ điển (câu dài thì chỉ dịch).
    static func isSingleWord(_ text: String) -> Bool {
        text.range(of: #"^\s*[a-zA-Z'-]+\s*$"#, options: .regularExpression) != nil
    }

    /// Khoá cache từ điển: " Run " và "run" là một — miss cache là một lượt AI trả phí.
    static func wordKey(_ word: String) -> String {
        word.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Gợi ý từ Datamuse: luôn để đúng từ đang gõ lên đầu, tối đa 8.
    static func orderSuggestions(typed: String, fetched: [String]) -> [String] {
        let exact = wordKey(typed)
        guard fetched.first?.lowercased() != exact else { return Array(fetched.prefix(8)) }
        return Array(([exact] + fetched.filter { $0.lowercased() != exact }).prefix(8))
    }
}

/// Web tự ghi bản dịch vào lịch sử sau 10 giây; mỗi (chiều dịch, câu) chỉ ghi
/// một lần trong phiên. Ghi lỗi thì `forget` để lần sau thử lại.
struct AutoLogTracker {
    private var sent: Set<String> = []

    private func key(_ direction: String, _ text: String) -> String {
        "\(direction)::\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    mutating func shouldLog(direction: String, text: String) -> Bool {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return sent.insert(key(direction, text)).inserted
    }

    mutating func forget(direction: String, text: String) {
        sent.remove(key(direction, text))
    }
}
