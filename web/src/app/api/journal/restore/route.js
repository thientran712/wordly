import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { parseRestoreIds } from "@/lib/learning/history-delete";

// Hoàn tác xoá mềm một mục sổ tay (anon + RLS như các route journal khác).
export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseRestoreIds(await request.json().catch(() => null));
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("journal_entries")
    .update({ deleted_at: null })
    .eq("user_id", user.id)
    .in("id", parsed.ids)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, restored: (data || []).length });
}
