// Validate body PUT /api/widget/schedule (spec 2026-10-15 §3, §7) — ranh giới
// tin cậy với app. App gửi lịch 48 giờ tới: [{ shown_at, id }] với id là
// WidgetWordItem.id (uuid từ đã lưu, hoặc "bank-<uuid>" từ kho).
import { parseWidgetItemId } from "./parse-widget-item-id.js";

export const MAX_SCHEDULE_ENTRIES = 200;
const H = 60 * 60 * 1000;
// Lùi 1 giờ: lịch tính trên máy có thể bắt đầu từ slot đang hiện (đã bắt đầu
// trước lúc gửi). Tới 49 giờ: lịch 48 giờ + dư cho đồng hồ máy lệch.
const PAST_MS = 1 * H;
const FUTURE_MS = 49 * H;

/**
 * → { ok: true, value: [{ shown_at, entry_id, bank_word_id }], dropped }
 *   | { ok: false, error }
 *
 * Dòng hỏng (id lạ, giờ không đọc được, ngoài khung, trùng) bị BỎ chứ không
 * làm hỏng cả lịch: một dòng lỗi không nên khiến push mất hết thông tin widget.
 * Sai hình dạng body hoặc quá 200 dòng mới là lỗi — đó là app gọi sai.
 */
export function validateScheduleBody(body, now = new Date()) {
  const entries = body?.entries;
  if (!Array.isArray(entries)) return { ok: false, error: "entries phải là một danh sách" };
  if (entries.length > MAX_SCHEDULE_ENTRIES) {
    return { ok: false, error: `Tối đa ${MAX_SCHEDULE_ENTRIES} dòng lịch` };
  }

  const nowMs = now.getTime();
  const seen = new Set();
  const value = [];
  for (const e of entries) {
    const t = typeof e?.shown_at === "string" ? Date.parse(e.shown_at) : NaN;
    const parsed = parseWidgetItemId(e?.id);
    if (!parsed || !Number.isFinite(t) || t < nowMs - PAST_MS || t > nowMs + FUTURE_MS) continue;
    const row = {
      shown_at: new Date(t).toISOString(),
      entry_id: parsed.entry_id?.toLowerCase() ?? null,
      bank_word_id: parsed.bank_word_id?.toLowerCase() ?? null,
    };
    const key = `${row.shown_at}|${row.entry_id}|${row.bank_word_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    value.push(row);
  }
  return { ok: true, value, dropped: entries.length - value.length };
}
