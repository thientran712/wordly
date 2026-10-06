// GET   /api/homework/[id]/grade — danh sách bài nộp để giáo viên chấm
// PATCH /api/homework/[id]/grade — chấm điểm phần tự luận + nhận xét

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { gradeSubmission } from "@/lib/homework-grading";

export async function GET(request, { params }) {
  const { id: homeworkId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(homeworkId)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ staff của lớp đọc được bài tập này ở chế độ quản lý.
  const { data: hw } = await supabase
    .from("homework")
    .select("id, class_id, org_id, title, questions, total_points")
    .eq("id", homeworkId)
    .maybeSingle();

  if (!hw) return Response.json({ error: "Không tìm thấy bài tập" }, { status: 404 });

  // RLS của homework_submissions chỉ cho staff của lớp thấy bài của học viên.
  const { data: submissions, error } = await supabase
    .from("homework_submissions")
    .select(`
      id, membership_id, answers, status, submitted_at, is_late,
      auto_score, manual_score, total_score, feedback, graded_at
    `)
    .eq("homework_id", homeworkId)
    .order("submitted_at", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[homework/grade] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được bài nộp" }, { status: 500 });
  }

  // Chấm lại phần khách quan để giáo viên thấy chi tiết câu nào đúng/sai.
  // Tính lại thay vì lưu sẵn: nếu giáo viên sửa đáp án thì kết quả cập nhật
  // theo, không bị kẹt ở lần chấm cũ.
  const enriched = (submissions || []).map((s) => {
    const grade = gradeSubmission(hw.questions, s.answers);
    return {
      ...s,
      grading: {
        auto_score: grade.auto_score,
        auto_max: grade.auto_max,
        manual_max: grade.manual_max,
        needs_manual: grade.needs_manual,
        details: grade.details,
      },
    };
  });

  return Response.json({
    homework: {
      id: hw.id,
      title: hw.title,
      total_points: hw.total_points,
      // Giáo viên ĐƯỢC xem đáp án
      questions: hw.questions,
    },
    submissions: enriched,
  });
}

export async function PATCH(request, { params }) {
  const { id: homeworkId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(homeworkId)) {
    return Response.json({ error: "id không hợp lệ" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { submission_id, manual_score, feedback } = body || {};

  if (!isUuid(submission_id)) {
    return Response.json({ error: "submission_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: hw } = await supabase
    .from("homework")
    .select("id, questions, total_points")
    .eq("id", homeworkId)
    .maybeSingle();

  if (!hw) return Response.json({ error: "Không tìm thấy bài tập" }, { status: 404 });

  const { data: submission } = await supabase
    .from("homework_submissions")
    .select("id, answers, auto_score")
    .eq("id", submission_id)
    .eq("homework_id", homeworkId)
    .maybeSingle();

  if (!submission) {
    return Response.json({ error: "Không tìm thấy bài nộp" }, { status: 404 });
  }

  // Tính lại điểm tự động để tổng luôn khớp với đáp án hiện tại.
  const grade = gradeSubmission(hw.questions, submission.answers);

  let manual = null;
  if (manual_score !== null && manual_score !== undefined) {
    manual = Number(manual_score);
    if (!Number.isFinite(manual) || manual < 0) {
      return Response.json({ error: "Điểm không hợp lệ" }, { status: 400 });
    }
    if (manual > grade.manual_max) {
      return Response.json(
        { error: `Điểm phần tự luận tối đa là ${grade.manual_max}` },
        { status: 400 }
      );
    }
  }

  const total = grade.auto_score + (manual ?? 0);

  const { data: updated, error } = await supabase
    .from("homework_submissions")
    .update({
      auto_score: grade.auto_score,
      manual_score: manual,
      total_score: total,
      feedback: typeof feedback === "string" ? feedback.trim() || null : null,
      status: "graded",
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", submission_id)
    .eq("homework_id", homeworkId)
    .select("id, status, auto_score, manual_score, total_score, feedback, graded_at")
    .single();

  if (error) {
    console.error("[homework/grade] PATCH lỗi:", error.message);
    return Response.json({ error: "Không lưu được điểm" }, { status: 500 });
  }

  return Response.json({ submission: updated });
}
