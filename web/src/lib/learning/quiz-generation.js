// Sinh câu hỏi quiz từ kho từ vựng — logic thuần, test được không cần DB.
// Xem tests/unit/quiz-generation.test.mjs (19 ca).
//
// Quiz dùng lại kho 7.5k từ sẵn có (words + word_layers) nên không phải
// soạn nội dung mới — chi phí gần bằng 0, đúng tinh thần tận dụng tài sản
// đã có của Wordly.

export const QUIZ_MODES = ["en_to_vi", "vi_to_en"];

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
export function buildQuizQuestions(words, { count = 10, mode = "en_to_vi" } = {}) {
  if (!Array.isArray(words)) return [];
  if (!QUIZ_MODES.includes(mode)) return [];

  // Chỉ dùng từ có ĐỦ dữ liệu cho chế độ này. Từ thiếu nghĩa Việt sẽ tạo ra
  // câu hỏi hoặc đáp án rỗng — vô nghĩa với người học.
  const usable = words.filter(
    (w) => w?.id && promptTextFor(w, mode) && answerTextFor(w, mode)
  );

  // Cần ít nhất 2 từ: một đáp án đúng và một đáp án nhiễu.
  if (usable.length < 2) return [];

  const selected = shuffle(usable).slice(0, Math.min(count, usable.length));
  const questions = [];

  for (const word of selected) {
    const correct = answerTextFor(word, mode);

    const distractors = pickDistractors(usable, word.id, DISTRACTORS_NEEDED)
      .map((w) => answerTextFor(w, mode))
      // Loại đáp án nhiễu trùng đáp án đúng (hai từ khác nhau có thể cùng
      // nghĩa Việt, ví dụ "xinh đẹp")
      .filter((text) => text && text !== correct);

    // Khử trùng lặp giữa các đáp án nhiễu với nhau
    const uniqueDistractors = [...new Set(distractors)];

    const options = shuffle([correct, ...uniqueDistractors]);

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
    const ok = typeof given === "string" && given === q.correct_answer;
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
