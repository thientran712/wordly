// Tra nghĩa từ khi người dùng bấm vào một từ trong bài dịch — phía client.
//
// Vì sao tách khỏi InlineTranslate.js: logic nằm trong component thì không
// test được bằng `node --test`. Theo ghi chú trong CLAUDE.md — tách ra
// src/lib/ rồi test ở đó. File này KHÔNG import gì.

const ENDPOINT = "/api/dictionary";

/**
 * Chuẩn hoá từ làm khoá cache.
 * Không chuẩn hoá thì " Run " và "run" tính là hai từ → gọi API hai lần cho
 * cùng một từ, mỗi lượt cache miss là một lượt AI trả phí.
 */
export function normalizeWordKey(word) {
  return typeof word === "string" ? word.trim().toLowerCase() : "";
}

/**
 * Tra một từ.
 *
 * Trả về { detail, error, notFound, aborted } — KHÔNG bao giờ throw.
 *
 * Vì sao tách `notFound` khỏi `error`: "asdfgh không phải từ tiếng Anh" và
 * "AI đang lỗi" là hai chuyện khác nhau, phải nói khác nhau. Trước đây cả
 * hai đều thành `null` nên khối nghĩa từ biến mất im lặng — người dùng bấm
 * vào từ và không thấy gì xảy ra.
 */
export async function lookupWord(word, { fetchImpl, signal } = {}) {
  const key = normalizeWordKey(word);
  if (!key) return { detail: null, error: null, notFound: true, aborted: false };

  const doFetch = fetchImpl || fetch;

  try {
    const res = await doFetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word: key }),
      signal,
    });

    if (!res.ok) {
      return {
        detail: null,
        notFound: false,
        aborted: false,
        error: res.status === 429
          ? "Bạn tra hơi nhanh, chờ một chút rồi thử lại nhé."
          : "Không tra được nghĩa từ. Thử lại nhé.",
      };
    }

    const data = await res.json();
    if (!data?.detail) {
      // API chủ động trả detail:null khi từ không có trong từ điển
      return { detail: null, error: null, notFound: true, aborted: false };
    }

    return { detail: data.detail, error: null, notFound: false, aborted: false };
  } catch (e) {
    // Người dùng bấm sang từ khác → huỷ request cũ. Không phải lỗi.
    if (e?.name === "AbortError") {
      return { detail: null, error: null, notFound: false, aborted: true };
    }
    return {
      detail: null,
      notFound: false,
      aborted: false,
      error: "Mất kết nối. Kiểm tra mạng rồi thử lại nhé.",
    };
  }
}
