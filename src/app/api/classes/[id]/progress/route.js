// GET /api/classes/[id]/progress — số liệu cho dashboard giáo viên.
//
// Đọc từ student_progress_snapshots (bảng tổng hợp), KHÔNG đọc
// translate_history/journal_entries. Đây là quyết định về quyền riêng tư:
// giáo viên thấy TIẾN ĐỘ, không đọc được nhật ký cá nhân của học viên.
//
// Lợi ích kèm theo: query một bảng nhỏ đã tổng hợp thay vì join vào bảng
// lịch sử hàng triệu dòng.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { isUuid, getOrgRole, isStaffRole } from "@/lib/org-context";
import { getOrgSettings } from "@/lib/org-settings";

function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

export async function GET(request, { params }) {
  // Next 16: params là Promise — phải await (đã kiểm chứng trong
  // node_modules/next/dist/docs/.../route.md)
  const { id: classId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isUuid(classId)) {
    return Response.json({ error: "class_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS: chỉ trả về lớp mà user được phép thấy.
  const { data: klass, error: classErr } = await supabase
    .from("classes")
    .select("id, org_id, name")
    .eq("id", classId)
    .maybeSingle();

  if (classErr) {
    console.error("[api/classes/progress] lỗi lớp:", classErr.message);
    return Response.json({ error: "Không tải được lớp" }, { status: 500 });
  }
  if (!klass) return Response.json({ error: "Không tìm thấy lớp" }, { status: 404 });

  // UI cần biết có được quản lý bài giảng không (hiện/ẩn nút upload).
  // Tính ở server từ JWT thay vì để client suy đoán.
  const role = await getOrgRole(klass.org_id);
  const canManage = isStaffRole(role);

  // Danh sách học viên trong lớp
  const { data: members, error: memberErr } = await supabase
    .from("class_members")
    .select(`
      membership_id,
      role_in_class,
      memberships!inner(id, user_id, role, custom_fields)
    `)
    .eq("class_id", classId)
    .eq("role_in_class", "student");

  if (memberErr) {
    console.error("[api/classes/progress] lỗi thành viên:", memberErr.message);
    return Response.json({ error: "Không tải được danh sách học viên" }, { status: 500 });
  }

  const membershipIds = (members || []).map((m) => m.membership_id);
  if (membershipIds.length === 0) {
    return Response.json({
      class: { id: klass.id, name: klass.name },
      summary: { active: 0, stalled: 0, dropped: 0, total: 0 },
      students: [],
      can_manage: canManage,
      role,
      org_id: klass.org_id,
    });
  }

  // Snapshot mới nhất của từng học viên.
  // Lấy 30 ngày gần nhất rồi rút hàng mới nhất cho mỗi người — tránh N query.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: snapshots, error: snapErr } = await supabase
    .from("student_progress_snapshots")
    .select("membership_id, snapshot_date, words_saved, words_due, streak_days, last_active_at, emails_sent")
    .in("membership_id", membershipIds)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: false });

  if (snapErr) {
    console.error("[api/classes/progress] lỗi snapshot:", snapErr.message);
    return Response.json({ error: "Không tải được số liệu tiến độ" }, { status: 500 });
  }

  const latestByMembership = new Map();
  for (const s of snapshots || []) {
    if (!latestByMembership.has(s.membership_id)) {
      latestByMembership.set(s.membership_id, s);
    }
  }

  // Ngưỡng phân loại lấy từ cấu hình org (mỗi trung tâm có thể khác).
  const settings = await getOrgSettings(klass.org_id);
  const activeMax = settings.active_threshold_days;
  const stalledMax = settings.stalled_threshold_days;

  const summary = { active: 0, stalled: 0, dropped: 0, total: 0 };

  const students = (members || []).map((m) => {
    const snap = latestByMembership.get(m.membership_id);
    const inactiveDays = daysSince(snap?.last_active_at);

    let state;
    if (inactiveDays <= activeMax) state = "active";
    else if (inactiveDays <= stalledMax) state = "stalled";
    else state = "dropped";

    summary[state] += 1;
    summary.total += 1;

    return {
      membership_id: m.membership_id,
      custom_fields: m.memberships?.custom_fields || {},
      words_saved: snap?.words_saved ?? 0,
      words_due: snap?.words_due ?? 0,
      streak_days: snap?.streak_days ?? 0,
      last_active_at: snap?.last_active_at ?? null,
      inactive_days: Number.isFinite(inactiveDays) ? inactiveDays : null,
      emails_sent: snap?.emails_sent ?? 0,
      state,
      // Cố tình KHÔNG trả về nội dung học tập nào — chỉ số liệu tổng hợp.
    };
  });

  // Người cần chú ý nhất lên đầu: bỏ lâu nhất trước.
  students.sort((a, b) => (b.inactive_days ?? 0) - (a.inactive_days ?? 0));

  return Response.json({
    class: { id: klass.id, name: klass.name },
    summary,
    students,
    thresholds: { active_max_days: activeMax, stalled_max_days: stalledMax },
    can_manage: canManage,
    role,
    org_id: klass.org_id,
  });
}
