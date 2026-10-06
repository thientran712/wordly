// POST /api/ai/generate-homework — AI soạn đề bài tập cho giáo viên.
//
// Giá trị: GV hiện phải gõ tay từng câu hỏi + đáp án. Với 10 câu trắc
// nghiệm là 40 dòng nhập liệu. AI soạn nháp trong ~10 giây, GV sửa rồi duyệt.
//
// Nguyên tắc: AI soạn NHÁP, GV luôn xem và sửa trước khi giao. Không tự
// động giao bài cho học viên.

import { getUserFast } from "@/lib/get-user-fast";
import { createClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import { callGroq, parseJsonResponse } from "@/lib/ai-models";
import { createRateLimiter, clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";
import { QUESTION_TYPES } from "@/lib/homework-grading";

// Soạn đề tốn nhiều token nên giới hạn chặt hơn các API khác
const limiter = createRateLimiter({ limit: 10, windowMs: 300_000 }); // 10 lượt / 5 phút

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

const PROMPT = ({ topic, level, count, types, language }) => `Bạn là giáo viên tiếng Anh giàu kinh nghiệm ở Việt Nam, đang soạn bài tập cho học viên.

CHỦ ĐỀ: ${topic}
TRÌNH ĐỘ: ${level} (CEFR)
SỐ CÂU: ${count}
LOẠI CÂU HỎI được dùng: ${types.join(", ")}

Yêu cầu:
- Câu hỏi phải đúng trình độ ${level}: từ vựng và ngữ pháp phù hợp, không quá dễ hoặc quá khó.
- Nội dung sát chủ đề "${topic}", dùng tình huống thực tế mà người Việt trẻ hay gặp.
- Với "mcq": đúng 4 lựa chọn, chỉ MỘT đáp án đúng, 3 đáp án nhiễu phải hợp lý (không quá lộ).
- Với "fill": câu có một chỗ trống, đáp án là 1-3 từ. Nếu có nhiều cách trả lời đúng, liệt kê hết.
- Với "essay": câu hỏi mở, yêu cầu viết 3-5 câu.
- ${language === "vi" ? 'Phần "prompt" viết bằng tiếng Việt nếu là câu hỏi về nghĩa; còn lại giữ tiếng Anh.' : "Toàn bộ viết bằng tiếng Anh."}
- Điểm mỗi câu: mcq/fill = 1, essay = 3.

Trả về CHỈ JSON đúng cấu trúc này, không thêm lời dẫn:
{
  "title": "tiêu đề bài tập ngắn gọn bằng tiếng Việt",
  "instructions": "hướng dẫn ngắn cho học viên bằng tiếng Việt",
  "questions": [
    { "type": "mcq", "prompt": "...", "points": 1, "options": ["A","B","C","D"], "answer": 0 },
    { "type": "fill", "prompt": "... ___ ...", "points": 1, "answer": ["đáp án 1","đáp án 2"] },
    { "type": "essay", "prompt": "...", "points": 3 }
  ]
}`;

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = limiter.check(clientKeyFromRequest(request, user.id));
  if (!rl.allowed) return rateLimitResponse(rl, "Bạn soạn đề quá nhanh. Chờ chút rồi thử lại.");

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { class_id, topic, level, count, types } = body || {};

  if (!isUuid(class_id)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const cleanTopic = (topic || "").trim();
  if (!cleanTopic || cleanTopic.length > 200) {
    return Response.json({ error: "Chủ đề phải từ 1 đến 200 ký tự" }, { status: 400 });
  }
  if (!LEVELS.includes(level)) {
    return Response.json({ error: `Trình độ phải là một trong: ${LEVELS.join(", ")}` }, { status: 400 });
  }

  const n = Number.isInteger(count) ? count : 5;
  if (n < 1 || n > 15) {
    return Response.json({ error: "Số câu phải từ 1 đến 15" }, { status: 400 });
  }

  // Chỉ nhận loại câu hỏi AI soạn được (match cần dữ liệu cặp, để GV tự làm)
  const allowed = ["mcq", "fill", "essay"];
  const useTypes = Array.isArray(types) && types.length > 0
    ? types.filter((t) => allowed.includes(t))
    : ["mcq", "fill"];
  if (useTypes.length === 0) {
    return Response.json({ error: "Chọn ít nhất một loại câu hỏi" }, { status: 400 });
  }

  // Kiểm quyền: chỉ staff của lớp mới soạn đề
  const supabase = await createClient();
  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", class_id)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const featureBlock = await requireFeature(klass.org_id, "homework");
  if (featureBlock) return featureBlock;

  // ── Gọi AI ──
  let draft;
  try {
    const { res, model } = await callGroq("quality", {
      messages: [{ role: "user", content: PROMPT({ topic: cleanTopic, level, count: n, types: useTypes, language: "vi" }) }],
      temperature: 0.8,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });
    const data = await res.json();
    draft = parseJsonResponse(data.choices?.[0]?.message?.content);
    if (draft) draft._model = model;
  } catch (e) {
    console.error("[ai/generate-homework] Groq lỗi:", e.message);
    return Response.json({ error: "AI tạm thời không khả dụng, vui lòng thử lại" }, { status: 502 });
  }

  if (!draft || !Array.isArray(draft.questions) || draft.questions.length === 0) {
    return Response.json(
      { error: "AI không soạn được đề hợp lệ. Thử mô tả chủ đề rõ hơn." },
      { status: 502 }
    );
  }

  // ── Làm sạch dữ liệu AI trả về ──
  // AI có thể trả sai định dạng nhỏ; sửa những gì sửa được, loại câu không
  // dùng được. KHÔNG tin dữ liệu AI như dữ liệu đã validate.
  const questions = [];
  for (const [i, q] of draft.questions.entries()) {
    if (!q || typeof q !== "object") continue;
    if (!QUESTION_TYPES.includes(q.type) || !allowed.includes(q.type)) continue;

    const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
    if (!prompt) continue;

    // id do server sinh, không dùng id của AI (có thể trùng)
    const base = {
      id: `q-${crypto.randomUUID().slice(0, 8)}`,
      type: q.type,
      prompt,
      points: Number.isFinite(Number(q.points)) ? Math.max(0, Math.min(100, Number(q.points))) : (q.type === "essay" ? 3 : 1),
    };

    if (q.type === "mcq") {
      const options = Array.isArray(q.options)
        ? q.options.map((o) => String(o ?? "").trim()).filter(Boolean)
        : [];
      const idx = Number(q.answer);
      // Bỏ câu thiếu lựa chọn hoặc đáp án ngoài phạm vi — AI đôi khi sai chỗ này
      if (options.length < 2 || !Number.isInteger(idx) || idx < 0 || idx >= options.length) continue;
      questions.push({ ...base, options, answer: idx });
    } else if (q.type === "fill") {
      const ans = Array.isArray(q.answer)
        ? q.answer.map((a) => String(a ?? "").trim()).filter(Boolean)
        : String(q.answer ?? "").trim() ? [String(q.answer).trim()] : [];
      if (ans.length === 0) continue;
      questions.push({ ...base, answer: ans.length > 1 ? ans : ans[0] });
    } else {
      questions.push(base);
    }
  }

  if (questions.length === 0) {
    return Response.json(
      { error: "AI soạn đề nhưng không câu nào đúng định dạng. Vui lòng thử lại." },
      { status: 502 }
    );
  }

  return Response.json({
    draft: {
      title: typeof draft.title === "string" ? draft.title.trim().slice(0, 300) : `Bài tập: ${cleanTopic}`,
      instructions: typeof draft.instructions === "string" ? draft.instructions.trim().slice(0, 1000) : "",
      questions,
    },
    // Cho GV biết AI soạn được mấy câu so với số yêu cầu
    requested: n,
    generated: questions.length,
    model: draft._model,
    // Nhắc rõ đây là nháp — GV phải xem lại
    note: "Đây là bản nháp do AI soạn. Hãy kiểm tra nội dung và đáp án trước khi giao cho học viên.",
  });
}
