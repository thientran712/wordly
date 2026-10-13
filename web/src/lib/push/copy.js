// Câu chữ thông báo nhắc ôn — giọng "bạn thân lầy, bựa", xưng mày–tao (chủ
// dự án duyệt 13/10/2026, bản v2). Màn hình khoá chỉ cho TIÊU ĐỀ 1 dòng (dài là
// bị "…"), nên tiêu đề = câu gọi ngắn ≤ 16 ký tự. Nội dung = MỘT câu chọc có
// lồng từ ({w}), xen kẽ theo ngày giữa 2 kiểu:
//   Đố   — giấu nghĩa, hỏi có nhớ không (chạm vô mới thấy nghĩa)
//   Khoe — nghĩa nằm ngay trong câu: "{w} là {m}"
// Câu đánh dấu "trend" dùng meme mạng — hết hot thì thay. KHÔNG dùng tên người
// thật. Sửa câu ở đây; tests/unit/push-copy.test.mjs kiểm độ dài, từ cấm, emoji.
import { truncate } from "./text.js";

const MAX_BODY = 150;
const MAX_INLINE_WORD = 30; // dài hơn (câu đã lưu) → mẫu đặt từ ở cuối
const MAX_INLINE_MEANING = 40; // nghĩa đầu dài hơn → chỉ đố, không khoe

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
  // trend
  "🆘 Ét o ét!",
  "📞 Ủa alo?",
  "🔥 Công chuyện!",
  "🫢 Biến căng",
  "🤐 Nín!",
  "📝 Kiểm tra miệng",
  "🍚 Cơm nước chưa",
];

/** Đố — dùng cho mọi từ. */
export const QUIZ = [
  "Cá 10k là mày quên {w} rồi. Vô chứng minh tao sai đi 😏",
  "Còn nhớ {w} không, hay nó theo người yêu cũ đi luôn rồi?",
  "Crush còn nhớ tên mày, mày có nhớ {w} không?",
  "Quên {w} nữa là tao đăng story bóc phốt đó 📸",
  "Lên bảng! Kiểm tra miệng: {w} 👩‍🏫",
  "Mẹ hỏi {w} là gì kìa. Trả lời hay để tao mách?",
  "Đố mày {w}. Trả lời trong đầu thôi, không ai biết đâu 🤫",
  "{w} sắp bị não mày xoá vĩnh viễn. Cứu không?",
  // trend
  "Ét o ét! {w} đang bị não mày xoá sổ, cứu liền!",
  "{w} nghĩa là gì? Đúng nhận sai cãi, vô coi đáp án 🔮",
  "Nhớ {w} không? Không nhớ là còn cái nịt đó nha.",
  "{w} nghĩa là gì? Ai sợ thì đi về 😤",
  "Hey Siri, tua về lúc mày còn nhớ {w} đi 🙃",
  "{w} là gì? Khum biết thì vô học, đừng giả bộ 🙄",
  "Ủa alo? {w} gọi mày 3 cuộc nhỡ rồi đó 📞",
  "Nín! Nghĩ xem {w} là gì rồi hẵng bấm 🤐",
];

/** Đố — chỉ cho từ người dùng ĐÃ LƯU (câu nhắc chuyện "lưu"). */
export const QUIZ_OWN = [
  "Mày lưu {w} rồi bỏ đó. Nó buồn lắm đó 💔",
  // trend
  "Lưu {w} xong bỏ xó luôn, báo thủ vừa thôi 😮‍💨",
  "Mắc cỡ quá 2 ơi, lưu {w} mà quên nghĩa 🫣",
];

/** Khoe — nghĩa nằm trong câu. */
export const SHOW = [
  "{w} là {m}. Ghi nhớ giùm, mai tao hỏi bài.",
  "Bóc phốt: {w} hoá ra là {m} 😱",
  "Xin vía học giỏi: {w} là {m} 🙏",
  "{w} là {m}. Học vậy thôi, nhẹ như lông hồng.",
  // trend
  "{w} nghĩa là {m}. Biết rồi là out trình đám bạn 😎",
  "Plot twist: {w} nghĩa là {m}. Tuyệt đối điện ảnh 🎬",
  "{w} là {m}. Nhớ chưa? Chưa là còn cái nịt.",
  "Cơm nước gì chưa người đẹp? Ăn thêm món này: {w} là {m} 🍚",
  "Dân Zalo mới không biết {w} là {m}. Giờ mày biết rồi đó.",
  "Tin nóng: {w} tức là {m}. Đỉnh nóc kịch trần 🔥",
];

/** Từ dài (câu đã lưu): để từ ở CUỐI — chèn giữa câu đọc rối, cắt thì mất đuôi câu chọc. */
export const LONG_QUIZ = [
  "Câu này mày còn nhớ nghĩa không: {w}",
  "Đố mày dịch câu này 🤫 {w}",
];
export const LONG_SHOW = [
  "Nhớ câu này nha, nghĩa là {m}: {w}",
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

/** "kiên cường, mau phục hồi" → "kiên cường" — câu khoe chỉ chứa nổi một nghĩa. */
export function firstMeaning(meaning) {
  return String(meaning ?? "").split(/[;,\n]/)[0].trim();
}

const fill = (t, w, m = "") => t.replaceAll("{w}", w).replaceAll("{m}", m);
const pick = (list, seed, now) => list[templateIndex(seed, now, list.length)];

export function pushCopy({ word, meaning, fromBank, seed, now = new Date() }) {
  const title = pick(TITLES, seed, now);
  const w = String(word ?? "").trim();
  const m = firstMeaning(meaning);
  const canShow = m.length > 0 && Array.from(m).length <= MAX_INLINE_MEANING;
  const show = canShow && templateIndex(`${seed}:mode`, now, 2) === 1;

  let template;
  if (Array.from(w).length > MAX_INLINE_WORD) {
    template = pick(show ? LONG_SHOW : LONG_QUIZ, `${seed}:q`, now);
  } else {
    template = pick(show ? SHOW : fromBank ? QUIZ : [...QUIZ, ...QUIZ_OWN], `${seed}:q`, now);
  }
  return { title, body: truncate(fill(template, w, m), MAX_BODY) };
}
