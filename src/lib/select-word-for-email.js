import { predictRetrievability, dbToCard } from "@/lib/fsrs";

// Day-of-year, used for deterministic round-robin (no extra state needed).
function dayOfYear(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

// How many "low retrievability" candidates to round-robin between in step 3.
const EARLY_REVIEW_POOL = 3;

/**
 * Pick one card from a list of FSRS-enabled rows using the 4-step algorithm:
 *  1. Due now      — state != 'new' && due_at <= now, oldest due_at first
 *  2. New          — state == 'new', oldest created_at first
 *  3. Early review — lowest predicted retrievability R(t), round-robin top-N by day
 *  4. Empty        — null (caller decides fallback)
 *
 * `excludeIds` removes candidates outright (already picked for this email).
 * Returns { row, step } or null.
 */
export function pickFromRows(rows, { excludeIds = new Set(), now = new Date() } = {}) {
  const candidates = rows.filter(r => !excludeIds.has(r.id));
  if (candidates.length === 0) return null;

  // Step 1: due now
  const due = candidates
    .filter(r => r.state !== "new" && r.due_at && new Date(r.due_at) <= now)
    .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  if (due.length > 0) return { row: due[0], step: "due" };

  // Step 2: new (never reviewed)
  const fresh = candidates
    .filter(r => r.state === "new")
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (fresh.length > 0) return { row: fresh[0], step: "new" };

  // Step 3: early review — lowest R(t), round-robin among the weakest N
  const scored = candidates
    .map(r => ({ row: r, r: predictRetrievability(dbToCard(r), now) }))
    .sort((a, b) => a.r - b.r);
  if (scored.length > 0) {
    const pool = scored.slice(0, Math.min(EARLY_REVIEW_POOL, scored.length));
    const idx = dayOfYear(now) % pool.length;
    return { row: pool[idx].row, step: "early" };
  }

  return null;
}

/**
 * Pick `count` distinct cards from `rows`, applying pickFromRows repeatedly
 * while excluding ids already picked (and ids from `avoidIds`, e.g. the
 * entries sent in the previous email — only honored on the first pick so a
 * truly empty queue doesn't block all picks).
 */
export function pickMultipleFromRows(rows, count, { avoidIds = new Set(), now = new Date() } = {}) {
  const picks = [];
  const excluded = new Set();

  for (let i = 0; i < count; i++) {
    // First try excluding both already-picked ids and the previous email's ids.
    let result = pickFromRows(rows, { excludeIds: new Set([...excluded, ...avoidIds]), now });
    // If that leaves nothing (e.g. only the "avoid" card is available), allow it.
    if (!result && avoidIds.size > 0) {
      result = pickFromRows(rows, { excludeIds: excluded, now });
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
  const avoidIds = new Set(lastEntryIds);

  const [{ data: translateRows }, { data: journalRows }] = await Promise.all([
    supabase
      .from("translate_history")
      .select(TRANSLATE_FIELDS)
      .eq("user_id", userId)
      .eq("direction", "EN→VI"),
    supabase
      .from("journal_entries")
      .select(JOURNAL_FIELDS)
      .eq("user_id", userId),
  ]);

  // translate_history rows don't have created_at — use saved_at for step 2 ordering.
  const tRows = (translateRows || []).map(r => ({ ...r, created_at: r.saved_at }));
  const jRows = journalRows || [];

  const wordPicks = pickMultipleFromRows(tRows, 2, { avoidIds, now });
  const journalPicks = pickMultipleFromRows(jRows, 1, { avoidIds, now });

  if (wordPicks.length === 0 && journalPicks.length === 0) return null;

  return {
    words: wordPicks.map(({ row, step }) => ({
      id: row.id,
      word: row.source_text,
      meaning_vi: row.translated_text,
      step, // 'due' | 'new' | 'early'
    })),
    journal: journalPicks.length > 0
      ? { id: journalPicks[0].row.id, content: journalPicks[0].row.content, step: journalPicks[0].step }
      : null,
  };
}
