import { checkSlotTime, normalizeTime } from "./slot-time.js";

/** Kiểm giờ mới của một khung (email_slots | push_slots) so với các khung
 * KHÁC của cùng người dùng. `excludeId` = khung đang sửa (không tự trùng).
 * `supabase` là client RLS của người dùng. */
export async function guardSlotTime(supabase, { table, userId, value, excludeId = null }) {
  const { data, error } = await supabase.from(table).select("id, send_time").eq("user_id", userId);
  if (error) return { ok: false, status: 500, error: error.message };
  // Gửi lại đúng giờ hiện tại của chính khung đó (kể cả giờ lẻ cũ như 08:15,
  // đặt trước luật mốc 30 phút) → không đổi gì, cho qua.
  const own = excludeId ? (data || []).find((s) => s.id === excludeId) : null;
  const unchanged = normalizeTime(value);
  if (own && unchanged && normalizeTime(own.send_time) === unchanged) return { ok: true, time: unchanged };
  const others = (data || []).filter((s) => s.id !== excludeId).map((s) => s.send_time);
  const r = checkSlotTime(value, others);
  return r.ok ? r : { ...r, status: 400 };
}
