// GET /api/orgs — danh sách tổ chức của tôi.
//
// Đọc từ RLS (anon client) chứ không phải service role: policy
// organizations_select_member đã lo việc chỉ trả về org mà user thuộc về.
// Đây là chính sách mới cho mọi route B2B — service role chỉ dành cho
// Inngest job và admin nội bộ.

import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { getUserOrgs } from "@/lib/org-context";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  // RLS tự lọc — không cần .in("id", ...) thủ công.
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, status, trial_ends_at")
    .order("name");

  if (error) {
    console.error("[api/orgs] lỗi truy vấn:", error.message);
    return Response.json({ error: "Không tải được danh sách tổ chức" }, { status: 500 });
  }

  // Gắn vai trò từ JWT để UI biết hiện menu nào.
  const roleMap = await getUserOrgs();
  const withRoles = (orgs || []).map((o) => ({ ...o, role: roleMap[o.id] || null }));

  return Response.json({ orgs: withRoles });
}
