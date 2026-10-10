import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const [{ data: translateRows }, { data: journalRows }, { data: bankRows }] = await Promise.all([
    translateIds.length
      ? admin.from("translate_history").select("id, source_text, translated_text, state, due_at, review_count").in("id", translateIds)
      : Promise.resolve({ data: [] }),
    journalIds.length
      ? admin.from("journal_entries").select("id, content, state, due_at, review_count").in("id", journalIds)
      : Promise.resolve({ data: [] }),
    bankIds.length
      ? admin.from("words").select("id, word, def_vi, def_en").in("id", bankIds)
      : Promise.resolve({ data: [] }),
  ]);

  const translateMap = new Map((translateRows || []).map(r => [r.id, r]));
  const journalMap = new Map((journalRows || []).map(r => [r.id, r]));
  const bankMap = new Map((bankRows || []).map(r => [r.id, r]));

  const items = page.map(log => {
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
      shown_at: log.shown_at, word: row.word, meaning: row.def_vi || row.def_en,
      state: null, due_at: null, review_count: null,
    };
  }).filter(Boolean); // referenced row may have been deleted since being logged

  return Response.json({ items, hasMore });
}
