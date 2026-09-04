// GET    /api/orgs/[id]/guardians — danh sách liên kết phụ huynh–học viên
// POST   /api/orgs/[id]/guardians — gán phụ huynh cho học viên (owner)
// PATCH  /api/orgs/[id]/guardians — bật/tắt nhận báo cáo
// DELETE /api/orgs/[id]/guardians?link_id= — xoá liên kết (owner)

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { requireOwner, requireOrgRole, isUuid } from "@/lib/org-context";
import { validateGuardianLink, RELATIONSHIP_LABELS } from "@/lib/guardian-links";

export async function GET(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // RLS lo phần lọc: owner thấy hết, GV thấy HV lớp mình, phụ huynh thấy
  // liên kết của mình, HV thấy ai đang nhận báo cáo về mình.
  const guard = await requireOrgRole(orgId);
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("guardian_links")
    .select(`
      id, relationship, receive_reports, created_at,
      guardian_membership_id, student_membership_id
    `)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[orgs/guardians] GET lỗi:", error.message);
    return Response.json({ error: "Không tải được danh sách phụ huynh" }, { status: 500 });
  }

  return Response.json({
    links: data || [],
    relationship_labels: RELATIONSHIP_LABELS,
    role: guard.role,
  });
}

export async function POST(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Chỉ owner gán quan hệ — đây là quyết định về ai được xem dữ liệu học tập
  // của trẻ, không để giáo viên tự gán.
  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { guardian_membership_id, student_membership_id, relationship } = body || {};

  if (!isUuid(guardian_membership_id) || !isUuid(student_membership_id)) {
    return Response.json({ error: "Thiếu hoặc sai id thành viên" }, { status: 400 });
  }

  const check = validateGuardianLink({
    guardian_membership_id,
    student_membership_id,
    relationship,
  });
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 });
  }

  const supabase = await createClient();

  // Trigger enforce_guardian_tenant tự điền org_id và chặn ghép chéo org
  const { data: created, error } = await supabase
    .from("guardian_links")
    .insert({
      org_id: orgId,
      guardian_membership_id,
      student_membership_id,
      relationship,
      receive_reports: body.receive_reports !== false,
      created_by: user.id,
    })
    .select("id, relationship, receive_reports, guardian_membership_id, student_membership_id")
    .single();

  if (error) {
    // 23505 = trùng: liên kết này đã tồn tại
    if (error.code === "23505") {
      return Response.json({ error: "Liên kết này đã tồn tại" }, { status: 409 });
    }
    console.error("[orgs/guardians] POST lỗi:", error.message);
    return Response.json({ error: "Không tạo được liên kết" }, { status: 500 });
  }

  return Response.json({ link: created }, { status: 201 });
}

export async function PATCH(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // KHÔNG dùng requireOwner: phụ huynh cũng được tự tắt nhận báo cáo cho
  // liên kết của mình (RLS policy guardian_links_toggle_own lo việc này).
  const guard = await requireOrgRole(orgId);
  if (!guard.ok) return guard.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const { link_id, receive_reports } = body || {};
  if (!isUuid(link_id) || typeof receive_reports !== "boolean") {
    return Response.json({ error: "Thiếu link_id hoặc receive_reports" }, { status: 400 });
  }

  const supabase = await createClient();

  // RLS quyết định ai được sửa hàng nào. Không có quyền → 0 hàng bị sửa.
  const { data, error } = await supabase
    .from("guardian_links")
    .update({ receive_reports })
    .eq("id", link_id)
    .eq("org_id", orgId)
    .select("id, receive_reports");

  if (error) {
    console.error("[orgs/guardians] PATCH lỗi:", error.message);
    return Response.json({ error: "Không cập nhật được" }, { status: 500 });
  }
  if (!data?.length) {
    return Response.json({ error: "Không tìm thấy liên kết hoặc không có quyền" }, { status: 404 });
  }

  return Response.json({ link: data[0] });
}

export async function DELETE(request, { params }) {
  const { id: orgId } = await params;

  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guard = await requireOwner(orgId);
  if (!guard.ok) return guard.response;

  const linkId = new URL(request.url).searchParams.get("link_id");
  if (!isUuid(linkId)) {
    return Response.json({ error: "link_id không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("guardian_links")
    .delete()
    .eq("id", linkId)
    .eq("org_id", orgId);

  if (error) {
    console.error("[orgs/guardians] DELETE lỗi:", error.message);
    return Response.json({ error: "Không xoá được liên kết" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
