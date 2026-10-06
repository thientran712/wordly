import { createAdminClient } from "@/lib/supabase-admin";

// Public — matches /api/words* and /api/translate*, guests can browse and
// spin without an account. Only spin-history/preferences require login.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") || "en";

  const admin = createAdminClient();

  // PostgREST caps a single request at 1000 rows — spinner_topics has ~2100,
  // so page through it (same pattern as /api/words/by-topic).
  let topics = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("spinner_topics")
      .select("id, text, difficulty, category, language")
      .eq("language", language)
      .range(from, from + 999);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    topics = topics.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  return Response.json({ topics });
}
