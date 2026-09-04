// Tải nội dung AI cho thẻ từ vựng — phía client.
//
// Vì sao tách khỏi WordCard.js: logic nằm trong component thì không test
// được bằng `node --test`. Theo đúng ghi chú trong CLAUDE.md — tách ra
// src/lib/ rồi test ở đó. File này KHÔNG import gì.

const ENDPOINT = "/api/ai/word-content";

/** Thân request gửi lên API. */
export function buildWordContentBody(word, skillLevel, learningGoal) {
  return {
    word_id: word.id,
    word: word.word,
    pos: word.pos,
    word_level: word.level,
    skill_level: skillLevel || "B1",
    learning_goal: learningGoal || "daily",
  };
}

/**
 * Gọi API lấy nội dung AI.
 *
 * Trả về { content, error, aborted } — KHÔNG bao giờ throw, để component
 * không phải bọc try/catch.
 *
 * Vì sao phân biệt `aborted` với `error`: request bị huỷ là do người học
 * chuyển sang từ khác, không phải lỗi. Hiện thông báo lỗi trong trường hợp
 * đó vừa sai vừa gây hoang mang.
 */
export async function fetchWordContent(word, skillLevel, learningGoal, { fetchImpl, signal } = {}) {
  const doFetch = fetchImpl || fetch;

  try {
    const res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWordContentBody(word, skillLevel, learningGoal)),
      signal,
    });

    if (!res.ok) {
      // 429 là hết lượt, khác hẳn lỗi hệ thống → nói cho đúng để người học
      // biết chờ một chút thay vì tưởng app hỏng.
      return {
        content: null,
        aborted: false,
        error: res.status === 429
          ? "Bạn xem hơi nhanh, chờ một chút rồi thử lại nhé."
          : "Không tải được nghĩa từ AI. Thử lại nhé.",
      };
    }

    const data = await res.json();
    if (!data?.content) {
      return { content: null, aborted: false, error: "Không tải được nghĩa từ AI. Thử lại nhé." };
    }

    return { content: data.content, error: null, aborted: false };
  } catch (e) {
    // Người học chuyển từ khác → huỷ request cũ. Không phải lỗi.
    if (e?.name === "AbortError") {
      return { content: null, error: null, aborted: true };
    }
    return { content: null, aborted: false, error: "Mất kết nối. Kiểm tra mạng rồi thử lại nhé." };
  }
}
