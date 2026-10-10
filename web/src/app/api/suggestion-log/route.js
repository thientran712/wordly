import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildSuggestionItems } from "@/lib/learning/build-suggestion-items";

const PAGE_SIZE_MAX = 50;

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ items: [], hasMore: false });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), PAGE_SIZE_MAX);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const admin = createAdminClient();

  const { data: logs, error } = await admin
    .from("suggestion_log")
    .select("id, source, entry_type, entry_id, bank_word_id, shown_at")
    .eq("user_id", user.id)
    .order("shown_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = (logs || []).length > limit;
  const page = (logs || []).slice(0, limit);

  const translateIds = page.filter(l => l.entry_type === "translate_history").map(l => l.entry_id);
  const journalIds = page.filter(l => l.entry_type === "journal_entries").map(l => l.entry_id);
  const bankIds = page.filter(l => l.entry_type === "bank").map(l => l.bank_word_id);

  // Lọc thêm user_id + deleted_at is null trên translate_history/journal_entries:
  // entry_id trong suggestion_log không tự nó chứng minh quyền sở hữu (log-shown
  // không kiểm điều này khi ghi), nên phải tự chặn ở đây — nếu không, 1 user có
  // thể POST id của người khác vào log-shown rồi GET lại được nội dung đó.
  const [{ data: translateRows, error: tErr }, { data: journalRows, error: jErr }, { data: bankRows, error: bErr }] = await Promise.all([
    translateIds.length
      ? admin.from("translate_history").select("id, source_text, translated_text, state, due_at, review_count")
          .in("id", translateIds).eq("user_id", user.id).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    journalIds.length
      ? admin.from("journal_entries").select("id, content, state, due_at, review_count")
          .in("id", journalIds).eq("user_id", user.id).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    bankIds.length
      // words.def_vi KHÔNG tồn tại ở production — chỉ select def_en (xem
      // build-suggestion-items.js). words là bảng chung, không có user_id.
      ? admin.from("words").select("id, word, def_en").in("id", bankIds)
      : Promise.resolve({ data: [] }),
  ]);

  if (tErr) return Response.json({ error: tErr.message }, { status: 500 });
  if (jErr) return Response.json({ error: jErr.message }, { status: 500 });
  if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

  const items = buildSuggestionItems(page, { translateRows, journalRows, bankRows });

  return Response.json({ items, hasMore });
}
