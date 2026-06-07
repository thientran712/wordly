const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];
const RESEND_AFTER_DAYS = 1;

function getTargetLevels(skillLevel) {
  const idx = LEVEL_ORDER.indexOf(skillLevel);
  if (idx === -1) return LEVEL_ORDER.slice(2);
  return LEVEL_ORDER.slice(idx);
}

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

// ── PRIORITY 3: System words by level ───────────────────────────────────────
async function pickFromSystemWords(supabase, userId, skillLevel) {
  const targetLevels = getTargetLevels(skillLevel);

  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", userId);
  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));

  const levelFetches = await Promise.all(
    targetLevels.map(lvl =>
      supabase.from("words").select("*").eq("level", lvl).limit(80)
    )
  );
  const pool = levelFetches
    .flatMap(({ data }) => data || [])
    .filter(w => !learnedSet.has(w.id));

  if (pool.length > 0) {
    return { word: pool[Math.floor(Math.random() * pool.length)], source: "new", skillLevel };
  }

  const { data: allCandidates } = await supabase
    .from("words").select("*").order("level", { ascending: false }).limit(500);
  const anyNew = (allCandidates || []).filter(w => !learnedSet.has(w.id));
  if (anyNew.length > 0) {
    const top = anyNew.slice(0, Math.min(30, anyNew.length));
    return { word: top[Math.floor(Math.random() * top.length)], source: "new_expanded", skillLevel };
  }

  const { data: fallback } = await supabase.from("words").select("*").limit(20);
  return fallback?.length
    ? { word: fallback[Math.floor(Math.random() * fallback.length)], source: "fallback", skillLevel }
    : null;
}

// ── Main export: atomically claims a word so no two slots pick the same one ──
// Replaces the old select-then-mark flow. The journal/translate claim is atomic
// (the DB UPDATE itself reserves the word), so concurrent slots never collide.
export async function claimBestWordForUser(supabase, userId) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("skill_level")
    .eq("id", userId)
    .single();
  const skillLevel = profile?.skill_level || "B1";

  // Priority 1: journal (atomic claim)
  const fromJournal = await claimFromJournal(supabase, userId);
  if (fromJournal) return { ...fromJournal, skillLevel, _alreadyMarked: true };

  // Priority 2: translate history (atomic claim)
  const fromHistory = await claimFromTranslateHistory(supabase, userId);
  if (fromHistory) return { ...fromHistory, skillLevel, _alreadyMarked: true };

  // Priority 3: system words (random, no dedup needed across slots)
  const sys = await pickFromSystemWords(supabase, userId, skillLevel);
  return sys ? { ...sys, _alreadyMarked: false } : null;
}

// Kept for backward compat — non-atomic select (used by debug endpoint).
export async function selectBestWordForUser(supabase, userId) {
  const { data: profile } = await supabase
    .from("profiles").select("skill_level").eq("id", userId).single();
  const skillLevel = profile?.skill_level || "B1";

  const { data: journal } = await supabase
    .from("journal_entries")
    .select("id, word, meaning_vi, last_emailed_at")
    .eq("user_id", userId)
    .order("last_emailed_at", { ascending: true, nullsFirst: true });
  const jCand = (journal || []).filter(e => !e.last_emailed_at || daysSince(e.last_emailed_at) >= RESEND_AFTER_DAYS);
  if (jCand.length) {
    const p = jCand[0];
    return { word: { id: `journal_${p.id}`, word: p.word, meaning_vi: p.meaning_vi || "", _journal_id: p.id, _type: "journal" }, source: "journal", journalId: p.id, skillLevel };
  }
  return pickFromSystemWords(supabase, userId, skillLevel);
}

// Call this after email is sent — only needed for non-atomic paths (system words
// don't need marking). For atomic journal/translate claims the word is already
// marked during the claim, so this becomes a no-op (guarded by _alreadyMarked).
export async function markWordEmailed(supabase, selected) {
  if (selected._alreadyMarked) return; // already claimed atomically
  const now = new Date().toISOString();

  if (selected.journalId) {
    const { data: cur } = await supabase
      .from("journal_entries").select("email_count").eq("id", selected.journalId).single();
    await supabase
      .from("journal_entries")
      .update({ last_emailed_at: now, email_count: (cur?.email_count || 0) + 1 })
      .eq("id", selected.journalId);
  } else if (selected.translateId) {
    const { data: cur } = await supabase
      .from("translate_history").select("email_count").eq("id", selected.translateId).single();
    await supabase
      .from("translate_history")
      .update({ last_emailed_at: now, email_count: (cur?.email_count || 0) + 1 })
      .eq("id", selected.translateId);
  }
}
