import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";

export async function GET(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // The homepage only needs bookmarked word ids. By default return just those
  // (tiny payload) instead of every progress row joined with full word data.
  // Pass ?full=1 to get the complete progress list (used by stats/words pages).
  const url = new URL(request.url);
  if (url.searchParams.get("full") === "1") {
    const { data, error } = await supabase
      .from("user_progress")
      .select("*, words(*)")
      .eq("user_id", user.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ progress: data });
  }

  const { data, error } = await supabase
    .from("user_progress")
    .select("word_id, is_bookmarked")
    .eq("user_id", user.id)
    .eq("is_bookmarked", true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ progress: data });
}
