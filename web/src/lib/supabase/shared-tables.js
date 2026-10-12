// Bảng DÙNG CHUNG mọi người dùng (kho từ, cache AI/dịch, danh mục spinner) —
// không có user_id nên RLS theo người dùng không áp dụng; route của người
// dùng đọc/ghi các bảng này bằng service role qua createSharedClient().
// Bảng có dữ liệu riêng người dùng KHÔNG được nằm ở đây: dùng createClient()
// để RLS (auth.uid() = user_id) chặn rò chéo.
export const SHARED_TABLES = new Set([
  "words",
  "word_layers",
  "word_ai_content",
  "word_dictionary_cache",
  "translation_cache",
  "spinner_vocab",
  "spinner_topics",
  "spinner_interview_questions",
  "spinner_deep_talk",
]);

/** Bọc client service role: chỉ cho .from() bảng dùng chung và .rpc()
 * (bộ đếm rate limit). Không lộ auth.admin hay storage. */
export function restrictToSharedTables(client) {
  return {
    from(table) {
      if (!SHARED_TABLES.has(table)) {
        throw new Error(`"${table}" không phải bảng dùng chung — dùng createClient() (RLS)`);
      }
      return client.from(table);
    },
    rpc: (...args) => client.rpc(...args),
  };
}
