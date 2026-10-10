// Ghép hàng suggestion_log với dữ liệu thật (translate_history/journal_entries/
// words) thành item hiển thị cho tab "Đã gợi ý". Tách ra khỏi route để test
// được mà không cần DB.
//
// CHÚ Ý: bảng `words` ở production KHÔNG có cột def_vi — chỉ có def_en (xem
// select-word-for-email.js và BankWords.swift, cả hai đều tránh def_vi vì lý
// do này). Không select/đọc def_vi ở đây.
export function buildSuggestionItems(logs, { translateRows, journalRows, bankRows }) {
  const translateMap = new Map((translateRows || []).map(r => [r.id, r]));
  const journalMap = new Map((journalRows || []).map(r => [r.id, r]));
  const bankMap = new Map((bankRows || []).map(r => [r.id, r]));

  return (logs || []).map(log => {
    if (log.entry_type === "translate_history") {
      const row = translateMap.get(log.entry_id);
      return row && {
        id: log.id, source: log.source, entry_type: log.entry_type, entry_id: log.entry_id,
        shown_at: log.shown_at, word: row.source_text, meaning: row.translated_text,
        state: row.state, due_at: row.due_at, review_count: row.review_count,
      };
    }
    if (log.entry_type === "journal_entries") {
      const row = journalMap.get(log.entry_id);
      return row && {
        id: log.id, source: log.source, entry_type: log.entry_type, entry_id: log.entry_id,
        shown_at: log.shown_at, word: row.content, meaning: null,
        state: row.state, due_at: row.due_at, review_count: row.review_count,
      };
    }
    const row = bankMap.get(log.bank_word_id);
    return row && {
      id: log.id, source: log.source, entry_type: log.entry_type, bank_word_id: log.bank_word_id,
      shown_at: log.shown_at, word: row.word, meaning: row.def_en,
      state: null, due_at: null, review_count: null,
    };
  }).filter(Boolean); // referenced row may have been deleted since being logged
}
