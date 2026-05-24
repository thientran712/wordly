const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function getTargetLevels(skillLevel) {
  const idx = LEVEL_ORDER.indexOf(skillLevel);
  if (idx === -1) return LEVEL_ORDER.slice(2);
  return LEVEL_ORDER.slice(idx);
}

export async function selectBestWordForUser(supabase, userId) {

  const { data: profile } = await supabase
    .from("profiles")
    .select("skill_level")
    .eq("id", userId)
    .single();

  const skillLevel = profile?.skill_level || "B1";
  const targetLevels = getTargetLevels(skillLevel);

  // PRIORITY 1: Từ mới theo level user (email chỉ gửi từ mới)
  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", userId);

  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));

  const levelFetches = await Promise.all(
    targetLevels.map(lvl => supabase.from("words").select("*").eq("level", lvl).limit(80))
  );
  const pool = levelFetches.flatMap(({ data }) => data || []).filter(w => !learnedSet.has(w.id));

  if (pool.length > 0) {
    return { word: pool[Math.floor(Math.random() * pool.length)], source: "new", skillLevel };
  }

  // PRIORITY 3: Mở rộng sang level khác
  const { data: allCandidates } = await supabase
    .from("words").select("*").order("level", { ascending: false }).limit(500);

  const anyNew = (allCandidates || []).filter(w => !learnedSet.has(w.id));
  if (anyNew.length > 0) {
    const top = anyNew.slice(0, Math.min(30, anyNew.length));
    return { word: top[Math.floor(Math.random() * top.length)], source: "new_expanded", skillLevel };
  }

  // FALLBACK
  const { data: fallback } = await supabase.from("words").select("*").limit(20);
  return fallback?.length
    ? { word: fallback[Math.floor(Math.random() * fallback.length)], source: "fallback", skillLevel }
    : null;
}
