import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "learned";
  const query = url.searchParams.get("q") || "";
  const level = url.searchParams.get("level") || "";
  const state = url.searchParams.get("state") || "";

  let dbQuery = supabase
    .from("user_progress")
    .select("state, stability, due_at, is_bookmarked, created_at, words!inner(*)")
    .eq("user_id", user.id);

  if (tab === "bookmarked") {
    dbQuery = dbQuery.eq("is_bookmarked", true);
  } else {
    dbQuery = dbQuery.in("state", ["learning", "review", "relearning"]);
  }

  if (state) {
    dbQuery = dbQuery.eq("state", state);
  }

  dbQuery = dbQuery.order("created_at", { ascending: false });

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
    learned_at: p.created_at,
  }));

  if (level) {
    result = result.filter(w => w.level === level);
  }

  if (query.trim()) {
    const q = query.trim().toLowerCase();
    result = result.filter(w =>
      w.word.toLowerCase().startsWith(q) ||
      w.def_en?.toLowerCase().includes(q)
    );
  }

  return Response.json({ words: result, total: result.length });
}
