import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const exclude = url.searchParams.get("exclude"); // Word ID hiện tại
  
  const now = new Date().toISOString();
  
  // STRATEGY:
  // 1. PRIORITY: Lấy từ overdue (đã đến hạn review từ trước)
  // 2. SECONDARY: Lấy từ due now (đến hạn hôm nay)
  // 3. FALLBACK: Lấy từ mới (chưa học)
  
  // Try 1: Từ overdue/due → ưu tiên ôn lại
  let { data: dueWords } = await supabase
    .from("user_progress")
    .select(`
      word_id,
      stability,
      difficulty,
      state,
      due_at,
      words!inner(*)
    `)
    .eq("user_id", user.id)
    .lte("due_at", now)
    .in("state", ["learning", "review", "relearning"])
    .neq("word_id", exclude || "00000000-0000-0000-0000-000000000000")
    .order("due_at", { ascending: true }) // Overdue nhất trước
    .limit(1);
  
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
  
  // Try 2: Từ mới chưa học (chưa có trong user_progress)
  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", user.id);
  
  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));
  
  // Get random new word (Postgres không có ORDER BY RANDOM hiệu quả cho table lớn)
  // Strategy: lấy 10 từ ngẫu nhiên rồi pick 1 chưa học
  const { data: candidates } = await supabase
    .from("words")
    .select("*")
    .neq("id", exclude || "00000000-0000-0000-0000-000000000000")
    .limit(100);
  
  if (candidates) {
    const newWords = candidates.filter(w => !learnedSet.has(w.id));
    
    if (newWords.length > 0) {
      // Random pick from candidates  
      const picked = newWords[Math.floor(Math.random() * newWords.length)];
      return Response.json({
        word: picked,
        source: "new",
        progress: null,
      });
    }
  }
  
  // Fallback: Nếu đã học hết, lấy 1 từ random
  const { data: fallback } = await supabase
    .from("words")
    .select("*")
    .neq("id", exclude || "00000000-0000-0000-0000-000000000000")
    .limit(1);
  
  return Response.json({
    word: fallback?.[0] || null,
    source: "fallback",
    progress: null,
  });
}
