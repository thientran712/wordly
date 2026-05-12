import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const filter = url.searchParams.get("filter") || "all"; // all | bookmarked | learned | new
  const level = url.searchParams.get("level") || "all";
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 30;
  const offset = (page - 1) * limit;
  
  // Build query
  let wordsQuery = supabase
    .from("words")
    .select("*", { count: 'exact' });
  
  // Search filter
  if (query.trim()) {
    wordsQuery = wordsQuery.ilike("word", `${query.trim()}%`);
  }
  
  // Level filter
  if (level !== "all") {
    wordsQuery = wordsQuery.eq("level", level);
  }
  
  // Fetch words first
  wordsQuery = wordsQuery
    .order("word", { ascending: true })
    .range(offset, offset + limit - 1);
  
  const { data: words, error: wordsError, count } = await wordsQuery;
  
  if (wordsError) {
    return Response.json({ error: wordsError.message }, { status: 500 });
  }
  
  // Get user progress for these words
  const wordIds = (words || []).map(w => w.id);
  
  const { data: progress } = await supabase
    .from("user_progress")
    .select("word_id, state, stability, is_bookmarked")
    .eq("user_id", user.id)
    .in("word_id", wordIds);
  
  const progressMap = {};
  (progress || []).forEach(p => {
    progressMap[p.word_id] = p;
  });
  
  // Combine + apply filter
  let result = (words || []).map(w => ({
    ...w,
    user_state: progressMap[w.id]?.state || 'new',
    user_stability: progressMap[w.id]?.stability || 0,
    is_bookmarked: progressMap[w.id]?.is_bookmarked || false,
  }));
  
  // Filter by state if needed
  if (filter === "bookmarked") {
    result = result.filter(w => w.is_bookmarked);
  } else if (filter === "learned") {
    result = result.filter(w => w.user_state !== 'new');
  } else if (filter === "new") {
    result = result.filter(w => w.user_state === 'new');
  }
  
  return Response.json({
    words: result,
    total: count || 0,
    page,
    has_more: (offset + limit) < (count || 0),
  });
}
