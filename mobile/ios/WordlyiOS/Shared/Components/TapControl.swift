import Foundation

/// Chặn bấm dồn: trong `interval` giây sau một lần bấm được nhận, các lần bấm
/// tiếp theo bị bỏ qua (không gia hạn cửa sổ) — tránh gửi request/phát âm liên tục.
struct TapThrottle {
    let interval: TimeInterval
    private var last: Date?

    init(interval: TimeInterval) { self.interval = interval }

    mutating func allow(at now: Date = Date()) -> Bool {
        if let last, now.timeIntervalSince(last) < interval { return false }
        last = now
        return true
    }
}

/// Một nguồn phát âm tại một thời điểm: đang đọc thì nút khác không nhận,
/// bấm lại đúng nút đang đọc thì dừng.
enum SpeakGate {
    enum Decision: Equatable { case start, stop, ignore }

    static func key(text: String, lang: String) -> String {
        "\(lang)|\(text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    static func decide(requested: String, active: String?) -> Decision {
        guard let active else { return .start }
        return active == requested ? .stop : .ignore
    }
}
