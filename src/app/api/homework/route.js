// GET  /api/homework?class_id= — danh sách bài tập
// POST /api/homework            — tạo bài tập (staff)

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid, getOrgRole, isStaffRole } from "@/lib/org-context";
import { requireFeature } from "@/lib/org-settings";
import {
  stripAnswers,
  computeTotalPoints,
  QUESTION_TYPES,
} from "@/lib/homework-grading";

/** Kiểm tra mảng câu hỏi do giáo viên gửi lên. */
function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, error: "Bài tập phải có ít nhất một câu hỏi" };
  }
  if (questions.length > 100) {
    return { ok: false, error: "Tối đa 100 câu mỗi bài" };
  }

  const seenIds = new Set();

  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!q || typeof q !== "object") {
      return { ok: false, error: `Câu ${n} không hợp lệ` };
    }
    if (!q.id || typeof q.id !== "string") {
      return { ok: false, error: `Câu ${n} thiếu id` };
    }
    if (seenIds.has(q.id)) {
      return { ok: false, error: `Câu ${n} có id trùng: ${q.id}` };
    }
    seenIds.add(q.id);

    if (!QUESTION_TYPES.includes(q.type)) {
      return { ok: false, error: `Câu ${n} có loại không hỗ trợ: ${q.type}` };
    }
    if (!q.prompt || typeof q.prompt !== "string" || !q.prompt.trim()) {
      return { ok: false, error: `Câu ${n} thiếu nội dung câu hỏi` };
    }
    const points = Number(q.points);
    if (!Number.isFinite(points) || points < 0 || points > 100) {
      return { ok: false, error: `Câu ${n} có điểm không hợp lệ` };
    }

    // Câu chấm tự động phải có đáp án, nếu không thì học viên nào cũng 0 điểm
    if (q.type === "mcq") {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return { ok: false, error: `Câu ${n} phải có ít nhất 2 lựa chọn` };
      }
      const idx = Number(q.answer);
      if (!Number.isInteger(idx) || idx < 0 || idx >= q.options.length) {
        return { ok: false, error: `Câu ${n} có đáp án không hợp lệ` };
      }
    }
    if (q.type === "fill") {
      const hasAnswer = Array.isArray(q.answer)
        ? q.answer.some((a) => typeof a === "string" && a.trim())
        : typeof q.answer === "string" && q.answer.trim();
      if (!hasAnswer) {
        return { ok: false, error: `Câu ${n} thiếu đáp án` };
      }
    }
    if (q.type === "match") {
      if (!q.answer || typeof q.answer !== "object" || Object.keys(q.answer).length === 0) {
        return { ok: false, error: `Câu ${n} thiếu cặp ghép đôi` };
      }
    }
  }

  return { ok: true };
}

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

  // RLS lọc: staff thấy cả draft, học viên chỉ thấy published/closed.
  const { data, error } = await supabase
    .from("homework")
    .select("id, title, instructions, questions, total_points, due_at, allow_late, status, created_at")
    .eq("class_id", classId)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/homework] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách bài tập" }, { status: 500 });
  }

  let homework = data || [];

  if (isStaff) {
    // Giáo viên cần đếm số bài đã nộp để biết ai chưa làm.
    const ids = homework.map((h) => h.id);
    if (ids.length > 0) {
      const { data: subs } = await supabase
        .from("homework_submissions")
        .select("homework_id, status")
        .in("homework_id", ids);

      const counts = new Map();
      for (const s of subs || []) {
        const c = counts.get(s.homework_id) || { submitted: 0, graded: 0 };
        if (s.status === "submitted") c.submitted += 1;
        if (s.status === "graded") c.graded += 1;
        counts.set(s.homework_id, c);
      }
      homework = homework.map((h) => ({ ...h, counts: counts.get(h.id) || { submitted: 0, graded: 0 } }));
    }
  } else {
    // BẢO MẬT: học viên KHÔNG được thấy đáp án. Lọc trước khi trả về —
    // nếu không, đáp án nằm ngay trong response và xem được qua DevTools.
    homework = homework.map((h) => ({ ...h, questions: stripAnswers(h.questions) }));

    // Kèm trạng thái bài nộp của chính học viên
    const { data: mine } = await supabase
      .from("homework_submissions")
      .select("homework_id, status, total_score, submitted_at, is_late")
      .in("homework_id", homework.map((h) => h.id));

    const byHw = new Map((mine || []).map((s) => [s.homework_id, s]));
    homework = homework.map((h) => ({ ...h, my_submission: byHw.get(h.id) || null }));
  }

  return Response.json({ homework, can_manage: isStaff });
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

  const { class_id, title, instructions, questions, due_at, allow_late, status, session_id } = body || {};

  if (!isUuid(class_id)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const cleanTitle = (title || "").trim();
  if (!cleanTitle || cleanTitle.length > 300) {
    return Response.json({ error: "Tiêu đề phải từ 1 đến 300 ký tự" }, { status: 400 });
  }

  const qCheck = validateQuestions(questions);
  if (!qCheck.ok) {
    return Response.json({ error: qCheck.error }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id")
    .eq("id", class_id)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const featureBlock = await requireFeature(klass.org_id, "homework");
  if (featureBlock) return featureBlock;

  const { data: created, error } = await supabase
    .from("homework")
    .insert({
      class_id,
      org_id: klass.org_id,
      session_id: isUuid(session_id) ? session_id : null,
      title: cleanTitle,
      instructions: instructions?.trim() || null,
      questions,
      total_points: computeTotalPoints(questions),
      due_at: due_at || null,
      allow_late: allow_late !== false,
      status: status === "published" ? "published" : "draft",
      created_by: user.id,
    })
    .select("id, title, total_points, due_at, status, created_at")
    .single();

  if (error) {
    console.error("[api/homework] POST lỗi:", error.message);
    return Response.json({ error: "Không tạo được bài tập" }, { status: 500 });
  }

  return Response.json({ homework: created }, { status: 201 });
}
