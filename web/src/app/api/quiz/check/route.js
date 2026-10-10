// POST /api/quiz/check — chấm MỘT câu ngay sau khi người học chọn đáp án,
// để báo đúng/sai ngay thay vì phải làm hết cả bài mới biết (quyết định
// 10/10/2026). KHÔNG lưu quiz_attempts/đẩy từ sai vào hàng đợi ôn — đó vẫn
// là việc của POST /api/quiz lúc nộp cả bài, endpoint này chỉ tra cứu +
// so sánh, không có tác dụng phụ.
//
// An toàn chống gian lận giống route nộp bài: đáp án đúng chỉ trả về SAU
// khi người học đã chọn (given), không phải trước — DevTools xem response
// của câu đã trả lời không giúp gì cho câu đó hay câu sau (mỗi câu random
// nhiễu khác nhau).

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { scoreQuiz, QUIZ_MODES, bankWordToQuizWord } from "@/lib/learning/quiz-generation";

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { word_id, mode, given } = body || {};
  if (!QUIZ_MODES.includes(mode)) {
    return Response.json({ error: "Chế độ không hợp lệ" }, { status: 400 });
  }
  if (!isUuid(word_id)) {
    return Response.json({ error: "Thiếu word_id" }, { status: 400 });
  }
  if (typeof given !== "string") {
    return Response.json({ error: "Thiếu đáp án" }, { status: 400 });
  }

  // Dựng lại đáp án đúng TỪ DATABASE — không tin đáp án client gửi,
  // giống hệt cách POST /api/quiz làm.
  const supabase = await createClient();
  const admin = createAdminClient();

  const [savedRes, bankRes] = await Promise.all([
    supabase
      .from("translate_history")
      .select("id, source_text, translated_text")
      .eq("user_id", user.id)
      .eq("id", word_id),
    admin.from("words").select("id, word, def_en, level").eq("id", word_id),
  ]);

  let truth = null;
  if (savedRes.data?.[0]) {
    truth = { word: savedRes.data[0].source_text, def_vi: savedRes.data[0].translated_text };
  } else if (bankRes.data?.[0]) {
    const bank = bankWordToQuizWord(bankRes.data[0]);
    if (bank) truth = { word: bank.word, def_vi: bank.def_vi };
  }

  if (!truth) {
    return Response.json({ error: "Không xác minh được câu hỏi" }, { status: 400 });
  }

  const correctAnswer = mode === "en_to_vi" ? (truth.def_vi || "") : (truth.word || "");
  const result = scoreQuiz(
    [{ id: "q", word_id, correct_answer: correctAnswer }],
    { q: given }
  );
  const detail = result.details.q;

  return Response.json({ correct: detail.correct, correct_answer: detail.correct_answer });
}
