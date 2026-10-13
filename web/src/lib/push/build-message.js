// Từ → message FCM HTTP v1 (chỉ khối apns — chưa có Android).
// Link khớp WidgetDeepLink của iOS: wordly://word?id=…&w=…&m=…&bank=0|1.
// Dùng encodeURIComponent, KHÔNG dùng URLSearchParams: nó mã hoá dấu cách
// thành "+", còn URLComponents của Swift đọc "+" là dấu cộng thật.

const MAX_BODY = 150;
const MAX_TITLE = 100;
// APNs giới hạn payload 4 KB; tiếng Việt mã hoá %XX phình ~9 byte/ký tự. Câu đã
// lưu có thể dài cả đoạn — cắt để không bao giờ vượt (vượt = FCM từ chối mãi
// mãi, vì thuật toán ôn luôn chọn lại đúng câu đó). App mở từ theo id.
const MAX_LINK_WORD = 60;
const MAX_LINK_MEANING = 120;
const EXPIRY_SECONDS = 3600; // máy tắt quá 1 giờ thì bỏ — nhắc trễ vô nghĩa
const EMPTY_BODY = "Chạm để ôn lại từ này";

export function pushLink({ id, word, meaning, fromBank }) {
  const linkId = fromBank ? `bank-${id}` : String(id);
  const enc = (text, max) => encodeURIComponent(Array.from(text ?? "").slice(0, max).join(""));
  return `wordly://word?id=${encodeURIComponent(linkId)}&w=${enc(word, MAX_LINK_WORD)}&m=${enc(meaning, MAX_LINK_MEANING)}&bank=${fromBank ? 1 : 0}`;
}

export function truncate(text, max = MAX_BODY) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function buildPushMessage({ token, word, now = new Date() }) {
  const meaning = (word.meaning || "").trim();
  return {
    token,
    data: { link: pushLink({ ...word, meaning }) },
    apns: {
      headers: {
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(now.getTime() / 1000) + EXPIRY_SECONDS),
      },
      payload: {
        aps: {
          alert: { title: truncate(word.word, MAX_TITLE), body: truncate(meaning || EMPTY_BODY) },
          sound: "default",
          "thread-id": "wordly-review",
        },
      },
    },
  };
}
