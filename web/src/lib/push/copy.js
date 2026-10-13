// Câu chữ thông báo nhắc ôn — giọng "bạn thân lầy", xưng mày–tao (chủ dự án
// duyệt 13/10/2026). Màn hình khoá chỉ cho TIÊU ĐỀ 1 dòng (dài là bị "…"), nên:
//   tiêu đề = câu gọi ngắn ≤ 16 ký tự
//   nội dung dòng 1 = «từ» = “nghĩa”  ← liếc là ôn, kể cả khi thông báo thu gọn
//   nội dung dòng 2 = câu chọc        ← dài quá thì bỏ, không bao giờ cắt nghĩa
// Sửa câu ở đây; tests/unit/push-copy.test.mjs kiểm độ dài, từ cấm, emoji.
import { truncate } from "./text.js";

const MAX_BODY = 150;

export const TITLES = [
  "👋 Tao nữa nè",
  "😎 Bố mày đây",
  "🫵 Ê mày!",
  "🔔 Ting ting!",
  "📣 Có biến!",
  "👀 Nhìn đây nè",
  "⏰ Tới giờ rồi",
  "🤝 Tao nhắc nè",
  "🧠 Giờ ôn bài",
  "🍵 Nghỉ tay tí",
  "🚨 Báo động!",
  "🙋 Lại là tao",
];

/** Từ đã lưu, đến lúc ôn. */
export const OWN_QUIPS = [
  "Còn nhớ không đấy? Đừng bảo tao quên rồi nha.",
  "Nó đang bỏ trốn khỏi não mày kìa, túm lại liền.",
  "Nhớ người yêu cũ thì giỏi, nhớ cái này thì không 😏",
  "Đúng thì tự thưởng, sai thì ôn tiếp đi ông.",
  "Cứu nó bằng 3 giây thôi, dễ mà.",
  "Nói to một lần cho nhớ đi.",
  "Trí nhớ đang tụt dốc, kéo lên giùm cái.",
  "Lần này nhớ giùm tao cái 🙏",
  "Bổ hơn trà sữa, nạp đi.",
  "Ôn liền thì tao giữ bí mật 🤫",
  "Nợ nhớ đó, trả đi.",
  "Nó nhắn: sao lâu rồi không thèm nhìn tao 💔",
];

/** Từ mới trong kho (người dùng chưa lưu). */
export const BANK_QUIPS = [
  "Tặng mày đó, khỏi cảm ơn 🎁",
  "Học xong là xịn hơn hôm qua 1%.",
  "Nói một lần là người ta nể 😎",
  "Một ngày một từ, một năm 365 từ.",
  "Nhẹ như không, nạp đi.",
  "Hàng mới về, free ship tận não 📦",
  "Mai tao hỏi lại đó.",
  "Tưới thêm vài lần là mọc 🌱",
  "Tập gym cho não, 1 rep là đủ.",
  "Thử chém trong câu hôm nay xem.",
];

/** Lầy được, chạm tự ái thì không (so theo từ, xem test). */
export const FORBIDDEN = ["ngu", "dốt", "đần", "óc chó", "đm", "vcl", "vl", "đéo", "địt", "cút"];

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** Xoay vòng theo ngày → cùng khung giờ không lặp trong n ngày liên tiếp;
 * các khung khác nhau lệch nhau theo hash. */
export function templateIndex(seed, now, n) {
  const day = Math.floor(now.getTime() / 86_400_000);
  return (hash(seed) + day) % n;
}

export function pushCopy({ word, meaning, fromBank, seed, now = new Date() }) {
  const title = TITLES[templateIndex(seed, now, TITLES.length)];
  const m = (meaning || "").trim();
  if (!m) return { title, body: truncate(`«${word}» — chạm vô coi nghĩa liền 👀`, MAX_BODY) };

  const quips = fromBank ? BANK_QUIPS : OWN_QUIPS;
  const quip = quips[templateIndex(`${seed}:q`, now, quips.length)];
  const line1 = `«${word}» = “${m}”`;
  const full = `${line1}\n${quip}`;
  if (Array.from(full).length <= MAX_BODY) return { title, body: full };
  return { title, body: truncate(line1, MAX_BODY) };
}
