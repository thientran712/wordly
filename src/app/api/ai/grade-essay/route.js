// POST /api/ai/grade-essay — AI chấm câu tự luận trong bài tập.
//
// Anh chọn "AI tự chấm điểm cuối", nên API này TRẢ VỀ điểm để UI lưu luôn.
// Nhưng tôi vẫn trả kèm `confidence` và `needs_review`: khi AI không chắc
// (bài quá ngắn, lệch đề, tiếng Việt lẫn tiếng Anh), nó nói rõ để GV xem lại.
// Điểm sai ảnh hưởng học viên thật và uy tín trung tâm — im lặng khi không
// chắc là điều tệ nhất.

import { getUserFast } from "@/lib/get-user-fast";
import { createClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/org-context";
import { callGroq, parseJsonResponse } from "@/lib/ai-models";
import { createRateLimiter, clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 30, windowMs: 300_000 });

const PROMPT = ({ question, answer, maxPoints }) => `Bạn là giáo viên tiếng Anh đang chấm bài tự luận của học viên Việt Nam.

CÂU HỎI: ${question}

BÀI LÀM CỦA HỌC VIÊN:
"""
${answer}
"""

ĐIỂM TỐI ĐA: ${maxPoints}

Hãy chấm theo 4 tiêu chí, mỗi tiêu chí cho điểm từ 0 đến ${maxPoints}:
1. content — trả lời đúng và đủ yêu cầu câu hỏi chưa
2. vocabulary — dùng từ đa dạng, chính xác chưa
3. grammar — ngữ pháp, chính tả
4. coherence — mạch lạc, liên kết câu

Quy tắc chấm:
- Bài trống hoặc dưới 5 từ: cho 0 điểm và đặt needs_review = true.
- Bài viết bằng tiếng Việt (không phải tiếng Anh): cho 0 điểm, needs_review = true, nêu rõ trong feedback.
- Bài lệch hoàn toàn khỏi câu hỏi: điểm content = 0, needs_review = true.
- Nếu bạn KHÔNG CHẮC về điểm (bài mơ hồ, khó đánh giá): đặt needs_review = true.
- confidence: "high" khi bài rõ ràng dễ chấm, "medium" khi có điểm mơ hồ, "low" khi bạn không chắc.

feedback: viết bằng TIẾNG VIỆT, 2-3 câu, nêu 1 điểm mạnh và 1-2 điểm cần sửa cụ thể (dẫn ví dụ từ bài làm). Giọng khích lệ nhưng thẳng thắn.
corrections: liệt kê tối đa 3 lỗi cụ thể, mỗi lỗi gồm phần sai và cách sửa.

Trả về CHỈ JSON:
{
  "scores": { "content": 0, "vocabulary": 0, "grammar": 0, "coherence": 0 },
  "overall": 0,
  "feedback": "...",
  "corrections": [{ "original": "...", "corrected": "...", "why": "..." }],
  "confidence": "high",
  "needs_review": false
}`;

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = limiter.check(clientKeyFromRequest(request, user.id));
  if (!rl.allowed) return rateLimitResponse(rl, "Bạn chấm quá nhanh. Chờ chút rồi thử lại.");

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { homework_id, submission_id, question_id } = body || {};
  if (!isUuid(homework_id) || !isUuid(submission_id)) {
    return Response.json({ error: "Thiếu homework_id hoặc submission_id" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ staff của lớp đọc được bài nộp của học viên
  const { data: hw } = await supabase
    .from("homework")
    .select("id, org_id, questions")
    .eq("id", homework_id)
    .maybeSingle();

  if (!hw) return Response.json({ error: "Không tìm thấy bài tập" }, { status: 404 });

  const { data: sub } = await supabase
    .from("homework_submissions")
    .select("id, answers")
    .eq("id", submission_id)
    .eq("homework_id", homework_id)
    .maybeSingle();

  if (!sub) return Response.json({ error: "Không tìm thấy bài nộp" }, { status: 404 });

  // Chấm tất cả câu essay, hoặc chỉ một câu nếu chỉ định question_id
  const essays = (hw.questions || []).filter(
    (q) => q?.type === "essay" && (!question_id || q.id === question_id)
  );

  if (essays.length === 0) {
    return Response.json({ error: "Bài này không có câu tự luận" }, { status: 400 });
  }

  const results = {};
  let totalSuggested = 0;
  let anyNeedsReview = false;

  for (const q of essays) {
    const answer = String(sub.answers?.[q.id] ?? "").trim();
    const maxPoints = Number(q.points) || 3;

    // Bài trống thì không cần gọi AI — tiết kiệm token và chắc chắn đúng
    if (!answer) {
      results[q.id] = {
        scores: { content: 0, vocabulary: 0, grammar: 0, coherence: 0 },
        overall: 0,
        feedback: "Học viên chưa làm câu này.",
        corrections: [],
        confidence: "high",
        needs_review: false,
        max_points: maxPoints,
      };
      anyNeedsReview = true; // GV nên biết có câu trống
      continue;
    }

    try {
      const { res } = await callGroq("quality", {
        messages: [{ role: "user", content: PROMPT({ question: q.prompt, answer: answer.slice(0, 4000), maxPoints }) }],
        temperature: 0.3, // thấp để điểm ổn định giữa các lần chấm
        max_tokens: 1200,
        response_format: { type: "json_object" },
      });
      const data = await res.json();
      const g = parseJsonResponse(data.choices?.[0]?.message?.content);

      if (!g || typeof g !== "object") {
        results[q.id] = { error: "AI không trả kết quả hợp lệ", needs_review: true, max_points: maxPoints };
        anyNeedsReview = true;
        continue;
      }

      // Kẹp điểm vào khoảng hợp lệ — KHÔNG tin số AI trả về
      const clamp = (v) => Math.max(0, Math.min(maxPoints, Number(v) || 0));
      const scores = {
        content: clamp(g.scores?.content),
        vocabulary: clamp(g.scores?.vocabulary),
        grammar: clamp(g.scores?.grammar),
        coherence: clamp(g.scores?.coherence),
      };

      // Điểm tổng tính LẠI từ 4 tiêu chí, không dùng `overall` của AI —
      // AI đôi khi trả tổng không khớp với các tiêu chí nó vừa cho.
      const overall = Math.round(
        ((scores.content + scores.vocabulary + scores.grammar + scores.coherence) / 4) * 10
      ) / 10;

      const needsReview =
        g.needs_review === true ||
        g.confidence === "low" ||
        answer.split(/\s+/).length < 10; // bài quá ngắn thì người nên xem

      if (needsReview) anyNeedsReview = true;
      totalSuggested += overall;

      results[q.id] = {
        scores,
        overall,
        feedback: typeof g.feedback === "string" ? g.feedback.trim().slice(0, 1500) : "",
        corrections: Array.isArray(g.corrections) ? g.corrections.slice(0, 3) : [],
        confidence: ["high", "medium", "low"].includes(g.confidence) ? g.confidence : "medium",
        needs_review: needsReview,
        max_points: maxPoints,
      };
    } catch (e) {
      console.error("[ai/grade-essay] Groq lỗi:", e.message);
      results[q.id] = { error: "AI tạm thời không khả dụng", needs_review: true, max_points: maxPoints };
      anyNeedsReview = true;
    }
  }

  return Response.json({
    results,
    suggested_manual_score: Math.round(totalSuggested * 10) / 10,
    needs_review: anyNeedsReview,
    note: anyNeedsReview
      ? "Có câu AI không chắc hoặc học viên bỏ trống — nên xem lại trước khi lưu điểm."
      : "AI đã chấm xong. Bạn vẫn nên đọc qua nhận xét trước khi lưu.",
  });
}
