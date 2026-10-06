// GET  /api/speaking?class_id= — danh sách đề nói (kèm bài nộp của mình)
// POST /api/speaking            — tạo đề nói (staff)

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid, getOrgRole, isStaffRole } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const classId = new URL(request.url).searchParams.get("class_id");
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", classId)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const role = await getOrgRole(klass.org_id);
  const isStaff = isStaffRole(role);

  // RLS lọc: staff thấy cả draft, HV chỉ thấy published/closed
  const { data: prompts, error } = await supabase
    .from("speaking_prompts")
    .select("id, title, prompt_text, max_seconds, due_at, status, created_at")
    .eq("class_id", classId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/speaking] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách đề nói" }, { status: 500 });
  }

  let result = prompts || [];
  const ids = result.map((p) => p.id);

  if (ids.length > 0) {
    if (isStaff) {
      // GV cần biết bao nhiêu bài chờ chấm
      const { data: subs } = await supabase
        .from("speaking_submissions")
        .select("prompt_id, status")
        .in("prompt_id", ids);

      const counts = new Map();
      for (const s of subs || []) {
        const c = counts.get(s.prompt_id) || { submitted: 0, graded: 0 };
        if (s.status === "submitted") c.submitted += 1;
        if (s.status === "graded") c.graded += 1;
        counts.set(s.prompt_id, c);
      }
      result = result.map((p) => ({ ...p, counts: counts.get(p.id) || { submitted: 0, graded: 0 } }));
    } else {
      // HV: kèm trạng thái bài của chính mình (RLS chỉ trả bài của họ)
      const { data: mine } = await supabase
        .from("speaking_submissions")
        .select("prompt_id, status, score_overall, submitted_at, is_late, feedback, audio_deleted")
        .in("prompt_id", ids);

      const byPrompt = new Map((mine || []).map((s) => [s.prompt_id, s]));
      result = result.map((p) => ({ ...p, my_submission: byPrompt.get(p.id) || null }));
    }
  }

  return Response.json({ prompts: result, can_manage: isStaff });
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

  const { class_id, title, prompt_text, max_seconds, due_at, status, session_id } = body || {};

  if (!isUuid(class_id)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  const cleanPrompt = (prompt_text || "").trim();
  if (!cleanPrompt || cleanPrompt.length > 2000) {
    return Response.json({ error: "Nội dung đề phải từ 1 đến 2000 ký tự" }, { status: 400 });
  }

  // Chặn thời lượng để kiểm soát dung lượng lưu trữ
  const seconds = Number.isInteger(max_seconds) ? max_seconds : 120;
  if (seconds < 15 || seconds > 300) {
    return Response.json({ error: "Thời lượng phải từ 15 đến 300 giây" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", class_id)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const featureBlock = await requireFeature(klass.org_id, "speaking_review");
  if (featureBlock) return featureBlock;

  const { data: created, error } = await supabase
    .from("speaking_prompts")
    .insert({
      class_id,
      org_id: klass.org_id,
      session_id: isUuid(session_id) ? session_id : null,
      title: cleanTitle,
      prompt_text: cleanPrompt,
      max_seconds: seconds,
      due_at: due_at || null,
      status: status === "published" ? "published" : "draft",
      created_by: user.id,
    })
    .select("id, title, prompt_text, max_seconds, due_at, status, created_at")
    .single();

  if (error) {
    console.error("[api/speaking] POST lỗi:", error.message);
    return Response.json({ error: "Không tạo được đề nói" }, { status: 500 });
  }

  return Response.json({ prompt: created }, { status: 201 });
}
