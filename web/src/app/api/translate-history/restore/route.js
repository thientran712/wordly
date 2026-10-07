import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { parseRestoreIds } from "@/lib/learning/history-delete";

// Hoàn tác xoá mềm: { ids } là danh sách DELETE /api/translate-history trả về.
export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseRestoreIds(await request.json().catch(() => null));
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("translate_history")
    .update({ deleted_at: null })
    .eq("user_id", user.id)
    .in("id", parsed.ids)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, restored: (data || []).length });
}
