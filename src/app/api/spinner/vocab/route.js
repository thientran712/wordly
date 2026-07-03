import { createAdminClient } from "@/lib/supabase-admin";

// Public — same reasoning as /api/spinner/topics.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get("language") || "en";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("spinner_vocab")
    .select("id, word, pos, definition, sentence, angle, difficulty, language")
    .eq("language", language);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ words: data || [] });
}
