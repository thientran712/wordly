// GET    /api/orgs/[id]/members  — danh sách thành viên
// POST   /api/orgs/[id]/members  — mời thành viên qua email
// DELETE /api/orgs/[id]/members?membership_id= — xoá thành viên

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { requireOwner, requireOrgRole, isUuid } from "@/lib/org-context";
import { parseInviteList, isValidOrgRole } from "@/lib/invite-validation";

export async function GET(request, { params }) {
  const { id: orgId } = await params;  // Next 16: params là Promise

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Staff xem được danh sách; học viên không cần thấy toàn bộ thành viên.
  const guard = await requireOrgRole(orgId, ["owner", "teacher"]);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, invited_email, role, status, custom_fields, created_at")
    .eq("org_id", orgId)
    .neq("status", "removed")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orgs/members] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách thành viên" }, { status: 500 });
  }

  return Response.json({ members: data || [], role: guard.role });
}

export async function POST(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Chỉ owner mời thành viên.
  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const role = body?.role || "student";
  if (!isValidOrgRole(role)) {
    return Response.json({ error: `Vai trò không hợp lệ: ${role}` }, { status: 400 });
  }

  const { emails, invalid, truncated } = parseInviteList(body?.emails);

  if (emails.length === 0) {
    return Response.json(
      { error: "Không có email hợp lệ", invalid },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // Người đã có tài khoản thì gắn user_id luôn để họ vào được ngay;
  // người chưa có thì để invited_email, gắn user_id khi họ đăng ký.
  //
  // Dùng admin client cho listUsers vì đây là Auth Admin API — không có
  // cách nào tra user theo email từ phía client.
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map(
    (authList?.users || []).map((u) => [u.email?.toLowerCase(), u.id])
  );

  // Bỏ những người đã là thành viên (kể cả đang chờ) để không tạo hàng trùng.
  const { data: existing } = await supabase
    .from("memberships")
    .select("user_id, invited_email")
    .eq("org_id", orgId);

  const existingUserIds = new Set((existing || []).map((m) => m.user_id).filter(Boolean));
  const existingEmails = new Set(
    (existing || []).map((m) => m.invited_email?.toLowerCase()).filter(Boolean)
  );

  const rows = [];
  const skipped = [];

  for (const email of emails) {
    const userId = byEmail.get(email) || null;

    if ((userId && existingUserIds.has(userId)) || existingEmails.has(email)) {
      skipped.push(email);
      continue;
    }

    rows.push({
      org_id: orgId,
      user_id: userId,
      invited_email: userId ? null : email,
      role,
      // Người đã có tài khoản → active ngay. Người chưa có → chờ nhận lời mời.
      status: userId ? "active" : "invited",
      invited_by: user.id,
    });
  }

  if (rows.length === 0) {
    return Response.json({
      invited: 0,
      skipped,
      invalid,
      truncated,
      message: "Tất cả email đã là thành viên",
    });
  }

  const { data: created, error: insertErr } = await supabase
    .from("memberships")
    .insert(rows)
    .select("id, user_id, invited_email, role, status");

  if (insertErr) {
    console.error("[orgs/members] POST lỗi:", insertErr.message);
    return Response.json({ error: "Không thêm được thành viên" }, { status: 500 });
  }

  // ── Gửi email mời ──
  // Gửi sau khi đã ghi DB thành công. Lỗi gửi mail KHÔNG làm request thất
  // bại: thành viên đã được thêm, và họ vẫn vào được bằng mã lớp. Báo lại
  // số gửi thành công để owner biết ai cần nhắc bằng cách khác.
  let emailsSent = 0;
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();

    const ROLE_LABELS = {
      owner: "Quản lý",
      teacher: "Giáo viên",
      student: "Học viên",
      parent: "Phụ huynh",
    };

    const { sendOrgInviteEmail } = await import("@/lib/send-org-email");

    const results = await Promise.all(
      rows.map((row) =>
        sendOrgInviteEmail({
          to: row.invited_email || emails.find((e) => byEmail.get(e) === row.user_id),
          orgName: org?.name || "Trung tâm",
          roleLabel: ROLE_LABELS[role] || role,
          inviterName: inviterProfile?.name || "",
          // Người đã có tài khoản chỉ cần đăng nhập lại (org context trong JWT)
          hasAccount: !!row.user_id,
        })
      )
    );
    emailsSent = results.filter((r) => r.success).length;
  } catch (e) {
    console.error("[orgs/members] gửi email mời lỗi:", e.message);
  }

  return Response.json(
    {
      invited: created.length,
      emails_sent: emailsSent,
      members: created,
      skipped,
      invalid,
      truncated,
      // Người đã có tài khoản cần đăng nhập lại để JWT nhận quyền mới —
      // ngữ cảnh org nằm trong token.
      note: "Thành viên đã có tài khoản cần đăng xuất/đăng nhập lại để thấy trung tâm.",
    },
    { status: 201 }
  );
}

export async function DELETE(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  const membershipId = new URL(request.url).searchParams.get("membership_id");
  if (!isUuid(membershipId)) {
    return Response.json({ error: "membership_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();

  // Không cho owner tự xoá mình — tổ chức sẽ không còn ai quản lý.
  const { data: target } = await supabase
    .from("memberships")
    .select("id, user_id, role")
    .eq("id", membershipId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!target) {
    return Response.json({ error: "Không tìm thấy thành viên" }, { status: 404 });
  }

  if (target.user_id === user.id) {
    return Response.json(
      { error: "Không thể tự xoá chính mình khỏi trung tâm" },
      { status: 409 }
    );
  }

  if (target.role === "owner") {
    // Đếm số owner còn lại — tổ chức phải luôn có ít nhất một người quản lý.
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "owner")
      .eq("status", "active");

    if ((count ?? 0) <= 1) {
      return Response.json(
        { error: "Trung tâm phải có ít nhất một người quản lý" },
        { status: 409 }
      );
    }
  }

  // Đánh dấu 'removed' thay vì xoá hẳn: giữ lịch sử, và chặn người bị xoá
  // tự quay lại bằng mã lớp (join_class_by_code kiểm trạng thái này).
  const { error } = await supabase
    .from("memberships")
    .update({ status: "removed" })
    .eq("id", membershipId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[orgs/members] DELETE lỗi:", error.message);
    return Response.json({ error: "Không xoá được thành viên" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
