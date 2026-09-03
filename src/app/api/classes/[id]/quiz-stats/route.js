// GET /api/classes/[id]/quiz-stats — xếp hạng quiz trong lớp.
//
// Đọc quiz_attempts (RLS: giáo viên thấy lượt chơi của học viên lớp mình,
// học viên chỉ thấy lượt của chính mình). Tổng hợp ở đây thay vì tạo view
// SQL vì cần lọc theo khoảng thời gian linh hoạt.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid, getOrgRole, isStaffRole } from "@/lib/org-context";

const PERIODS = { week: 7, month: 30, all: null };

export async function GET(request, { params }) {
  const { id: classId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const period = new URL(request.url).searchParams.get("period") || "week";
  const days = PERIODS[period] ?? 7;

  const supabase = await createClient();

  const { data: klass } = await supabase
    .from("classes")
    .select("id, org_id, name")
    .eq("id", classId)
    .maybeSingle();

  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  const role = await getOrgRole(klass.org_id);
  const isStaff = isStaffRole(role);

  let query = supabase
    .from("quiz_attempts")
    .select("membership_id, correct, total, percent, duration_ms, created_at")
    .eq("class_id", classId);

  if (days !== null) {
    query = query.gte("created_at", new Date(Date.now() - days * 86400_000).toISOString());
  }

  const { data: attempts, error } = await query;

  if (error) {
    console.error("[quiz-stats] lỗi:", error.message);
    return Response.json({ error: "Không tải được thống kê quiz" }, { status: 500 });
  }

  // Tổng hợp theo học viên
  const byMember = new Map();
  for (const a of attempts || []) {
    if (!a.membership_id) continue;
    const cur = byMember.get(a.membership_id) || {
      membership_id: a.membership_id,
      attempts: 0,
      total_correct: 0,
      total_questions: 0,
      best_percent: 0,
      last_played_at: null,
    };
    cur.attempts += 1;
    cur.total_correct += Number(a.correct) || 0;
    cur.total_questions += Number(a.total) || 0;
    cur.best_percent = Math.max(cur.best_percent, Number(a.percent) || 0);
    if (!cur.last_played_at || a.created_at > cur.last_played_at) {
      cur.last_played_at = a.created_at;
    }
    byMember.set(a.membership_id, cur);
  }

  const leaderboard = [...byMember.values()]
    .map((m) => ({
      ...m,
      avg_percent:
        m.total_questions > 0
          ? Math.round((m.total_correct / m.total_questions) * 100)
          : 0,
    }))
    // Xếp theo điểm trung bình, rồi tới số lượt chơi (chăm hơn thì xếp trên)
    .sort((a, b) => b.avg_percent - a.avg_percent || b.attempts - a.attempts);

  // Học viên chỉ được thấy vị trí của mình, không thấy điểm người khác.
  // Đây là quyết định về quyền riêng tư: xếp hạng công khai trong lớp có thể
  // gây áp lực không cần thiết cho học viên yếu.
  if (!isStaff) {
    const { data: myMembership } = await supabase
      .from("memberships")
      .select("id")
      .eq("org_id", klass.org_id)
      .eq("user_id", user.id)
      .maybeSingle();

    const myIndex = leaderboard.findIndex((r) => r.membership_id === myMembership?.id);
    return Response.json({
      class: { id: klass.id, name: klass.name },
      period,
      my_rank: myIndex >= 0 ? myIndex + 1 : null,
      my_stats: myIndex >= 0 ? leaderboard[myIndex] : null,
      total_players: leaderboard.length,
      leaderboard: null, // cố tình không trả bảng xếp hạng đầy đủ
    });
  }

  const classAvg =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, r) => s + r.avg_percent, 0) / leaderboard.length)
      : 0;

  return Response.json({
    class: { id: klass.id, name: klass.name },
    period,
    leaderboard,
    summary: {
      players: leaderboard.length,
      total_attempts: (attempts || []).length,
      class_avg_percent: classAvg,
    },
  });
}
