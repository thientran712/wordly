// WidgetWordItem.id trên iOS (mobile/ios/.../AppGroupStorage.swift,
// BankWords.swift) là: id thật của translate_history cho từ cá nhân, hoặc
// "bank-<uuid>" cho từ kho dùng chung. API log-shown cần tách hai loại để
// ghi đúng cột (entry_id vs bank_word_id) vào suggestion_log.

const BANK_PREFIX = "bank-";

export function parseWidgetItemId(id) {
  if (typeof id !== "string" || !id.trim()) return null;

  if (id.startsWith(BANK_PREFIX)) {
    const bankId = id.slice(BANK_PREFIX.length).trim();
    if (!bankId) return null;
    return { entry_type: "bank", bank_word_id: bankId };
  }

  return { entry_type: "translate_history", entry_id: id };
}
