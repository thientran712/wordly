// Giới hạn đầu vào cho /api/practice (chat với Alex).
//
// ═══ VÌ SAO CÓ FILE NÀY ═══
// Route cũ chuyển thẳng mảng `messages` của client vào AI:
//   • Không giới hạn số lượt và độ dài mỗi tin → một request có thể đốt rất
//     nhiều token, lặp lại bao nhiêu lần cũng được.
//   • Client gửi được tin role "system" → ghi đè luật của Alex (prompt
//     injection). System prompt CHỈ được dựng ở server.
// Tách ra lib để test được (logic trong route handler thì không test được).

// 20 tin ≈ 10 lượt hỏi-đáp gần nhất — đủ ngữ cảnh cho Alex nối câu hỏi theo
// câu trả lời trước, vì Alex chỉ nói 1-2 câu mỗi lượt. App iOS và web gửi
// CẢ lịch sử mỗi lần nên phiên dài vẫn chạy bình thường, chỉ "quên" phần cũ.
export const MAX_PRACTICE_TURNS = 20;

// 1.500 ký tự: câu nói của người học hiếm khi quá vài trăm ký tự; bài học
// mini đầu tiên của chế độ học từ (max_tokens 350 ≈ 1.400 ký tự) vẫn lọt
// nguyên. Trần chi phí mỗi request: 20 × 1.500 ≈ 30k ký tự ≈ 7,5k token.
export const MAX_PRACTICE_MESSAGE_CHARS = 1500;

const ALLOWED_ROLES = new Set(["user", "assistant"]);

/**
 * Lọc và cắt mảng tin nhắn client gửi lên trước khi đưa cho AI.
 *
 * Thứ tự xử lý: lọc rác TRƯỚC, rồi mới lấy N tin cuối — để tin rác không
 * chiếm chỗ của hội thoại thật.
 *
 * @returns {{ ok: true, messages: {role, content}[] } | { ok: false, error: string }}
 */
export function sanitizePracticeMessages(messages) {
  if (!Array.isArray(messages)) return { ok: false, error: "Invalid messages" };

  const valid = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    if (!ALLOWED_ROLES.has(m.role)) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    valid.push({ role: m.role, content: m.content.slice(0, MAX_PRACTICE_MESSAGE_CHARS) });
  }

  // Giữ các tin GẦN NHẤT — tin cuối là câu người dùng vừa nói, không được mất
  const recent = valid.slice(-MAX_PRACTICE_TURNS);

  // Hội thoại gửi AI phải mở bằng lượt user: sau khi cắt có thể mở bằng
  // assistant, một số nhà cung cấp (Gemini) không thích điều đó.
  const start = recent.findIndex((m) => m.role === "user");
  if (start === -1) return { ok: false, error: "Invalid messages" };

  return { ok: true, messages: recent.slice(start) };
}
