// POST /api/homework/[id]/submit — học viên nộp bài.
//
// Chấm tự động phần khách quan ngay khi nộp; phần tự luận chờ giáo viên.
// Chấm ở SERVER, không bao giờ tin điểm client gửi lên.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid } from "@/lib/org-context";
import { gradeSubmission } from "@/lib/homework-grading";

export async function POST(request, { params }) {
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

  const answers = body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return Response.json({ error: "answers phải là object" }, { status: 400 });
  }

  // Cho phép lưu nháp (chưa nộp hẳn)
  const isDraft = body?.draft === true;

  const supabase = await createClient();

  // RLS: học viên chỉ đọc được bài đã published trong lớp mình.
  // Đáp án nằm trong hàng này nhưng KHÔNG bao giờ được trả về client —
  // chỉ dùng để chấm ở server.
  const { data: hw, error: hwErr } = await supabase
    .from("homework")
    .select("id, class_id, org_id, questions, due_at, allow_late, status, total_points")
    .eq("id", homeworkId)
    .maybeSingle();

  if (hwErr) {
    console.error("[homework/submit] lỗi đọc bài:", hwErr.message);
    return Response.json({ error: "Không tải được bài tập" }, { status: 500 });
  }
  if (!hw) return Response.json({ error: "Không tìm thấy bài tập" }, { status: 404 });

  if (hw.status === "draft") {
    return Response.json({ error: "Bài tập chưa được mở" }, { status: 409 });
  }
  if (hw.status === "closed") {
    return Response.json({ error: "Bài tập đã đóng" }, { status: 409 });
  }

  // Kiểm hạn nộp
  const now = new Date();
  const isLate = hw.due_at ? now > new Date(hw.due_at) : false;

  if (isLate && !hw.allow_late && !isDraft) {
    return Response.json(
      { error: "Đã quá hạn nộp và bài này không cho nộp muộn" },
      { status: 409 }
    );
  }

  // Tìm membership của học viên trong org của bài tập
  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("org_id", hw.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Bạn không thuộc trung tâm này" }, { status: 403 });
  }

  // Bài đã chấm thì không cho nộp lại — RLS cũng chặn, đây là để có thông
  // báo rõ ràng thay vì lỗi 500 khó hiểu.
  const { data: existing } = await supabase
    .from("homework_submissions")
    .select("id, status")
    .eq("homework_id", homeworkId)
    .eq("membership_id", membership.id)
    .maybeSingle();

  if (existing?.status === "graded") {
    return Response.json(
      { error: "Bài đã được chấm, không thể nộp lại" },
      { status: 409 }
    );
  }

  // ── Chấm tự động ở SERVER ──
  const grade = gradeSubmission(hw.questions, answers);

  const row = {
    homework_id: homeworkId,
    membership_id: membership.id,
    org_id: hw.org_id,
    answers,
    status: isDraft ? "in_progress" : "submitted",
    submitted_at: isDraft ? null : now.toISOString(),
    is_late: isDraft ? false : isLate,
    auto_score: grade.auto_score,
    // Chưa có điểm tổng khi còn phần tự luận chờ chấm
    total_score: grade.needs_manual ? null : grade.auto_score,
  };

  const { data: saved, error: saveErr } = await supabase
    .from("homework_submissions")
    .upsert(row, { onConflict: "homework_id,membership_id" })
    .select("id, status, auto_score, total_score, submitted_at, is_late")
    .single();

  if (saveErr) {
    console.error("[homework/submit] lỗi lưu:", saveErr.message);
    return Response.json({ error: "Không lưu được bài nộp" }, { status: 500 });
  }

  return Response.json({
    submission: saved,
    // Trả kết quả chấm tự động để học viên thấy ngay phần khách quan.
    // details có cho biết câu nào đúng/sai nhưng KHÔNG chứa đáp án đúng.
    result: {
      auto_score: grade.auto_score,
      auto_max: grade.auto_max,
      manual_max: grade.manual_max,
      needs_manual: grade.needs_manual,
      total_points: hw.total_points,
      details: grade.details,
    },
  });
}
