import { checkSlotTime } from "./slot-time.js";

/** Kiểm giờ mới của một khung (email_slots | push_slots) so với các khung
 * KHÁC của cùng người dùng. `excludeId` = khung đang sửa (không tự trùng).
 * `supabase` là client RLS của người dùng. */
export async function guardSlotTime(supabase, { table, userId, value, excludeId = null }) {
  const { data, error } = await supabase.from(table).select("id, send_time").eq("user_id", userId);
  if (error) return { ok: false, status: 500, error: error.message };
  const others = (data || []).filter((s) => s.id !== excludeId).map((s) => s.send_time);
  const r = checkSlotTime(value, others);
  return r.ok ? r : { ...r, status: 400 };
}
