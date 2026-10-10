// App iOS gọi khi tính lại batch widget (WidgetSync.refresh()/refreshBank()
// trong AppGroupStorage.swift) — KHÔNG phải mỗi lần render lock-screen
// (widget extension vẫn hoàn toàn read-only).
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWidgetItemId } from "@/lib/widget/parse-widget-item-id";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { items } = await request.json().catch(() => ({}));
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "items phải là một danh sách không rỗng" }, { status: 400 });
  }

  // Bỏ qua item không parse được thay vì làm fail cả batch — một id lỗi
  // không nên làm mất log của những id hợp lệ còn lại.
  const rows = items
    .map((item) => parseWidgetItemId(item?.id))
    .filter(Boolean)
    .map((parsed) => ({
      user_id: user.id,
      source: "widget",
      ...parsed,
    }));

  if (rows.length === 0) {
    return Response.json({ error: "Không có item hợp lệ nào trong danh sách" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("suggestion_log").insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, logged: rows.length });
}
