// Xoá mềm lịch sử dịch / sổ tay. Dòng bị xoá chỉ được đánh dấu `deleted_at`,
// không biến mất khỏi DB → hoàn tác được, và cứu được khi người dùng bấm nhầm
// (7/10/2026: "Xoá hết" từng xoá cứng cả từ đã lưu, project không có backup).

export const MAX_RESTORE_IDS = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Xoá hết" chỉ xoá dòng CHƯA lưu; từ đã lưu luôn được giữ. */
export function clearAllTargets(rows) {
  return (rows || []).filter((r) => !r.is_saved && !r.deleted_at).map((r) => r.id);
}

/** Body của POST /restore: { ids: uuid[] } → { ids } hoặc { error }. */
export function parseRestoreIds(body) {
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return { error: "ids must be a non-empty array" };
  if (ids.length > MAX_RESTORE_IDS) return { error: `at most ${MAX_RESTORE_IDS} ids` };
  if (!ids.every((id) => typeof id === "string" && UUID.test(id))) return { error: "invalid id" };
  return { ids: [...new Set(ids)] };
}
