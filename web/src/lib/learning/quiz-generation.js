// Sinh câu hỏi quiz từ kho từ vựng — logic thuần, test được không cần DB.
// Xem tests/unit/quiz-generation.test.mjs (19 ca).
//
// Quiz dùng lại kho 7.5k từ sẵn có (words + word_layers) nên không phải
// soạn nội dung mới — chi phí gần bằng 0, đúng tinh thần tận dụng tài sản
// đã có của Wordly.

import { normalizeWord } from "../email/select-word-for-email.js";

export const QUIZ_MODES = ["en_to_vi", "vi_to_en"];
/** Dưới số từ này quiz 4 đáp án vô nghĩa — app báo "Lưu thêm X từ". */
export const MIN_QUIZ_WORDS = 4;
/** Khớp app (TranslateLogic.canSaveForReview): câu dài không vào quiz. */
const MAX_WORDS = 6;
const MAX_CHARS = 60;
const DAY = 24 * 60 * 60 * 1000;

const OPTIONS_PER_QUESTION = 4;
const DISTRACTORS_NEEDED = OPTIONS_PER_QUESTION - 1;

/** Xáo trộn Fisher-Yates trên bản sao — không sửa mảng gốc. */
function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Chọn từ nhiễu (đáp án sai) cho một câu hỏi.
 *
 * QUAN TRỌNG: không bao giờ trả về chính từ đúng — nếu lọt thì câu hỏi có
 * hai đáp án đúng và học viên bị chấm sai oan.
 */
export function pickDistractors(words, correctWordId, count = DISTRACTORS_NEEDED) {
  if (!Array.isArray(words) || words.length === 0) return [];
  const pool = words.filter((w) => w?.id !== correctWordId);
  return shuffle(pool).slice(0, count);
}

/**
 * Đáp án nhiễu cho một câu: bỏ từ có CÙNG nghĩa/cùng chữ với câu hỏi (nếu
 * không câu hỏi có 2 đáp án đúng, ví dụ "lớn" → big / large), rồi ưu tiên
 * đáp án dài gần bằng đáp án đúng — đáp án dài lạc loài là lộ ngay.
 */
