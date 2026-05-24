import { createClient } from "@/lib/supabase-server";

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

// Trả về các level từ level hiện tại của user trở lên
function getTargetLevels(skillLevel) {
  const idx = LEVEL_ORDER.indexOf(skillLevel);
  if (idx === -1) return LEVEL_ORDER.slice(2); // default B1 trở lên
  return LEVEL_ORDER.slice(idx);
}

export async function GET(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Priority 2: Random thực sự từ pool gộp tất cả levels >= level của user.
  // Fetch riêng từng level để đảm bảo mỗi level được đại diện (tránh bias theo insertion order).
  const levelFetches = await Promise.all(
    targetLevels.map(lvl =>
      supabase.from("words").select("*").eq("level", lvl).limit(80)
    )
  );

  const pool = levelFetches
    .flatMap(({ data }) => data || [])
    .filter(w => !learnedSet.has(w.id));

  if (pool.length > 0) {
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return Response.json({ word: picked, source: "new", progress: null });
  }

  // Priority 3: User học hết từ ở level của mình → mở rộng xuống các level thấp hơn,
  // nhưng ưu tiên level cao nhất có sẵn (A1 < A2 < B1 < B2 < C1 < C2 theo alphabet)
  const { data: allCandidates } = await supabase
    .from("words")
    .select("*")
    .order("level", { ascending: false })
    .limit(500);

  const anyNewWords = (allCandidates || []).filter(w => !learnedSet.has(w.id));

  if (anyNewWords.length > 0) {
    // Pick randomly from top 30 to add variety while still preferring higher levels
    const topCandidates = anyNewWords.slice(0, Math.min(30, anyNewWords.length));
    const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    return Response.json({ word: picked, source: "new", progress: null });
  }

  // Fallback: đã học hết mọi từ → random bất kỳ
  let fallbackQuery = supabase.from("words").select("*").limit(20);
  if (exclude) fallbackQuery = fallbackQuery.neq("id", exclude);
  const { data: fallback } = await fallbackQuery;

  if (fallback && fallback.length > 0) {
    return Response.json({
      word: fallback[Math.floor(Math.random() * fallback.length)],
      source: "fallback",
      progress: null,
    });
  }

  return Response.json({ error: "No words available" }, { status: 404 });
}
