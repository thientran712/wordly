import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { getAllWordsCached } from "@/lib/words-cache";

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Trả về các level từ level hiện tại của user trở lên
function getTargetLevels(skillLevel) {
  const idx = LEVEL_ORDER.indexOf(skillLevel);
  if (idx === -1) return LEVEL_ORDER.slice(2); // default B1 trở lên
  return LEVEL_ORDER.slice(idx);
}

export async function GET(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const url = new URL(request.url);
  const exclude = url.searchParams.get("exclude");
  const now = new Date().toISOString();

  // Lấy skill_level của user từ profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("skill_level")
    .eq("id", user.id)
    .single();

  const skillLevel = profile?.skill_level || 'B1';
  const targetLevels = getTargetLevels(skillLevel);

  // Priority 0: Từ email hôm nay chưa được rate
  const { data: emailPref } = await supabase
    .from("email_preferences")
    .select("last_sent_word_id, last_sent_at")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .single();

  if (emailPref?.last_sent_word_id && emailPref?.last_sent_at) {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const sentStr = new Date(emailPref.last_sent_at).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const isToday = todayStr === sentStr;
    const notExcluded = !exclude || exclude !== emailPref.last_sent_word_id;

    if (isToday && notExcluded) {
      const { data: emailWordProgress } = await supabase
        .from("user_progress")
        .select("state")
        .eq("user_id", user.id)
        .eq("word_id", emailPref.last_sent_word_id)
        .single();

      if (!emailWordProgress || emailWordProgress.state === "new") {
        const { data: emailWord } = await supabase
          .from("words").select("*").eq("id", emailPref.last_sent_word_id).single();
        if (emailWord) {
          return Response.json({ word: emailWord, source: "email_today", progress: null });
        }
      }
    }
  }

  // Priority 1: Từ đến hạn ôn tập (bất kể level — đã học thì phải ôn)
  let reviewQuery = supabase
    .from("user_progress")
    .select(`
      word_id, stability, difficulty, state, due_at,
      words!inner(*)
    `)
    .eq("user_id", user.id)
    .lte("due_at", now)
    .in("state", ["learning", "review", "relearning"])
    .order("due_at", { ascending: true })
    .limit(1);

  if (exclude) reviewQuery = reviewQuery.neq("word_id", exclude);

  const { data: dueWords } = await reviewQuery;

  if (dueWords && dueWords.length > 0) {
    const item = dueWords[0];
    return Response.json({
      word: item.words,
      source: "review",
      progress: {
        stability: item.stability,
        difficulty: item.difficulty,
        state: item.state,
        is_overdue: new Date(item.due_at) < new Date(),
      },
    });
  }

  // Lấy danh sách từ user đã tương tác
  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", user.id);

  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));
  if (exclude) learnedSet.add(exclude);

  // All words come from a 1-hour cache (static reference data) instead of hitting
  // the DB on every request. We shuffle in-memory to preserve the original
  // "truly random" selection behaviour the live queries had.
  const allWords = await getAllWordsCached();
  const targetLevelSet = new Set(targetLevels);

  // Priority 2: Random từ pool gộp tất cả levels >= level của user.
  // Mỗi level đại diện tối đa 80 từ (giống limit(80) cũ), shuffle để random thật.
  const byLevel = {};
  for (const w of allWords) {
    const lvl = w.level || "B1";
    if (targetLevelSet.has(lvl)) (byLevel[lvl] ||= []).push(w);
  }
  const pool = targetLevels
    .flatMap(lvl => shuffle(byLevel[lvl] || []).slice(0, 80))
    .filter(w => !learnedSet.has(w.id));

  if (pool.length > 0) {
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return Response.json({ word: picked, source: "new", progress: null });
  }

  // Priority 3: User học hết từ ở level của mình → mở rộng, ưu tiên level cao nhất.
  // Mirror the old `order(level desc).limit(500)` then filter behaviour.
  const anyNewWords = [...allWords]
    .sort((a, b) => (b.level || "").localeCompare(a.level || ""))
    .slice(0, 500)
    .filter(w => !learnedSet.has(w.id));

  if (anyNewWords.length > 0) {
    const topCandidates = anyNewWords.slice(0, Math.min(30, anyNewWords.length));
    const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    return Response.json({ word: picked, source: "new", progress: null });
  }

  // Fallback: đã học hết mọi từ → random bất kỳ (loại trừ exclude)
  const fallbackPool = shuffle(allWords.filter(w => !exclude || w.id !== exclude)).slice(0, 20);
  if (fallbackPool.length > 0) {
    return Response.json({
      word: fallbackPool[Math.floor(Math.random() * fallbackPool.length)],
      source: "fallback",
      progress: null,
    });
  }

  return Response.json({ error: "No words available" }, { status: 404 });
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
