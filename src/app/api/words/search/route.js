import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "learned"; // learned | bookmarked
  const query = url.searchParams.get("q") || "";

  let dbQuery = supabase
    .from("user_progress")
    .select("state, stability, due_at, is_bookmarked, words!inner(*)")
    .eq("user_id", user.id);

  if (tab === "bookmarked") {
    dbQuery = dbQuery.eq("is_bookmarked", true);
  } else {
    // learned = đã từng tương tác (learning, review, relearning)
    dbQuery = dbQuery.in("state", ["learning", "review", "relearning"]);
  }

  dbQuery = dbQuery.order("state", { ascending: true });

  const { data, error } = await dbQuery;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let result = (data || []).map(p => ({
    ...p.words,
    user_state: p.state,
    user_stability: p.stability,
    is_bookmarked: p.is_bookmarked,
    due_at: p.due_at,
  }));

  // Search filter (client-side trên dataset nhỏ)
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(w =>
      w.word.toLowerCase().startsWith(q) ||
      w.def_en?.toLowerCase().includes(q)
    );
  }

  return Response.json({ words: result, total: result.length });
}
