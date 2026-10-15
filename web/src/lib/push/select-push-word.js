// Chọn từ đã lưu cho một push nhắc ôn. Push KHÔNG đổi lịch ôn của từ (nhận
// thông báo ≠ đã ôn), nên không thể dựa vào state/due_at để xoay vòng — trước
// 15/10/2026 làm vậy và lần nào cũng lấy lại vài từ lưu sớm nhất. Thứ tự giờ:
// từ chưa từng hiện (push/widget, theo suggestion_log) trước, rồi từ hiện lâu
// nhất; cùng mức thì từ quá hạn ôn (hạn sớm nhất) trước, rồi từ mới theo thứ tự lưu.

/** Cửa sổ suggestion_log để xét "đã hiện" — quá cửa sổ coi như chưa hiện. */
export const SHOWN_WINDOW_DAYS = 60;
const MAX_ROWS = 1000;

/** Map id → lần hiện gần nhất (ms) từ các dòng suggestion_log. */
export function lastShownMap(logRows, key) {
  const m = new Map();
  for (const r of logRows || []) {
    const id = r?.[key];
    if (id == null) continue;
    const t = r.shown_at ? Date.parse(r.shown_at) : Date.now();
    if (!(m.get(id) >= t)) m.set(id, t);
  }
  return m;
}

const time = (v) => (v ? Date.parse(v) : Infinity);

/** Từ nên nhắc tiếp theo trong `rows` (đã lọc: đã lưu, chưa xoá), hoặc null. */
export function pickPushWord(rows, shownAt) {
  let best = null;
  let bestKey = null;
  for (const r of rows || []) {
    const isDue = r.state !== "new" && r.due_at && time(r.due_at) <= Date.now();
    const key = [
      shownAt.get(r.id) ?? -Infinity,   // chưa hiện = -∞ → lên đầu
      isDue ? 0 : 1,
      isDue ? time(r.due_at) : time(r.saved_at),
    ];
    if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] &&
        (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = r;
      bestKey = key;
    }
  }
  return best;
}

/** Một từ đã lưu (Anh→Việt) cho push, hoặc null nếu người dùng chưa lưu từ nào. */
export async function selectPushWord(supabase, userId, shownAt) {
  const { data } = await supabase
    .from("translate_history")
    .select("id, source_text, translated_text, state, due_at, saved_at")
    .eq("user_id", userId)
    .eq("direction", "EN→VI")
    .eq("is_saved", true)
    .is("deleted_at", null)
    .order("saved_at", { ascending: true })
    .limit(MAX_ROWS);
  const row = pickPushWord(data || [], shownAt);
  return row ? { id: row.id, word: row.source_text, meaning_vi: row.translated_text || "" } : null;
}
