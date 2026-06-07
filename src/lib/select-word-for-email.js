const RESEND_AFTER_DAYS = 1;

function daysSince(isoString) {
  if (!isoString) return Infinity;
  // Compare calendar dates only (not hours), so "sent today" = 0 days ago
  const sent = new Date(isoString);
  const sentDate = new Date(sent.getFullYear(), sent.getMonth(), sent.getDate());
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return (todayDate - sentDate) / 86400000;
}

// Today's date string (UTC) used for the atomic claim cutoff.
// "claimed today" means last_emailed_at >= start of today UTC.
function startOfTodayUtcISO() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

// ── ATOMIC CLAIM: journal ───────────────────────────────────────────────────
// Try to atomically claim the oldest un-emailed journal entry.
// Returns the claimed word, or null if none available / all already claimed today.
async function claimFromJournal(supabase, userId) {
  const todayStart = startOfTodayUtcISO();

  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, word, meaning_vi, last_emailed_at, email_count")
    .eq("user_id", userId)
    .order("last_emailed_at", { ascending: true, nullsFirst: true });

  if (!entries?.length) return null;

  // Candidates not emailed today (calendar-date check)
  const candidates = entries.filter(e =>
    !e.last_emailed_at || daysSince(e.last_emailed_at) >= RESEND_AFTER_DAYS
  );

  for (const cand of candidates) {
    // Atomic claim: only succeeds if no one else claimed it today in between.
    // Condition mirrors the candidate filter so the DB enforces uniqueness.
    let query = supabase
      .from("journal_entries")
      .update({
        last_emailed_at: new Date().toISOString(),
        email_count: (cand.email_count || 0) + 1,
      })
      .eq("id", cand.id)
      .eq("user_id", userId);

    if (cand.last_emailed_at == null) {
      query = query.is("last_emailed_at", null);
    } else {
      // must still be < today's start (not yet re-claimed today)
      query = query.lt("last_emailed_at", todayStart);
    }

    const { data: claimed } = await query.select("id, word, meaning_vi").maybeSingle();
    if (claimed) {
      return {
        word: {
          id: `journal_${claimed.id}`,
          word: claimed.word,
          meaning_vi: claimed.meaning_vi || "",
          phonetic: null, level: null, pos: null, def_en: null,
          _journal_id: claimed.id, _type: "journal",
        },
        source: "journal",
        journalId: claimed.id,
      };
    }
    // else: another slot claimed it first — try the next candidate
  }
  return null;
}

// ── ATOMIC CLAIM: translate history ─────────────────────────────────────────
async function claimFromTranslateHistory(supabase, userId) {
  const todayStart = startOfTodayUtcISO();

  const { data: entries } = await supabase
    .from("translate_history")
    .select("id, source_text, translated_text, direction, last_emailed_at, email_count")
    .eq("user_id", userId)
    .eq("direction", "EN→VI")
    .order("last_emailed_at", { ascending: true, nullsFirst: true });

  if (!entries?.length) return null;

  const candidates = entries.filter(e =>
    !e.last_emailed_at || daysSince(e.last_emailed_at) >= RESEND_AFTER_DAYS
  );
  // Prefer single-word entries (not sentences)
  candidates.sort((a, b) => {
    const aWord = !/\s/.test(a.source_text.trim()) ? 0 : 1;
    const bWord = !/\s/.test(b.source_text.trim()) ? 0 : 1;
    return aWord - bWord;
  });

  for (const cand of candidates) {
    let query = supabase
      .from("translate_history")
      .update({
        last_emailed_at: new Date().toISOString(),
        email_count: (cand.email_count || 0) + 1,
      })
      .eq("id", cand.id)
      .eq("user_id", userId);

    if (cand.last_emailed_at == null) {
      query = query.is("last_emailed_at", null);
    } else {
      query = query.lt("last_emailed_at", todayStart);
    }

    const { data: claimed } = await query.select("id, source_text, translated_text").maybeSingle();
    if (claimed) {
      return {
        word: {
          id: `translate_${claimed.id}`,
          word: claimed.source_text,
          meaning_vi: claimed.translated_text,
          phonetic: null, level: null, pos: null, def_en: null,
          _translate_id: claimed.id, _type: "translate_history",
        },
        source: "translate_history",
        translateId: claimed.id,
      };
    }
  }
  return null;
}

// ── Main export: claims a word from user's own content only ──────────────────
// Returns null if user has no journal entries or translate history to send.
export async function claimBestWordForUser(supabase, userId) {
  // Priority 1: journal (atomic claim)
  const fromJournal = await claimFromJournal(supabase, userId);
  if (fromJournal) return { ...fromJournal, _alreadyMarked: true };

  // Priority 2: translate history (atomic claim)
  const fromHistory = await claimFromTranslateHistory(supabase, userId);
  if (fromHistory) return { ...fromHistory, _alreadyMarked: true };

  return null;
}

