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

// ── PRIORITY 1: Journal words user đã note ──────────────────────────────────
// Ưu tiên: chưa gửi bao giờ → gửi lâu nhất (> 7 ngày)
async function pickFromJournal(supabase, userId) {
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, word, meaning_vi, last_emailed_at, email_count, created_at")
    .eq("user_id", userId)
    .order("last_emailed_at", { ascending: true, nullsFirst: true });

  if (!entries?.length) return null;

  // Never emailed first, then oldest-emailed (> 7 days ago)
  const candidates = entries.filter(e =>
    !e.last_emailed_at || daysSince(e.last_emailed_at) >= RESEND_AFTER_DAYS
  );
  if (!candidates.length) return null;

  const pick = candidates[0]; // already sorted: null last_emailed_at first, then oldest
  return {
    word: {
      id: `journal_${pick.id}`,
      word: pick.word,
      meaning_vi: pick.meaning_vi || "",
      phonetic: null,
      level: null,
      pos: null,
      def_en: null,
      _journal_id: pick.id,
      _type: "journal",
    },
    source: "journal",
    journalId: pick.id,
  };
}

// ── PRIORITY 2: Translate history (saved by user) ───────────────────────────
async function pickFromTranslateHistory(supabase, userId) {
  const { data: entries } = await supabase
    .from("translate_history")
    .select("id, source_text, translated_text, direction, last_emailed_at, saved_at")
    .eq("user_id", userId)
    .eq("direction", "EN→VI") // only EN words make sense for vocab email
    .order("last_emailed_at", { ascending: true, nullsFirst: true });

  if (!entries?.length) return null;

  const candidates = entries.filter(e =>
    !e.last_emailed_at || daysSince(e.last_emailed_at) >= RESEND_AFTER_DAYS
  );
  if (!candidates.length) return null;

  // Prefer single-word entries (not sentences)
  const words = candidates.filter(e => !/\s/.test(e.source_text.trim()));
  const pick = words[0] || candidates[0];

  return {
    word: {
      id: `translate_${pick.id}`,
      word: pick.source_text,
      meaning_vi: pick.translated_text,
      phonetic: null,
      level: null,
      pos: null,
      def_en: null,
      _translate_id: pick.id,
      _type: "translate_history",
    },
    source: "translate_history",
    translateId: pick.id,
  };
}

// ── PRIORITY 3: System words by level (original logic) ──────────────────────
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

  // Expand to all levels
  const { data: allCandidates } = await supabase
    .from("words").select("*").order("level", { ascending: false }).limit(500);
  const anyNew = (allCandidates || []).filter(w => !learnedSet.has(w.id));
  if (anyNew.length > 0) {
    const top = anyNew.slice(0, Math.min(30, anyNew.length));
    return { word: top[Math.floor(Math.random() * top.length)], source: "new_expanded", skillLevel };
  }

  // Final fallback
  const { data: fallback } = await supabase.from("words").select("*").limit(20);
  return fallback?.length
    ? { word: fallback[Math.floor(Math.random() * fallback.length)], source: "fallback", skillLevel }
    : null;
}

// ── Main export ──────────────────────────────────────────────────────────────
export async function selectBestWordForUser(supabase, userId) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("skill_level")
    .eq("id", userId)
    .single();
  const skillLevel = profile?.skill_level || "B1";

  // Priority 1: journal
  const fromJournal = await pickFromJournal(supabase, userId);
  if (fromJournal) return { ...fromJournal, skillLevel };

  // Priority 2: translate history
  const fromHistory = await pickFromTranslateHistory(supabase, userId);
  if (fromHistory) return { ...fromHistory, skillLevel };

  // Priority 3: system words
  return pickFromSystemWords(supabase, userId, skillLevel);
}

// Call this after email is sent to update tracking
export async function markWordEmailed(supabase, selected) {
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
