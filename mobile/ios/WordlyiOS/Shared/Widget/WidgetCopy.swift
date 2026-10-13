import Foundation

/// Câu chữ widget giọng "bạn thân lầy", xưng mày–tao (chủ dự án duyệt
/// 13/10/2026, cùng giọng với thông báo push — web/src/lib/push/copy.js).
/// Dùng chung app + widget extension. Từ và nghĩa luôn giữ nguyên; câu chọc chỉ
/// thay chỗ câu có sẵn hoặc thêm một dòng nhỏ khi còn chỗ.
enum WidgetCopy {
    /// Thay "Nghĩa là gì nhỉ? 🤔" khi người dùng tắt hiện nghĩa — từ đã hiện to
    /// phía trên nên câu không cần lặp lại từ. Có meme trend (bản v2), hết hot thì thay.
    static let hiddenMeaningPrompts = [
        "Nghĩa là gì? Cá 10k mày quên 😏",
        "Đúng nhận sai cãi, bấm vô coi 🔮",
        "Khum biết thì bấm vô học 🙄",
        "Nín! Nghĩ 3 giây rồi bấm 🤐",
        "Quên là còn cái nịt đó nha 🫠",
        "Ai sợ thì đi về, ai nhớ thì nói 😤",
        "Ét o ét! Nó sắp bay khỏi não 🆘",
        "Mẹ hỏi nghĩa kìa, trả lời đi 👀",
        "Crush nhớ tên mày, mày nhớ nó không? 💔",
        "Đố mày đó, nghĩ trong đầu thôi 🤫",
    ]

    /// Dòng chọc nhỏ dưới nghĩa (widget màn hình chính) — ≤ 28 ký tự, một dòng
    static let taglines = [
        "🆘 Ét o ét, nhớ giùm!",
        "🔮 Đúng nhận sai cãi",
        "🫠 Quên là còn cái nịt",
        "😤 Ai sợ thì đi về",
        "📞 Ủa alo, nhớ chưa?",
        "🤐 Nín, học đi!",
        "😎 Biết rồi là out trình",
        "🎬 Tuyệt đối điện ảnh",
        "🔥 Đỉnh nóc kịch trần",
        "🫣 Mắc cỡ quá 2 ơi",
        "🙏 Xin vía học giỏi",
        "💸 Cá 10k mày quên",
        "📸 Quên là tao bóc phốt",
        "💔 Nhớ nó hơn người yêu cũ",
    ]

    /// Icon rải lộn xộn trên widget màn hình chính (mờ, quanh mép)
    static let scatterEmoji = ["✨", "🔥", "💥", "🧠", "📚", "⭐", "💫", "🎯", "🫠", "😎", "🤯", "🎉", "🍀", "⚡", "💡", "🌀"]

    struct ScatterIcon: Equatable {
        let emoji: String
        /// Vị trí theo tỉ lệ khung widget (0…1)
        let x: Double
        let y: Double
        let rotation: Double
        let size: Double
    }

    /// Chỗ đặt icon: sát mép để ít đè chữ (chữ có thể căn trái/giữa/phải)
    private static let scatterAnchors: [(Double, Double)] = [
        (0.93, 0.10), (0.68, 0.05), (0.96, 0.48), (0.90, 0.90),
        (0.62, 0.95), (0.32, 0.95), (0.05, 0.92), (0.40, 0.04),
    ]

    /// 4 icon theo id từ: cùng từ → cùng bố cục, không lặp emoji/chỗ.
    static func scatter(seed: String, count: Int = 4) -> [ScatterIcon] {
        var rng = stableHash("scatter:" + seed) | 1
        func next(_ n: Int) -> Int {
            rng = rng &* 6364136223846793005 &+ 1442695040888963407
            return Int((rng >> 33) % UInt64(n))
        }
        var emoji = scatterEmoji
        var anchors = scatterAnchors
        return (0..<min(count, anchors.count)).map { _ in
            let e = emoji.remove(at: next(emoji.count))
            let a = anchors.remove(at: next(anchors.count))
            return ScatterIcon(emoji: e, x: a.0, y: a.1,
                               rotation: Double(next(61) - 30), size: Double(14 + next(11)))
        }
    }

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
