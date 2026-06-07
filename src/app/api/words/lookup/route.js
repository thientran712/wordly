import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ word: null });

  const url = new URL(request.url);
  const word = url.searchParams.get("word")?.trim().toLowerCase();
  if (!word) return Response.json({ word: null });

  // Use admin client to bypass RLS
  const admin = createAdminClient();
  const { data } = await admin
    .from("words")
    .select("id, word, phonetic, meaning_vi, example, definition, audio_url, level")
    .ilike("word", word)
    .limit(1)
    .single();

  return Response.json({ word: data || null });
}