function distractorsFor(word, usable, mode) {
  const correct = normalizeWord(answerTextFor(word, mode));
  const prompt = normalizeWord(promptTextFor(word, mode));
  const len = answerTextFor(word, mode).length;
  const seen = new Set([correct]);
  const candidates = [];
  for (const w of shuffle(usable)) {
    if (w.id === word.id || normalizeWord(promptTextFor(w, mode)) === prompt) continue;
    const text = answerTextFor(w, mode);
    const key = normalizeWord(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(text);
  }
  // Lấy trong nhóm gần độ dài nhất (rộng hơn số cần một chút để vẫn ngẫu nhiên)
  const nearest = candidates
    .sort((a, b) => Math.abs(a.length - len) - Math.abs(b.length - len))
    .slice(0, DISTRACTORS_NEEDED + 1);
  return shuffle(nearest).slice(0, DISTRACTORS_NEEDED);
}

/**
 * Dòng translate_history đã lưu → từ cho quiz. Hai chiều dịch đều dùng được
 * (VI→EN thì từ tiếng Anh là bản dịch). Câu dài / thiếu chữ → null.
 */
export function savedRowToQuizWord(row) {
  if (!row?.id) return null;
  const source = (row.source_text || "").trim();
  const translated = (row.translated_text || "").trim();
  const viToEn = row.direction === "VI→EN";
  const word = viToEn ? translated : source;
  const def_vi = viToEn ? source : translated;
  if (!word || !def_vi) return null;
  if (word.length > MAX_CHARS || word.split(/\s+/).length > MAX_WORDS) return null;
  return { id: row.id, word, def_vi, state: row.state ?? null, due_at: row.due_at ?? null };
}

/** Bỏ từ trùng ("Run" / "run"), giữ dòng đầu (mới lưu nhất). */
export function dedupeQuizWords(words) {
  const seen = new Set();
  return (words || []).filter((w) => {
    const key = normalizeWord(w?.word);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Còn thiếu bao nhiêu từ để làm được quiz. */
export function quizShortfall(usableCount) {
  return Math.max(0, MIN_QUIZ_WORDS - usableCount);
}

function isDue(w, t) {
  return w?.state === "relearning" && w.due_at && Date.parse(w.due_at) <= t;
}

/** Từ đang ôn lại đã đến hạn lên đầu (quá hạn lâu nhất trước), còn lại xáo trộn. */
export function orderForQuiz(words, now = new Date()) {
  const t = now.getTime();
  const due = words.filter((w) => isDue(w, t)).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  return [...due, ...shuffle(words.filter((w) => !isDue(w, t)))];
}

/**
 * Sau khi nộp bài: từ sai → ôn lại sau 1 ngày; từ đang ôn lại mà trả lời
 * đúng LÚC ĐÃ TỚI HẠN → thoát ôn lại, hẹn 3 ngày. Đúng ngay sau khi vừa xem
 * đáp án ("Ôn lại các từ sai") chưa tính là nhớ — thông báo ngày mai vẫn nhắc.
 * Chỉ từ của chính người dùng (`rows`).
 */
export function reviewUpdates(details, rows, now = new Date()) {
  const wrongIds = [];
  const recoveredIds = [];
  for (const d of Object.values(details || {})) {
    const row = rows.get(d?.word_id);
    if (!row) continue;
    if (!d.correct) wrongIds.push(d.word_id);
    else if (isDue(row, now.getTime())) recoveredIds.push(d.word_id);
  }
  return {
    wrongIds,
    recoveredIds,
    relearnDueAt: new Date(now.getTime() + DAY).toISOString(),
    recoveredDueAt: new Date(now.getTime() + 3 * DAY).toISOString(),
  };
}

/** Lấy phần văn bản dùng làm đáp án theo chế độ. */
function answerTextFor(word, mode) {
  if (mode === "en_to_vi") return (word?.def_vi || "").trim();
  if (mode === "vi_to_en") return (word?.word || "").trim();
  return "";
}

/** Lấy phần văn bản dùng làm câu hỏi theo chế độ. */
function promptTextFor(word, mode) {
  if (mode === "en_to_vi") return (word?.word || "").trim();
  if (mode === "vi_to_en") return (word?.def_vi || "").trim();
  return "";
}

/**
 * Sinh danh sách câu hỏi trắc nghiệm.
 *
 * Trả về mảng { id, word_id, prompt, options[], correct_answer, level }
 * Mảng rỗng nếu không đủ dữ liệu để làm quiz có nghĩa.
 */
export function buildQuizQuestions(words, { count = 10, mode = "en_to_vi", now = new Date() } = {}) {
  if (!Array.isArray(words)) return [];
  if (!QUIZ_MODES.includes(mode)) return [];

  // Chỉ dùng từ có ĐỦ dữ liệu cho chế độ này. Từ thiếu nghĩa Việt sẽ tạo ra
  // câu hỏi hoặc đáp án rỗng — vô nghĩa với người học.
  const usable = words.filter(
    (w) => w?.id && promptTextFor(w, mode) && answerTextFor(w, mode)
  );

  // Cần ít nhất 2 từ: một đáp án đúng và một đáp án nhiễu.
  if (usable.length < 2) return [];

  // Từ cần ôn lại (quiz trước trả lời sai) được hỏi trước, còn lại ngẫu nhiên
  const selected = orderForQuiz(usable, now).slice(0, Math.min(count, usable.length));
  const questions = [];

  for (const word of selected) {
    const correct = answerTextFor(word, mode);
    // Đáp án nhiễu không trùng/cùng nghĩa với đáp án đúng, dài gần bằng nó
    const options = shuffle([correct, ...distractorsFor(word, usable, mode)]);

    questions.push({
      id: `q-${word.id}`,
      word_id: word.id,
      prompt: promptTextFor(word, mode),
      options,
      correct_answer: correct,
      level: word.level || null,
      mode,
    });
  }

  return questions;
}

/**
 * Chấm một lượt quiz. Trả về điểm và chi tiết từng câu.
 * Chấm ở server, không tin kết quả client tự tính.
 */
export function scoreQuiz(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};

  let correctCount = 0;
  const details = {};

  for (const q of qs) {
    if (!q?.id) continue;
    const given = ans[q.id];
    // Trim: dòng cũ lưu trước khi server trim có thể dư khoảng trắng
    const ok = typeof given === "string" && given.trim() === String(q.correct_answer ?? "").trim();
    if (ok) correctCount += 1;
    details[q.id] = {
      correct: ok,
      given: given ?? null,
      // Trả đáp án đúng SAU khi đã nộp — lúc này không còn gian lận được
      correct_answer: q.correct_answer,
      word_id: q.word_id,
    };
  }

  return {
    correct: correctCount,
    total: qs.length,
    percent: qs.length > 0 ? Math.round((correctCount / qs.length) * 100) : 0,
    details,
  };
}

/**
 * Chuyển một dòng bảng `words` (kho từ chung) thành từ dùng cho quiz.
 * Bảng words KHÔNG có nghĩa tiếng Việt (chỉ def_en) — trước đây route đọc
 * cột def_vi không tồn tại nên quiz trả 500 cho mọi người có < 4 từ đã lưu.
 * Kho từ dùng nghĩa tiếng Anh; từ người dùng tự lưu vẫn dùng nghĩa tiếng Việt.
 * Trả null nếu thiếu từ hoặc nghĩa (bị loại khỏi pool).
 */
export function bankWordToQuizWord(row) {
  const word = (row?.word || "").trim();
  const meaning = (row?.def_en || "").trim();
  if (!row?.id || !word || !meaning) return null;
  return { id: row.id, word, def_vi: meaning, level: row.level ?? null };
}
