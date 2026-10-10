import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeScheduleUpdate, validateScheduleRequest } from "@/lib/learning/schedule-adjustment";

const TABLE_BY_ENTRY_TYPE = {
  translate_history: "translate_history",
  journal_entries: "journal_entries",
};

export async function PATCH(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { error: validationError } = validateScheduleRequest(body);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const { entry_type, entry_id, rating } = body;
  const table = TABLE_BY_ENTRY_TYPE[entry_type];
  const admin = createAdminClient();

  const { data: current, error: fetchError } = await admin
    .from(table)
    .select("review_count")
    .eq("id", entry_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!current) return Response.json({ error: "Không tìm thấy mục này" }, { status: 404 });

  const update = computeScheduleUpdate(current, rating);

  const { error: updateError } = await admin
    .from(table)
    .update({ ...update, last_reviewed_at: new Date().toISOString() })
    .eq("id", entry_id)
    .eq("user_id", user.id);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ success: true, ...update });
}
