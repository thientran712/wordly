import { createClient } from "@/lib/supabase/server";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { parseRestoreIds } from "@/lib/learning/history-delete";
import { checkSaveAllowed } from "@/lib/billing/enforce";
import { billingForRequest } from "@/lib/billing/request";

// Hoàn tác xoá mềm: { ids } là danh sách DELETE /api/translate-history trả về.
export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = parseRestoreIds(await request.json().catch(() => null));
  if (parsed.error) return Response.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();

  // Wordly Pro (spec §3): từ xoá mềm không tính vào 30 từ; khôi phục TỪ ĐÃ LƯU
  // khi đã đủ 30 → 402 (paywall). Khôi phục dòng lịch sử chưa lưu: không chặn.
  const billing = await billingForRequest(request, user);
  if (billing.config.enforced) {
    const { count } = await supabase
      .from("translate_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("id", parsed.ids)
      .eq("is_saved", true)
      .not("deleted_at", "is", null);
    if (count > 0) {
      const blocked = await checkSaveAllowed({ ...billing, user });
      if (blocked) return blocked;
    }
  }

  const { data, error } = await supabase
    .from("translate_history")
    .update({ deleted_at: null })
    .eq("user_id", user.id)
    .in("id", parsed.ids)
    .select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, restored: (data || []).length });
}
