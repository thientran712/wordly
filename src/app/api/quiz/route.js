// GET  /api/quiz  — sinh một lượt quiz mới
// POST /api/quiz  — nộp kết quả, chấm ở server
//
// Câu hỏi được sinh từ kho từ vựng sẵn có, KHÔNG lưu vào DB — chi phí gần
// bằng 0, không gọi AI, không phải soạn nội dung.

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { buildQuizQuestions, scoreQuiz, QUIZ_MODES } from "@/lib/quiz-generation";

const MAX_QUESTIONS = 20;
const DEFAULT_QUESTIONS = 10;
// Lấy nhiều hơn số câu cần để có đủ từ làm đáp án nhiễu và tăng tính đa dạng
const POOL_MULTIPLIER = 6;

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "en_to_vi";
  const level = url.searchParams.get("level");
  const source = url.searchParams.get("source") || "saved"; // saved | bank
  const classId = url.searchParams.get("class_id");

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
    const { data, error } = await supabase
      .from("translate_history")
      .select("id, source_text, translated_text")
      .eq("user_id", user.id)
      .eq("direction", "EN→VI")
      .eq("is_saved", true)
      .order("saved_at", { ascending: false })
      .limit(count * POOL_MULTIPLIER);

    if (error) {
      console.error("[api/quiz] lỗi đọc từ đã lưu:", error.message);
      return Response.json({ error: "Không tải được từ vựng" }, { status: 500 });
    }

    words = (data || []).map((r) => ({
      id: r.id,
      word: r.source_text,
      def_vi: r.translated_text,
    }));
  }

  // Không đủ từ đã lưu thì bù bằng kho từ chung.
  if (words.length < 4) {
    const admin = createAdminClient();
    let query = admin
      .from("words")
      .select("id, word, def_vi, def_en, level")
      .not("def_vi", "is", null)
      .neq("def_vi", "");

    if (level) query = query.eq("level", level);

    // Lấy một cửa sổ ngẫu nhiên để không phải lúc nào cũng ra cùng bộ từ.
    // Không dùng ORDER BY random() vì nó quét toàn bảng 7.5k dòng.
    const { count: totalWords } = await admin
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
    words = [...words, ...(data || [])];
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
    // Client gửi lại token này khi nộp để server biết đề nào. Ký bằng cách
    // nào là việc của GĐ sau; hiện tại server chấm lại từ word_id nên
    // không cần lưu đề.
    class_id: isUuid(classId) ? classId : null,
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

  const { answers, mode, class_id, duration_ms } = body || {};

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
  const admin = createAdminClient();

  const [savedRes, bankRes] = await Promise.all([
    supabase
      .from("translate_history")
      .select("id, source_text, translated_text")
      .eq("user_id", user.id)
      .in("id", wordIds.filter(isUuid)),
    admin.from("words").select("id, word, def_vi").in("id", wordIds.filter(isUuid)),
  ]);

  const truth = new Map();
  for (const r of savedRes.data || []) {
    truth.set(r.id, { word: r.source_text, def_vi: r.translated_text });
  }
  for (const r of bankRes.data || []) {
    if (!truth.has(r.id)) truth.set(r.id, { word: r.word, def_vi: r.def_vi });
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

  // Lưu lượt chơi. Nếu thuộc một lớp thì gắn org/membership để giáo viên
  // theo dõi được.
  let orgId = null;
  let membershipId = null;

  if (isUuid(class_id)) {
    const { data: klass } = await supabase
      .from("classes")
      .select("id, org_id")
      .eq("id", class_id)
      .maybeSingle();

    if (klass) {
      orgId = klass.org_id;
      const { data: m } = await supabase
        .from("memberships")
        .select("id")
        .eq("org_id", klass.org_id)
        .eq("user_id", user.id)
        .maybeSingle();
      membershipId = m?.id || null;
    }
  }

  const wordResults = {};
  for (const [qid, d] of Object.entries(result.details)) {
    wordResults[d.word_id] = d.correct;
  }

  const { error: saveErr } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    class_id: orgId ? class_id : null,
    org_id: orgId,
    membership_id: membershipId,
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

  return Response.json({ result });
}
