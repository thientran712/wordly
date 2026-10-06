// Chấm điểm bài tập — logic thuần, test được không cần DB.
// Xem tests/unit/homework-grading.test.mjs (21 ca).
//
// Đây là logic sinh ra ĐIỂM của học viên nên phải chặt: không âm thầm cho
// điểm khi gặp dữ liệu lạ, và không bao giờ vượt điểm tối đa.

export const QUESTION_TYPES = ["mcq", "fill", "essay", "match"];

// Loại chấm tự động được. 'essay' phải giáo viên chấm.
const AUTO_GRADED = new Set(["mcq", "fill", "match"]);

/**
 * Chuẩn hoá câu trả lời dạng chữ để so sánh.
 * Học viên gõ "  Beautiful. " phải được tính đúng như "beautiful".
 */
export function normalizeTextAnswer(value) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")        // gộp khoảng trắng
    .replace(/[.!?,;:]+$/, "");  // bỏ dấu câu ở cuối
}

/**
 * Bỏ đáp án khỏi danh sách câu hỏi trước khi gửi cho học viên.
 *
 * BẮT BUỘC gọi hàm này ở mọi API trả câu hỏi cho học viên — nếu không, đáp
 * án nằm ngay trong response và học viên xem được qua DevTools.
 */
export function stripAnswers(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map((q) => {
    // Sao chép rồi xoá, không sửa mảng gốc (mảng gốc còn dùng để chấm)
    const { answer, ...rest } = q || {};
    return rest;
  });
}

/** Tổng điểm của cả bài. */
export function computeTotalPoints(questions) {
  if (!Array.isArray(questions)) return 0;
  return questions.reduce((sum, q) => sum + (Number(q?.points) || 0), 0);
}

/** So khớp một câu trả lời với đáp án. Trả về true/false. */
function isCorrect(question, given) {
  const type = question?.type;

  if (type === "mcq") {
    // Đáp án là index. So sánh lỏng về kiểu vì client có thể gửi chuỗi "1".
    if (given === null || given === undefined) return false;
    return String(given) === String(question.answer);
  }

  if (type === "fill") {
    const normalized = normalizeTextAnswer(given);
    if (!normalized) return false;

    // Cho phép nhiều đáp án đúng: answer có thể là mảng
    const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
    return accepted.some((a) => normalizeTextAnswer(a) === normalized);
  }

  if (type === "match") {
    const expected = question.answer;
    if (!expected || typeof expected !== "object") return false;
    if (!given || typeof given !== "object") return false;

    const expectedKeys = Object.keys(expected);
    const givenKeys = Object.keys(given);

    // All-or-nothing: ghép đôi sai một phần thì không có điểm.
    // Cố tình chọn cách này để tránh tranh cãi về chấm nửa điểm.
    if (expectedKeys.length !== givenKeys.length) return false;
    return expectedKeys.every((k) => String(given[k]) === String(expected[k]));
  }

  // Loại lạ hoặc essay: KHÔNG tự cho là đúng.
  return false;
}

/**
 * Chấm một bài nộp.
 *
 * Trả về:
 *   auto_score   — điểm các câu chấm tự động được
 *   auto_max     — tổng điểm tối đa của phần tự động
 *   manual_max   — tổng điểm các câu cần giáo viên chấm
 *   needs_manual — có câu nào cần chấm tay không
 *   details      — { [question_id]: { correct, points_earned, points_max } }
 */
export function gradeSubmission(questions, answers) {
  const qs = Array.isArray(questions) ? questions : [];
  const ans = answers && typeof answers === "object" ? answers : {};

  let autoScore = 0;
  let autoMax = 0;
  let manualMax = 0;
  let needsManual = false;
  const details = {};

  for (const q of qs) {
    const id = q?.id;
    if (!id) continue;

    const points = Number(q.points) || 0;

    if (!AUTO_GRADED.has(q.type)) {
      // Essay hoặc loại không chấm tự động được → dồn vào phần chấm tay.
      // Loại LẠ thì không cộng vào manual_max (không biết chấm thế nào),
      // nhưng vẫn ghi details với correct=false để không âm thầm bỏ qua.
      if (q.type === "essay") {
        manualMax += points;
        needsManual = true;
        details[id] = { correct: null, points_earned: null, points_max: points, needs_manual: true };
      } else {
        details[id] = { correct: false, points_earned: 0, points_max: points };
      }
      continue;
    }

    autoMax += points;
    const correct = isCorrect(q, ans[id]);
    const earned = correct ? points : 0;
    autoScore += earned;

    details[id] = { correct, points_earned: earned, points_max: points };
  }

  return {
    auto_score: Math.max(0, Math.min(autoScore, autoMax)),
    auto_max: autoMax,
    manual_max: manualMax,
    needs_manual: needsManual,
    details,
  };
}
