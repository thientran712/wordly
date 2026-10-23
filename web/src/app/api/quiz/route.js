// GET  /api/quiz  — sinh một lượt quiz mới
// POST /api/quiz  — nộp kết quả, chấm ở server
//
// Câu hỏi được sinh từ kho từ vựng sẵn có, KHÔNG lưu vào DB — chi phí gần
// bằng 0, không gọi AI, không phải soạn nội dung.

import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import {
  buildQuizQuestions, scoreQuiz, QUIZ_MODES, bankWordToQuizWord,
  savedRowToQuizWord, dedupeQuizWords, quizShortfall, reviewUpdates,
} from "@/lib/learning/quiz-generation";

/** UUID v4 hợp lệ — dùng để lọc word_id client gửi lên trước khi query DB. */
function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const MAX_QUESTIONS = 20;
const DEFAULT_QUESTIONS = 10;
// Lấy nhiều hơn số câu cần để có đủ từ làm đáp án nhiễu và tăng tính đa dạng
const POOL_MULTIPLIER = 6;
// Lấy rộng để từ cũ vẫn được hỏi và từ cần ôn lại không bị cắt mất
const SAVED_POOL_LIMIT = 300;

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "en_to_vi";
  const level = url.searchParams.get("level");
  const source = url.searchParams.get("source") || "saved"; // saved | bank

  if (!QUIZ_MODES.includes(mode)) {
    return Response.json({ error: `Chế độ không hỗ trợ: ${mode}` }, { status: 400 });
  }

  const count = Math.min(
    Math.max(parseInt(url.searchParams.get("count") || DEFAULT_QUESTIONS, 10) || DEFAULT_QUESTIONS, 3),
    MAX_QUESTIONS
  );

  const supabase = await createClient();
  let words = [];

  if (source === "saved") {
    // Ưu tiên ôn CHÍNH từ người học đã lưu — đúng triết lý của Wordly:
    // từ đáng học nhất là từ chính bạn vừa tra.
    // Cả hai chiều dịch; câu dài và từ trùng bị loại (savedRowToQuizWord).
    const { data, error } = await supabase
      .from("translate_history")
      .select("id, source_text, translated_text, direction, state, due_at")
      .eq("user_id", user.id)
      .eq("is_saved", true)
      .is("deleted_at", null)
      .order("saved_at", { ascending: false })
      .limit(SAVED_POOL_LIMIT);

    if (error) {
      console.error("[api/quiz] lỗi đọc từ đã lưu:", error.message);
      return Response.json({ error: "Không tải được từ vựng" }, { status: 500 });
    }

    words = dedupeQuizWords((data || []).map(savedRowToQuizWord).filter(Boolean));

    // KHÔNG bù bằng kho chung: kho chỉ có nghĩa tiếng Anh, trộn vào thì đáp
    // án lẫn hai thứ tiếng — nhìn ngôn ngữ là đoán ra (review quiz 23/10).
    const needed = quizShortfall(words.length);
    if (needed > 0) {
      return Response.json(
        { error: `Lưu thêm ${needed} từ nữa để mở quiz nhé.`, needed, available: words.length, questions: [] },
        { status: 409 }
      );
    }
  }

  // Kho từ chung chỉ khi gọi rõ source=bank.
  if (source === "bank") {
    const shared = createSharedClient();
    let query = shared
      .from("words")
      .select("id, word, def_en, level")
      .not("def_en", "is", null)
      .neq("def_en", "");

    if (level) query = query.eq("level", level);

    // Lấy một cửa sổ ngẫu nhiên để không phải lúc nào cũng ra cùng bộ từ.
    // Không dùng ORDER BY random() vì nó quét toàn bảng 7.5k dòng.
    const { count: totalWords } = await shared
      .from("words")
      .select("id", { count: "exact", head: true });

    const poolSize = count * POOL_MULTIPLIER;
    const maxOffset = Math.max(0, (totalWords || poolSize) - poolSize);
    const offset = Math.floor(Math.random() * (maxOffset + 1));

    const { data, error } = await query.range(offset, offset + poolSize - 1);

    if (error) {
      console.error("[api/quiz] lỗi đọc kho từ:", error.message);
      return Response.json({ error: "Không tải được từ vựng" }, { status: 500 });
    }
    words = [...words, ...(data || []).map(bankWordToQuizWord).filter(Boolean)];
  }

  const questions = buildQuizQuestions(words, { count, mode });

  if (questions.length === 0) {
    return Response.json(
      {
        error: "Chưa đủ từ vựng để tạo quiz. Hãy lưu thêm từ khi dịch.",
        questions: [],
      },
      { status: 409 }
    );
  }

  // BẢO MẬT: bỏ correct_answer trước khi gửi cho client, nếu không người
  // chơi xem đáp án qua DevTools. Server chấm lại khi nộp.
  const safeQuestions = questions.map(({ correct_answer, ...rest }) => rest);

  return Response.json({
    questions: safeQuestions,
    mode,
    available: words.length,
  });
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

  const { answers, mode, duration_ms } = body || {};

  if (!QUIZ_MODES.includes(mode)) {
    return Response.json({ error: "Chế độ không hợp lệ" }, { status: 400 });
  }
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return Response.json({ error: "answers phải là object" }, { status: 400 });
  }

  // answers: { [question_id]: { word_id, given } }
  const entries = Object.entries(answers);
  if (entries.length === 0 || entries.length > MAX_QUESTIONS) {
    return Response.json({ error: "Số câu trả lời không hợp lệ" }, { status: 400 });
  }

  const wordIds = entries.map(([, v]) => v?.word_id).filter(Boolean);
  if (wordIds.length !== entries.length) {
    return Response.json({ error: "Thiếu word_id trong câu trả lời" }, { status: 400 });
  }

  // Dựng lại đáp án đúng TỪ DATABASE — không tin đáp án client gửi.
  // Từ có thể đến từ translate_history (từ người học lưu) hoặc words.
  const supabase = await createClient();
  const shared = createSharedClient();

  const [savedRes, bankRes] = await Promise.all([
    supabase
      .from("translate_history")
      .select("id, source_text, translated_text, direction, state, due_at")
      .eq("user_id", user.id)
      .in("id", wordIds.filter(isUuid)),
    shared.from("words").select("id, word, def_en, level").in("id", wordIds.filter(isUuid)),
  ]);

  const truth = new Map();
  const ownRows = new Map();
  for (const r of savedRes.data || []) {
    const w = savedRowToQuizWord(r);
    if (!w) continue;
    truth.set(r.id, { word: w.word, def_vi: w.def_vi });
    ownRows.set(r.id, { state: r.state ?? null, due_at: r.due_at ?? null });
  }
  for (const r of bankRes.data || []) {
    const bank = bankWordToQuizWord(r);
    if (bank && !truth.has(r.id)) truth.set(r.id, { word: bank.word, def_vi: bank.def_vi });
  }

  // Dựng lại danh sách câu hỏi dạng chuẩn để dùng scoreQuiz đã có test.
  const questions = [];
  const givenAnswers = {};

  for (const [qid, payload] of entries) {
    const t = truth.get(payload.word_id);
    if (!t) continue; // từ không tồn tại hoặc không thuộc người dùng này

    const correct = mode === "en_to_vi" ? (t.def_vi || "") : (t.word || "");
    questions.push({ id: qid, word_id: payload.word_id, correct_answer: correct });
    givenAnswers[qid] = typeof payload.given === "string" ? payload.given : null;
  }

  if (questions.length === 0) {
    return Response.json({ error: "Không xác minh được câu hỏi" }, { status: 400 });
  }

  const result = scoreQuiz(questions, givenAnswers);

  const wordResults = {};
  for (const [qid, d] of Object.entries(result.details)) {
    wordResults[d.word_id] = d.correct;
  }

  const { error: saveErr } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    mode,
    total: result.total,
    correct: result.correct,
    percent: result.percent,
    duration_ms: Number.isInteger(duration_ms) ? duration_ms : null,
    word_results: wordResults,
  });

  if (saveErr) {
    // Kết quả vẫn trả về cho người chơi — không lưu được lượt chơi là lỗi
    // phụ, không nên làm mất kết quả họ vừa làm.
    console.error("[api/quiz] không lưu được lượt chơi:", saveErr.message);
  }

  // ── Đóng vòng lặp học tập: từ SAI được đẩy về hàng đợi ôn tập ──
  //
  // Trả lời sai nghĩa là chưa nhớ, nên hẹn ôn lại SỚM (1 ngày) thay vì chờ
  // theo lịch giãn cách hiện tại. Đây là chỗ quiz nối vào động cơ email —
  // select-word-for-email.js sẽ ưu tiên từ có due_at đã qua.
  //
  // Chỉ áp dụng cho từ thuộc translate_history của CHÍNH người dùng (từ họ
  // đã lưu). Từ lấy từ kho chung `words` không có hàng riêng để cập nhật.
  const updates = reviewUpdates(result.details, ownRows, new Date());

  let requeued = 0;
  if (updates.wrongIds.length > 0) {
    const nowIso = new Date().toISOString();
    const { data: updated, error: reqErr } = await supabase
      .from("translate_history")
      .update({ due_at: updates.relearnDueAt, state: "relearning" })
      .eq("user_id", user.id)
      .in("id", updates.wrongIds)
      .eq("is_saved", true)
      // Không kéo lùi từ đang hẹn SỚM hơn 1 ngày; hạn đã qua thì hẹn lại
      // (sai lần nữa phải được nhắc lần nữa — push chỉ gửi 1 lần mỗi hạn)
      .or(`due_at.is.null,due_at.gt.${updates.relearnDueAt},due_at.lte.${nowIso}`)
      .select("id");

    if (reqErr) {
      // Không làm request thất bại: người chơi đã có kết quả, việc hẹn ôn lại
      // là phần thêm.
      console.error("[api/quiz] không đẩy được từ sai vào hàng đợi:", reqErr.message);
    } else {
      requeued = (updated || []).length;
    }
  }

  // Từ đang ôn lại mà lần này trả lời đúng → thoát ôn lại, thông báo thôi ưu tiên
  if (updates.recoveredIds.length > 0) {
    const { error: recErr } = await supabase
      .from("translate_history")
      .update({ due_at: updates.recoveredDueAt, state: "review" })
      .eq("user_id", user.id)
      .in("id", updates.recoveredIds)
      .eq("state", "relearning");
    if (recErr) console.error("[api/quiz] không cập nhật từ đã nhớ lại:", recErr.message);
  }

  return Response.json({
    result,
    // Cho UI biết để nói với người học: "3 từ sai sẽ được ôn lại ngày mai"
    requeued_words: requeued,
  });
}
