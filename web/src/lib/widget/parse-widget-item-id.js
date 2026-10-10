// WidgetWordItem.id trên iOS (mobile/ios/.../AppGroupStorage.swift,
// BankWords.swift) là: id thật của translate_history cho từ cá nhân, hoặc
// "bank-<uuid>" cho từ kho dùng chung. API log-shown cần tách hai loại để
// ghi đúng cột (entry_id vs bank_word_id) vào suggestion_log.

const BANK_PREFIX = "bank-";

// Postgres' uuid column rejects anything else outright, but it does so by
// failing the WHOLE multi-row INSERT in /api/widget/log-shown — one garbage
// id would otherwise lose every valid id in the same batch. Validate here so
// a bad id is dropped, not fatal.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseWidgetItemId(id) {
  if (typeof id !== "string" || !id.trim()) return null;

  if (id.startsWith(BANK_PREFIX)) {
    const bankId = id.slice(BANK_PREFIX.length).trim();
    if (!UUID_RE.test(bankId)) return null;
    return { entry_type: "bank", bank_word_id: bankId };
  }

  if (!UUID_RE.test(id)) return null;
  return { entry_type: "translate_history", entry_id: id };
}
