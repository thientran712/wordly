import Foundation

/// Câu chữ widget giọng "bạn thân lầy", xưng mày–tao (chủ dự án duyệt
/// 13/10/2026, cùng giọng với thông báo push — web/src/lib/push/copy.js).
/// Dùng chung app + widget extension. Từ và nghĩa luôn giữ nguyên; câu chọc chỉ
/// thay chỗ câu có sẵn hoặc thêm một dòng nhỏ khi còn chỗ.
enum WidgetCopy {
    /// Thay "Nghĩa là gì nhỉ? 🤔" khi người dùng tắt hiện nghĩa
    static let hiddenMeaningPrompts = [
        "Nghĩa là gì, mày nhớ không? 👀",
        "Đoán đi rồi bấm vô check 😏",
        "Quên rồi đúng không? Bấm vô coi 🫵",
        "Nghĩ 3 giây rồi bấm vô 🧠",
        "Tao cá là mày nhớ mà 😌",
        "Nói to nghĩa lên coi 📣",
    ]

    /// Dòng chọc nhỏ dưới nghĩa (widget màn hình chính) — ≤ 28 ký tự, một dòng
    static let taglines = [
        "👀 Nhớ chưa đấy?",
        "🧠 Nạp vô não liền",
        "😏 Đừng có quên nha",
        "🔁 Ôn lại phát cho chắc",
        "💪 Một ngày một từ",
        "🫵 Đọc to lên coi",
        "🍜 Bổ hơn trà sữa",
        "🤝 Tao nhắc rồi đó",
        "🎯 Nhớ cái này là xịn",
        "📦 Hàng mới cho não",
    ]

    static let restingTitle = "🌙 Giờ nghỉ, tao đi ngủ đây"
    static let restingSubtitle = "Tới giờ học tao quay lại liền"
    static let emptyTitle = "📖 Lưu từ đi"
    static let emptySubtitle = "Lưu vài từ trong app rồi tao nhắc cho"
    static let signedOutTitle = "👋 Đăng nhập đi"
    static let signedOutSubtitle = "Tao chờ mày nãy giờ đó"
    static let inlineEmpty = "📖 Lưu từ đi rồi tao nhắc"
    static let inlineResting = "🌙 Giờ nghỉ, mai học tiếp"
    static let inlineSignedOut = "👋 Đăng nhập Wordly đi"
    /// Widget màn hình chính trống: đã có emoji to phía trên nên câu không kèm emoji
    static let homeSignedOut = "Đăng nhập đi, tao chờ mày nãy giờ"
    static let homeResting = "Giờ nghỉ, tới giờ học tao quay lại"
    static let homeEmpty = "Lưu vài từ trong app rồi tao nhắc cho"

    /// Chọn câu theo id từ: cùng từ → cùng câu (không nhảy câu mỗi lần widget
    /// vẽ lại), từ khác → câu khác.
    static func pick(_ list: [String], seed: String) -> String {
        list[Int(stableHash(seed) % UInt64(list.count))]
    }

    /// Hash ổn định giữa các tiến trình (Swift `hashValue` đổi mỗi lần chạy).
    static func stableHash(_ s: String) -> UInt64 {
        s.unicodeScalars.reduce(UInt64(0)) { $0 &* 31 &+ UInt64($1.value) }
    }

    /// Còn chỗ cho dòng chọc không — nghĩa dài thì ẩn, không bao giờ cắt nghĩa.
    static func showsTagline(word: String, meaning: String, medium: Bool) -> Bool {
        medium ? word.count <= 30 && meaning.count <= 80
               : word.count <= 14 && meaning.count <= 35
    }
}
