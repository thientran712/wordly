// Luật "nguồn từ" dùng chung cho widget (Swift) và push (JS) — spec
// 2026-10-15-shared-word-source-design.md §2.2. Hai bên cùng kiểm bằng
// shared/fixtures/word-pool-cases.json; sửa luật ở đây thì phải sửa cả Swift
// và bộ mẫu, nếu không widget và push lại lệch nhau (đúng lỗi spec §0.1).
import { normalizeWord } from "../email/select-word-for-email.js";

export const MAX_PINNED = 30;

export const DEFAULT_WORD_SOURCE = Object.freeze({
  include_saved: true,
  include_bank: true,
  pinned_ids: Object.freeze([]),
  pinned_only: false,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bỏ id trùng (không phân biệt hoa thường — Postgres uuid cũng vậy), giữ thứ tự ghim. */
function dedupeIds(list) {
  const seen = new Set();
  const out = [];
  for (const id of list) {
    const key = String(id).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/**
 * Dòng word_source_settings (hoặc null khi chưa có) → cài đặt đầy đủ.
 * App cũ chưa từng gửi gì → mặc định (đã lưu ✓, trộn kho ✓, không ghim).
 * Tắt "Từ đã lưu" thì kho luôn bật — UI khoá ô này, server ép lại cho chắc.
 */
export function normalizeWordSource(row) {
  const r = row || {};
  const include_saved = typeof r.include_saved === "boolean" ? r.include_saved : DEFAULT_WORD_SOURCE.include_saved;
  const include_bank = !include_saved || (typeof r.include_bank === "boolean" ? r.include_bank : DEFAULT_WORD_SOURCE.include_bank);
  return {
    include_saved,
    include_bank,
    pinned_ids: Array.isArray(r.pinned_ids) ? dedupeIds(r.pinned_ids.filter((x) => typeof x === "string")) : [],
    pinned_only: r.pinned_only === true,
  };
}

/** Body PUT /api/word-source (ranh giới tin cậy với app) → { ok, value } | { ok: false, error }. */
export function validateWordSourceBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body không hợp lệ" };
  const { include_saved, include_bank, pinned_ids, pinned_only } = body;
  for (const [k, v] of Object.entries({ include_saved, include_bank, pinned_only })) {
    if (typeof v !== "boolean") return { ok: false, error: `${k} phải là true/false` };
  }
  if (!Array.isArray(pinned_ids) || !pinned_ids.every((x) => typeof x === "string" && UUID_RE.test(x))) {
    return { ok: false, error: "pinned_ids phải là danh sách id từ đã lưu" };
  }
  const ids = dedupeIds(pinned_ids);
  // Từ chối thay vì cắt bớt: app đã chặn ở 30 ("Tối đa 30 từ ghim"), quá 30
  // là app lỗi — cắt lặng lẽ sẽ làm mất ghim người dùng không hề biết.
  if (ids.length > MAX_PINNED) return { ok: false, error: `Tối đa ${MAX_PINNED} từ ghim` };
  return { ok: true, value: normalizeWordSource({ include_saved, include_bank, pinned_ids: ids, pinned_only }) };
}

/**
 * Dựng pool từ cài đặt + danh sách đã lưu ({id, word}, đã lọc: còn is_saved,
 * chưa xoá mềm) + lô kho ({id, word}).
 *
 * Trả { personal, pinned, bank, usesBank }:
 *  - personal: từ của bạn (mỗi từ một lần; từ ghim nằm trong đây)
 *  - pinned:   từ ghim hợp lệ (widget cho xuất hiện 2 lần mỗi vòng)
 *  - bank:     từ kho dùng được, đã bỏ trùng chữ với từ của bạn
 *  - usesBank: pool có dùng kho không (push cần biết khi bank truyền vào rỗng)
 */
export function buildPool(settings, saved, bank) {
  const s = normalizeWordSource(settings);
  const savedList = saved || [];
  const byId = new Map(savedList.map((w) => [String(w.id).toLowerCase(), w]));

  // Ghim trỏ tới từ đã bỏ lưu/xoá thì bỏ qua KHI ĐỌC, không xoá khỏi mảng —
  // hoàn tác xoá là từ tự ghim lại (§2.2 mục 3).
  const pinned = s.pinned_ids.map((id) => byId.get(id)).filter(Boolean);

  if (s.pinned_only && pinned.length > 0) {
    return { personal: pinned, pinned, bank: [], usesBank: false };
  }

  const personal = s.include_saved
    ? savedList
    : pinned; // tắt "đã lưu" nhưng còn ghim → từ ghim vẫn là từ của bạn

  // Từ của bạn rỗng → luôn dùng kho, kể cả khi tắt trộn (không để widget/push trống)
  const usesBank = s.include_bank || personal.length === 0;
  const own = new Set(personal.map((w) => normalizeWord(w.word)));
  const bankOut = [];
  if (usesBank) {
    for (const w of bank || []) {
      const key = normalizeWord(w.word);
      if (!key || own.has(key)) continue;
      own.add(key); // bỏ cả từ kho trùng nhau trong cùng lô
      bankOut.push(w);
    }
  }
  return { personal, pinned, bank: bankOut, usesBank };
}
