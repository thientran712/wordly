import Foundation
import Supabase

/// Từ trong kho 7.5k từ (bảng `words`, ai cũng đọc được — RLS "viewable by
/// everyone") để trộn với từ đã lưu trên widget. Cùng quy tắc với email trên web
/// (web/src/lib/email/select-word-for-email.js): trình độ hiện tại + một bậc trên.
/// Production chưa có cột `words.def_vi` → nghĩa hiển thị là định nghĩa tiếng
/// Anh (`def_en`). Mỗi ngày một lô mới.
enum BankWords {
    static let batch = 30
    private static let cefr = ["A1", "A2", "B1", "B2", "C1", "C2"]

    static func levels(for skill: String?) -> [String] {
        let i = skill.flatMap { cefr.firstIndex(of: $0) } ?? cefr.firstIndex(of: "B1")!
        return Array(cefr[i..<min(i + 2, cefr.count)])
    }

    static func needsRefresh(fetchedAt: Date?, level: String?, lastLevel: String?, now: Date = Date()) -> Bool {
        guard let fetchedAt else { return true }
        if level != lastLevel { return true }
        return now.timeIntervalSince(fetchedAt) >= 24 * 3600
    }

    /// Vị trí bắt đầu của lô trong ngày `day` — khác nhau mỗi ngày, luôn trong khoảng.
    static func offset(total: Int, batch: Int, day: Int) -> Int {
        let maxOffset = max(0, total - batch)
        guard maxOffset > 0 else { return 0 }
        var rng = SeededRandom(seed: UInt64(truncatingIfNeeded: day) &+ 0xA5A5)
        return Int.random(in: 0...maxOffset, using: &rng)
    }

    private struct Row: Decodable {
        let id: String
        let word: String
        let def_en: String?
    }

    /// Tải lô từ kho cho trình độ `skill`. Lỗi mạng → ném lỗi, bên gọi giữ lô cũ.
    static func fetch(skill: String?, now: Date = Date()) async throws -> [WidgetWordItem] {
        let client = await MainActor.run { AuthManager.shared.supabase }
        let levels = levels(for: skill)
        let total = try await client.from("words")
            .select("id", head: true, count: .exact)
            .neq("def_en", value: "")
            .in("level", values: levels)
            .execute().count ?? 0
        guard total > 0 else { return [] }

        let day = Int(now.timeIntervalSince1970 / 86_400)
        let from = offset(total: total, batch: batch, day: day)
        let rows: [Row] = try await client.from("words")
            .select("id, word, def_en")
            .neq("def_en", value: "")
            .in("level", values: levels)
            .order("frequency_rank", ascending: true, nullsFirst: false)
            .range(from: from, to: from + batch - 1)
            .execute().value
        return rows.compactMap { r in
            let meaning = (r.def_en ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !meaning.isEmpty else { return nil }
            // Kho lưu "Add", "Advice" → hiện chữ thường như từ người dùng tra
            return WidgetWordItem(id: "bank-\(r.id)", word: r.word.lowercased(), meaning: meaning, isSaved: false, fromBank: true)
        }
    }
}
