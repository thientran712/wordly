import { createAdminClient } from "@/lib/supabase-admin";

// Public — matches /api/words* and /api/translate*, guests can browse and
// spin without an account.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const admin = createAdminClient();
  let query = admin.from("spinner_deep_talk").select("id, text, category");
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ questions: data || [] });
}
