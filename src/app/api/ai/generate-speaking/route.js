// POST /api/ai/generate-speaking — AI soạn đề nói theo format IELTS.
//
// Format đề thi (Part 1/2/3, cấu trúc cue card) là Ý TƯỞNG, không được bảo
// hộ bản quyền — chỉ nội dung cụ thể mới được. Nên AI sinh đề mới theo đúng
// format là hợp pháp, khác với việc copy đề Cambridge.

import { getUserFast } from "@/lib/get-user-fast";
import { createClient } from "@/lib/supabase-server";
import { isUuid } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import { callGroq, parseJsonResponse } from "@/lib/ai-models";
import { createRateLimiter, clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";

const limiter = createRateLimiter({ limit: 10, windowMs: 300_000 });

const PARTS = {
  part1: { label: "Part 1 — câu hỏi cá nhân", seconds: 45 },
  part2: { label: "Part 2 — cue card, nói dài", seconds: 120 },
  part3: { label: "Part 3 — thảo luận sâu", seconds: 90 },
};

const PROMPT = ({ topic, part, level }) => `Bạn là giám khảo IELTS Speaking, soạn đề luyện nói cho học viên Việt Nam.

CHỦ ĐỀ: ${topic}
DẠNG: ${PARTS[part].label}
TRÌNH ĐỘ HỌC VIÊN: ${level} (CEFR)

Yêu cầu theo đúng dạng ${part}:
${part === "part1" ? "- 1 câu hỏi ngắn về trải nghiệm cá nhân, trả lời trong 30-45 giây.\n- Câu hỏi đơn giản, quen thuộc với người Việt." : ""}${part === "part2" ? '- Một cue card đầy đủ: câu đề chính + 3-4 gạch đầu dòng "You should say:".\n- Học viên nói liên tục 1-2 phút.' : ""}${part === "part3" ? "- 1 câu hỏi thảo luận trừu tượng hơn, yêu cầu nêu quan điểm và lập luận.\n- Liên hệ được với bối cảnh Việt Nam." : ""}
- Đúng độ khó trình độ ${level}.
- Đề viết bằng TIẾNG ANH (như đề thi thật).
- Tiêu đề viết bằng tiếng Việt để GV dễ quản lý.

Trả về CHỈ JSON:
{
  "title": "tiêu đề tiếng Việt ngắn gọn",
  "prompt_text": "nội dung đề bằng tiếng Anh (giữ nguyên xuống dòng nếu là cue card)",
  "suggested_seconds": ${PARTS[part].seconds},
  "vocabulary_hints": ["3-5 từ/cụm tiếng Anh hữu ích cho đề này"]
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

  const { class_id, topic, part, level } = body || {};

  if (!isUuid(class_id)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }
  const cleanTopic = (topic || "").trim();
  if (!cleanTopic || cleanTopic.length > 200) {
    return Response.json({ error: "Chủ đề phải từ 1 đến 200 ký tự" }, { status: 400 });
  }
  if (!PARTS[part]) {
    return Response.json({ error: "part phải là part1, part2 hoặc part3" }, { status: 400 });
  }
  const lv = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(level) ? level : "B1";

  const supabase = await createClient();
  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", class_id)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const featureBlock = await requireFeature(klass.org_id, "speaking_review");
  if (featureBlock) return featureBlock;

  let draft;
  try {
    const { res } = await callGroq("quality", {
      messages: [{ role: "user", content: PROMPT({ topic: cleanTopic, part, level: lv }) }],
      temperature: 0.9, // cao hơn để đề đa dạng, không lặp lại
      max_tokens: 800,
      response_format: { type: "json_object" },
    });
    const data = await res.json();
    draft = parseJsonResponse(data.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("[ai/generate-speaking] Groq lỗi:", e.message);
    return Response.json({ error: "AI tạm thời không khả dụng" }, { status: 502 });
  }

  const promptText = typeof draft?.prompt_text === "string" ? draft.prompt_text.trim() : "";
  if (!promptText) {
    return Response.json({ error: "AI không soạn được đề hợp lệ" }, { status: 502 });
  }

  const secs = Number(draft.suggested_seconds);

  return Response.json({
    draft: {
      title: typeof draft.title === "string" ? draft.title.trim().slice(0, 300) : `Bài nói: ${cleanTopic}`,
      prompt_text: promptText.slice(0, 2000),
      // Kẹp vào khoảng DB cho phép (15-300s)
      max_seconds: Number.isFinite(secs) ? Math.max(15, Math.min(300, Math.round(secs))) : PARTS[part].seconds,
      vocabulary_hints: Array.isArray(draft.vocabulary_hints) ? draft.vocabulary_hints.slice(0, 5) : [],
    },
    note: "Bản nháp do AI soạn. Hãy đọc lại đề trước khi giao cho học viên.",
  });
}
