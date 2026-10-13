// Câu chữ thông báo nhắc ôn — giọng "bạn thân lầy", xưng mày–tao (chủ dự án
// duyệt 13/10/2026). Tiêu đề luôn có TỪ, nội dung luôn có NGHĨA: liếc thông báo
// là ôn được, câu chọc chỉ là gia vị — dài quá thì bỏ câu chọc, giữ nghĩa.
// Sửa câu ở đây; tests/unit/push-copy.test.mjs kiểm từ/nghĩa, độ dài, từ cấm.
import { truncate } from "./text.js";

const MAX_TITLE = 100;
const MAX_BODY = 150;
const q = (m) => `“${m}”`;

/** Từ đã lưu, đến lúc ôn. */
export const OWN_TEMPLATES = [
  { title: (w) => `👀 Ê, còn nhớ «${w}» không đấy?`, body: (m) => `Đừng bảo tao là quên rồi nha. Nó là ${q(m)} đó.` },
  { title: (w) => `🧠 «${w}» đang bỏ trốn khỏi não mày kìa`, body: (m) => `Túm lại liền: ${q(m)}. Chậm tí là mất.` },
  { title: (w) => `💔 «${w}» nhắn: "Sao lâu rồi không thèm nhìn tao?"`, body: (m) => `Người ta là ${q(m)} mà cũng tủi thân rồi đó.` },
  { title: (w) => `🫵 Kiểm tra miệng: «${w}» là gì?`, body: (m) => `${q(m)}. Đúng thì tự thưởng, sai thì ôn tiếp đi ông.` },
  { title: (w) => `😏 Nhớ người yêu cũ thì giỏi, nhớ «${w}» thì không`, body: (m) => `Nó là ${q(m)}. Giờ thì nhớ chưa?` },
  { title: (w) => `🚨 Báo động: «${w}» sắp bị mày quên`, body: (m) => `Cứu nó bằng 3 giây: ${q(m)}.` },
  { title: (w) => `🤝 Tao với «${w}» đang chờ mày`, body: (m) => `${q(m)}. Nói to một lần cho nhớ.` },
  { title: (w) => `📉 Trí nhớ về «${w}» đang tụt dốc không phanh`, body: (m) => `Kéo lên: ${q(m)}. Xong rồi đó, dễ mà.` },
  { title: (w) => `🙄 Lại là tao, vì mày lại sắp quên «${w}»`, body: (m) => `${q(m)}. Lần này nhớ giùm tao cái.` },
  { title: (w) => `🍜 Ăn gì chưa? Ăn thêm «${w}» cho no chữ`, body: (m) => `${q(m)}. Bổ hơn trà sữa.` },
  { title: (w) => `🕵️ Tao phát hiện mày chưa ôn «${w}»`, body: (m) => `${q(m)}. Ôn liền thì tao giữ bí mật.` },
  { title: (w) => `🔁 «${w}» quay lại đòi nợ`, body: (m) => `Nợ gì? Nợ nhớ: ${q(m)}. Trả đi.` },
];

/** Từ mới trong kho (người dùng chưa lưu). */
export const BANK_TEMPLATES = [
  { title: (w) => `🎁 Tặng mày 1 từ, khỏi cảm ơn: «${w}»`, body: (m) => `${q(m)}. Thử chém trong câu hôm nay xem.` },
  { title: (w) => `🔥 Từ mới nóng hổi: «${w}»`, body: (m) => `${q(m)}. Học xong là xịn hơn hôm qua 1%.` },
  { title: (w) => `😎 Muốn nói tiếng Anh ngầu hơn? Xài «${w}»`, body: (m) => `${q(m)}. Nói một lần là người ta nể.` },
  { title: (w) => `🎯 Hôm nay mục tiêu nhỏ thôi: «${w}»`, body: (m) => `${q(m)}. Một ngày một từ, một năm 365 từ.` },
  { title: (w) => `🧃 Uống miếng nước rồi nạp «${w}»`, body: (m) => `${q(m)}. Nhẹ như không.` },
  { title: (w) => `📦 Có hàng mới về: «${w}»`, body: (m) => `${q(m)}. Free ship tận não.` },
  { title: (w) => `👂 Nghe nè: «${w}»`, body: (m) => `Nghĩa là ${q(m)}. Mai tao hỏi lại đó.` },
  { title: (w) => `🌱 Gieo hạt «${w}» vào đầu mày`, body: (m) => `${q(m)}. Tưới thêm vài lần là mọc.` },
  { title: (w) => `🏋️ Tập gym cho não: 1 rep «${w}»`, body: (m) => `${q(m)}. Đủ cho hôm nay rồi.` },
  { title: (w) => `💡 Mày biết «${w}» chưa?`, body: (m) => `${q(m)}. Giờ thì biết rồi, khỏi cảm ơn.` },
];

/** Lầy được, chạm tự ái thì không (so theo từ, xem test). */
export const FORBIDDEN = ["ngu", "dốt", "đần", "óc chó", "đm", "vcl", "vl", "đéo", "địt", "cút"];

const EMPTY_MEANING_BODY = "Chạm vô coi nghĩa liền 👀";

function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

/** Mẫu cho (khung giờ, ngày): xoay vòng theo ngày → cùng khung giờ không lặp
 * mẫu trong n ngày liên tiếp; các khung khác nhau lệch nhau theo hash. */
export function templateIndex(seed, now, n) {
  const day = Math.floor(now.getTime() / 86_400_000);
  return (hash(seed) + day) % n;
}

export function pushCopy({ word, meaning, fromBank, seed, now = new Date() }) {
  const list = fromBank ? BANK_TEMPLATES : OWN_TEMPLATES;
  const t = list[templateIndex(seed, now, list.length)];
  const m = (meaning || "").trim();

  const fancyTitle = t.title(word);
  const title = Array.from(fancyTitle).length <= MAX_TITLE ? fancyTitle : truncate(word, MAX_TITLE);

  let body;
  if (!m) body = EMPTY_MEANING_BODY;
  else {
    const fancyBody = t.body(m);
    body = Array.from(fancyBody).length <= MAX_BODY ? fancyBody : truncate(m, MAX_BODY);
  }
  return { title, body };
}
