// GET   /api/speaking/[id]/grade — danh sách bài nói để GV chấm (kèm link nghe)
// PATCH /api/speaking/[id]/grade — chấm điểm 4 tiêu chí + nhận xét

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { getOrgSetting } from "@/lib/org-settings";

const AUDIO_URL_TTL = 3600; // 1 giờ, đủ cho một buổi chấm bài

// Thang điểm tối đa theo cấu hình của trung tâm
const SCALE_MAX = { ten: 10, ielts: 9, percent: 100 };

export async function GET(request, { params }) {
  const { id: promptId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(promptId)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: prompt } = await supabase
    .from("speaking_prompts")
    .select("id, org_id, title, prompt_text, max_seconds")
    .eq("id", promptId)
    .maybeSingle();

  if (!prompt) return Response.json({ error: "Không tìm thấy đề nói" }, { status: 404 });

  // RLS chỉ cho staff của lớp thấy bài của học viên
  const { data: subs, error } = await supabase
    .from("speaking_submissions")
    .select(`
      id, membership_id, storage_path, duration_ms, status,
      submitted_at, is_late, audio_deleted,
      score_fluency, score_pronunciation, score_vocabulary, score_grammar,
      score_overall, feedback, graded_at
    `)
    .eq("prompt_id", promptId)
    .order("submitted_at", { ascending: true });

  if (error) {
    console.error("[speaking/grade] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được bài nộp" }, { status: 500 });
  }

  // Phát signed URL để GV nghe. Bucket private nên không có URL công khai.
  const admin = createAdminClient();
  const withAudio = await Promise.all(
    (subs || []).map(async (s) => {
      if (s.audio_deleted || !s.storage_path) {
        // Audio đã bị dọn sau 90 ngày — vẫn giữ điểm và nhận xét
        return { ...s, audio_url: null, audio_expired: true };
      }
      const { data: signed } = await admin.storage
        .from("speaking-submissions")
        .createSignedUrl(s.storage_path, AUDIO_URL_TTL);
      return { ...s, audio_url: signed?.signedUrl || null, audio_expired: false };
    })
  );

  const scale = await getOrgSetting(prompt.org_id, "grading_scale");

  return Response.json({
    prompt: {
      id: prompt.id,
      title: prompt.title,
      prompt_text: prompt.prompt_text,
      max_seconds: prompt.max_seconds,
    },
    submissions: withAudio,
    grading_scale: scale,
    score_max: SCALE_MAX[scale] ?? 10,
  });
}

export async function PATCH(request, { params }) {
  const { id: promptId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(promptId)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { submission_id, feedback } = body || {};
  if (!isUuid(submission_id)) {
    return Response.json({ error: "submission_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: prompt } = await supabase
    .from("speaking_prompts")
    .select("id, org_id")
    .eq("id", promptId)
    .maybeSingle();

  if (!prompt) return Response.json({ error: "Không tìm thấy đề nói" }, { status: 404 });

  const scale = await getOrgSetting(prompt.org_id, "grading_scale");
  const max = SCALE_MAX[scale] ?? 10;

  // Validate 4 tiêu chí theo thang điểm của trung tâm
  const criteria = ["score_fluency", "score_pronunciation", "score_vocabulary", "score_grammar"];
  const scores = {};
  const given = [];

  for (const key of criteria) {
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") {
      scores[key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > max) {
      return Response.json(
        { error: `Điểm phải từ 0 đến ${max} (thang ${scale})` },
        { status: 400 }
      );
    }
    scores[key] = n;
    given.push(n);
  }

  // Điểm tổng = trung bình các tiêu chí đã cho điểm.
  // Tính ở SERVER, không tin điểm tổng client gửi.
  const overall =
    given.length > 0
      ? Math.round((given.reduce((a, b) => a + b, 0) / given.length) * 10) / 10
      : null;

  const { data: updated, error } = await supabase
    .from("speaking_submissions")
    .update({
      ...scores,
      score_overall: overall,
      feedback: typeof feedback === "string" ? feedback.trim() || null : null,
      status: "graded",
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", submission_id)
    .eq("prompt_id", promptId)
    .select("id, status, score_overall, feedback, graded_at")
    .single();

  if (error) {
    console.error("[speaking/grade] PATCH lỗi:", error.message);
    return Response.json({ error: "Không lưu được điểm" }, { status: 500 });
  }

  return Response.json({ submission: updated });
}
