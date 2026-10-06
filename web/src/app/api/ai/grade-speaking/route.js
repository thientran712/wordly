// POST /api/ai/grade-speaking — AI chấm bài nói.
//
// Luồng 2 bước: Whisper nghe audio → văn bản, rồi LLM chấm từ văn bản đó.
//
// GIỚI HẠN QUAN TRỌNG phải nói rõ với giáo viên:
// Whisper trả về VĂN BẢN, không trả về chất lượng âm thanh. Nên AI chấm
// được từ vựng / ngữ pháp / nội dung khá tốt, nhưng PHÁT ÂM và LƯU LOÁT
// thì chỉ suy đoán gián tiếp (qua tốc độ nói, từ đệm, câu bỏ dở) — không
// thay được tai người. Phản hồi ghi rõ điều này để GV không tin quá mức.

import { getUserFast } from "@/lib/get-user-fast";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isUuid } from "@/lib/org-context";
import { getOrgSetting } from "@/lib/org-settings";
import { callGroq, transcribeAudio, parseJsonResponse } from "@/lib/ai-models";
import { createRateLimiter, clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";

// Whisper + LLM là 2 lượt gọi nên đắt hơn, giới hạn chặt hơn
const limiter = createRateLimiter({ limit: 20, windowMs: 300_000 });

const SCALE_MAX = { ten: 10, ielts: 9, percent: 100 };

const PROMPT = ({ question, transcript, wpm, maxScore, scale }) => `Bạn là giám khảo IELTS Speaking đang chấm bài nói của học viên Việt Nam.

ĐỀ BÀI: ${question}

BẢN GHI LỜI NÓI (do máy chuyển từ audio, có thể sai vài từ):
"""
${transcript}
"""

SỐ TỪ MỖI PHÚT: ${wpm ? wpm.toFixed(0) : "không rõ"} (tham khảo: người bản ngữ nói tự nhiên khoảng 140-160 từ/phút; dưới 90 là chậm/ngắc ngứ)

THANG ĐIỂM: 0 đến ${maxScore} (thang ${scale})

Chấm 4 tiêu chí:
1. fluency — độ lưu loát. Dựa vào: tốc độ nói, câu bỏ dở, từ đệm lặp lại (um, uh, like), câu ngắt quãng bất thường trong bản ghi.
2. pronunciation — phát âm. LƯU Ý: bạn chỉ có văn bản, KHÔNG nghe được âm thanh. Chỉ suy đoán gián tiếp qua chỗ máy ghi sai/không nhận ra từ. Nếu không đủ căn cứ, cho điểm trung bình và ghi rõ trong feedback là cần giáo viên nghe lại.
3. vocabulary — từ vựng đa dạng, dùng đúng ngữ cảnh.
4. grammar — cấu trúc câu, thời, sự hoà hợp.

Quy tắc:
- Bản ghi trống hoặc dưới 10 từ: cho 0 và needs_review = true.
- Bản ghi bằng tiếng Việt (học viên nói tiếng Việt): cho 0, needs_review = true, nêu rõ.
- Lệch đề hoàn toàn: fluency vẫn chấm được nhưng ghi rõ lệch đề, needs_review = true.
- confidence: "low" nếu bản ghi quá ngắn/nhiều chỗ khó hiểu.

feedback: viết TIẾNG VIỆT, 3-4 câu. Nêu 1 điểm mạnh, 2 điểm cần sửa CỤ THỂ (dẫn ví dụ từ bản ghi), và 1 gợi ý luyện tập.
good_phrases: 1-3 câu/cụm học viên dùng tốt (trích từ bản ghi).
improvements: 1-3 lỗi cụ thể kèm cách nói đúng hơn.

Trả về CHỈ JSON:
{
  "scores": { "fluency": 0, "pronunciation": 0, "vocabulary": 0, "grammar": 0 },
  "feedback": "...",
  "good_phrases": ["..."],
  "improvements": [{ "said": "...", "better": "..." }],
  "confidence": "high",
  "needs_review": false,
  "pronunciation_note": "ghi chú vì sao điểm phát âm chỉ là tham khảo"
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

  const { prompt_id, submission_id } = body || {};
  if (!isUuid(prompt_id) || !isUuid(submission_id)) {
    return Response.json({ error: "Thiếu prompt_id hoặc submission_id" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: prompt } = await supabase
    .from("speaking_prompts")
    .select("id, org_id, prompt_text")
    .eq("id", prompt_id)
    .maybeSingle();

  if (!prompt) return Response.json({ error: "Không tìm thấy đề nói" }, { status: 404 });

  // RLS: chỉ staff của lớp đọc được bài nộp
  const { data: sub } = await supabase
    .from("speaking_submissions")
    .select("id, storage_path, duration_ms, audio_deleted")
    .eq("id", submission_id)
    .eq("prompt_id", prompt_id)
    .maybeSingle();

  if (!sub) return Response.json({ error: "Không tìm thấy bài nộp" }, { status: 404 });
  if (sub.audio_deleted || !sub.storage_path) {
    return Response.json(
      { error: "Audio đã bị dọn sau 90 ngày, không chấm lại được" },
      { status: 409 }
    );
  }

  // ── Bước 1: tải audio và cho Whisper nghe ──
  const admin = createAdminClient();
  let transcript = "";
  let audioDuration = null;

  try {
    const { data: file, error: dlErr } = await admin.storage
      .from("speaking-submissions")
      .download(sub.storage_path);

    if (dlErr || !file) {
      console.error("[ai/grade-speaking] tải audio lỗi:", dlErr?.message);
      return Response.json({ error: "Không tải được file audio" }, { status: 502 });
    }

    const t = await transcribeAudio(file, { language: "en" });
    transcript = (t.text || "").trim();
    audioDuration = t.duration;
  } catch (e) {
    console.error("[ai/grade-speaking] Whisper lỗi:", e.message);
    return Response.json(
      { error: "Không chuyển được audio thành văn bản. Vui lòng thử lại." },
      { status: 502 }
    );
  }

  const wordCount = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;

  // Bản ghi trống → không cần gọi LLM, chắc chắn cần người xem
  if (wordCount < 5) {
    return Response.json({
      transcript,
      word_count: wordCount,
      result: null,
      needs_review: true,
      note: "Không nhận được lời nói rõ ràng từ audio. Giáo viên cần nghe trực tiếp.",
    });
  }

  // Tốc độ nói — căn cứ duy nhất (dù gián tiếp) để đánh giá độ lưu loát
  const durSec = audioDuration || (sub.duration_ms ? sub.duration_ms / 1000 : null);
  const wpm = durSec && durSec > 0 ? (wordCount / durSec) * 60 : null;

  const scale = await getOrgSetting(prompt.org_id, "grading_scale");
  const maxScore = SCALE_MAX[scale] ?? 10;

  // ── Bước 2: LLM chấm từ bản ghi ──
  let g;
  try {
    const { res } = await callGroq("quality", {
      messages: [{
        role: "user",
        content: PROMPT({
          question: prompt.prompt_text,
          transcript: transcript.slice(0, 5000),
          wpm,
          maxScore,
          scale,
        }),
      }],
      temperature: 0.3,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });
    const data = await res.json();
    g = parseJsonResponse(data.choices?.[0]?.message?.content);
  } catch (e) {
    console.error("[ai/grade-speaking] LLM lỗi:", e.message);
    return Response.json(
      { transcript, word_count: wordCount, error: "AI tạm thời không khả dụng" },
      { status: 502 }
    );
  }

  if (!g || typeof g !== "object") {
    return Response.json(
      { transcript, word_count: wordCount, error: "AI không trả kết quả hợp lệ", needs_review: true },
      { status: 502 }
    );
  }

  // Kẹp điểm — không tin số AI trả về
  const clamp = (v) => Math.max(0, Math.min(maxScore, Number(v) || 0));
  const scores = {
    score_fluency: clamp(g.scores?.fluency),
    score_pronunciation: clamp(g.scores?.pronunciation),
    score_vocabulary: clamp(g.scores?.vocabulary),
    score_grammar: clamp(g.scores?.grammar),
  };

  const needsReview =
    g.needs_review === true || g.confidence === "low" || wordCount < 25;

  return Response.json({
    transcript,
    word_count: wordCount,
    wpm: wpm ? Math.round(wpm) : null,
    scores,
    feedback: typeof g.feedback === "string" ? g.feedback.trim().slice(0, 2000) : "",
    good_phrases: Array.isArray(g.good_phrases) ? g.good_phrases.slice(0, 3) : [],
    improvements: Array.isArray(g.improvements) ? g.improvements.slice(0, 3) : [],
    confidence: ["high", "medium", "low"].includes(g.confidence) ? g.confidence : "medium",
    needs_review: needsReview,
    // Nói thẳng giới hạn để GV không tin quá mức vào điểm phát âm
    pronunciation_warning:
      "Điểm phát âm chỉ mang tính tham khảo: AI chấm từ bản ghi văn bản, không nghe được âm thanh. Hãy nghe lại để xác nhận.",
    score_max: maxScore,
    grading_scale: scale,
  });
}
