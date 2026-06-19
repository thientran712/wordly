// Fixed email re-send schedule: index = current review_count before this send.
// review_count 0 → send again in 1 day, 1 → 3 days, 2 → 7 days, etc.
// Last bucket (5+) stays at 90 days indefinitely.
export const EMAIL_INTERVALS = [1, 3, 7, 14, 30, 90];

/**
 * Pick one eligible row using a 2-priority algorithm.
 * Rows arriving here are already pre-filtered to state='new' OR due_at<=now.
 *
 *  1. Due now — state != 'new', oldest due_at first (longest overdue gets priority)
 *  2. New     — state == 'new', oldest created_at first (FIFO introduction)
 *
 * `excludeIds` removes candidates already picked for this email batch.
 * Returns { row, step } or null.
 */
export function pickFromRows(rows, { excludeIds = new Set() } = {}) {
  const candidates = rows.filter(r => !excludeIds.has(r.id));
  if (candidates.length === 0) return null;

  // Priority 1: overdue (state != 'new' and due_at has passed)
  const due = candidates
    .filter(r => r.state !== "new" && r.due_at)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  if (due.length > 0) return { row: due[0], step: "due" };

  // Priority 2: brand new, never sent
  const fresh = candidates
    .filter(r => r.state === "new")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (fresh.length > 0) return { row: fresh[0], step: "new" };

  return null;
}

/**
 * Pick `count` distinct cards from `rows`, applying pickFromRows repeatedly
 * while excluding ids already picked (and ids from `avoidIds`, e.g. the
 * entries sent in the previous email — only honored on the first pick so a
 * truly empty queue doesn't block all picks).
 */
export function pickMultipleFromRows(rows, count, { avoidIds = new Set() } = {}) {
  const picks = [];
  const excluded = new Set();

  for (let i = 0; i < count; i++) {
    // First try excluding both already-picked ids and the previous email's ids.
    let result = pickFromRows(rows, { excludeIds: new Set([...excluded, ...avoidIds]) });
    // If that leaves nothing (e.g. only the "avoid" card exists), allow it.
    if (!result && avoidIds.size > 0) {
      result = pickFromRows(rows, { excludeIds: excluded });
    }
    if (!result) break;
    picks.push(result);
    excluded.add(result.row.id);
  }

  return picks;
}

const TRANSLATE_FIELDS = "id, source_text, translated_text, state, stability, difficulty, due_at, review_count, lapses, last_reviewed_at, scheduled_days, elapsed_days, saved_at";
const JOURNAL_FIELDS = "id, content, state, stability, difficulty, due_at, review_count, lapses, last_reviewed_at, scheduled_days, elapsed_days, created_at";

/**
 * Loads the user's translate-history (EN→VI) and journal queues, picks
 * 2 translate words + 1 journal entry using the unified algorithm above.
 *
 * Returns:
 *   {
 *     words: [{ id, word, meaning_vi, step }, ...]  (0-2 items)
 *     journal: { id, content, step } | null
 *   }
 * or null if both queues are completely empty.
 */
export async function selectEmailContent(supabase, userId, { lastEntryIds = [] } = {}) {
  const now = new Date();
  const nowIso = now.toISOString();
  const avoidIds = new Set(lastEntryIds);

  // Only load rows that are actually eligible: new (never sent) or due now.
  // This avoids pulling the entire table into memory for users with large histories.
  const [{ data: translateRows }, { data: journalRows }] = await Promise.all([
    supabase
      .from("translate_history")
      .select(TRANSLATE_FIELDS)
      .eq("user_id", userId)
      .eq("direction", "EN→VI")
      .or(`state.eq.new,due_at.lte.${nowIso}`)
      .limit(200),
    supabase
      .from("journal_entries")
      .select(JOURNAL_FIELDS)
      .eq("user_id", userId)
      .or(`state.eq.new,due_at.lte.${nowIso}`)
      .limit(200),
  ]);

  // translate_history rows don't have created_at — use saved_at for step 2 ordering.
  const tRows = (translateRows || []).map(r => ({ ...r, created_at: r.saved_at }));
  const jRows = journalRows || [];

  const wordPicks = pickMultipleFromRows(tRows, 2, { avoidIds });
  const journalPicks = pickMultipleFromRows(jRows, 1, { avoidIds });

  if (wordPicks.length === 0 && journalPicks.length === 0) return null;

  return {
    words: wordPicks.map(({ row, step }) => ({
      id: row.id,
      word: row.source_text,
      meaning_vi: row.translated_text,
      review_count: row.review_count ?? 0,
      step, // 'due' | 'new' | 'early'
    })),
    journal: journalPicks.length > 0
      ? {
          id: journalPicks[0].row.id,
          content: journalPicks[0].row.content,
          review_count: journalPicks[0].row.review_count ?? 0,
          step: journalPicks[0].step,
        }
      : null,
  };
}
