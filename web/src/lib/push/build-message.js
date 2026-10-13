// Từ → message FCM HTTP v1 (chỉ khối apns — chưa có Android).
// Link khớp WidgetDeepLink của iOS: wordly://word?id=…&w=…&m=…&bank=0|1.
// Dùng encodeURIComponent, KHÔNG dùng URLSearchParams: nó mã hoá dấu cách
// thành "+", còn URLComponents của Swift đọc "+" là dấu cộng thật.

const MAX_BODY = 150;
const EXPIRY_SECONDS = 3600; // máy tắt quá 1 giờ thì bỏ — nhắc trễ vô nghĩa
const EMPTY_BODY = "Chạm để ôn lại từ này";

export function pushLink({ id, word, meaning, fromBank }) {
  const linkId = fromBank ? `bank-${id}` : String(id);
  const enc = encodeURIComponent;
  return `wordly://word?id=${enc(linkId)}&w=${enc(word)}&m=${enc(meaning ?? "")}&bank=${fromBank ? 1 : 0}`;
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
          alert: { title: word.word, body: truncate(meaning || EMPTY_BODY) },
          sound: "default",
          "thread-id": "wordly-review",
        },
      },
    },
  };
}
