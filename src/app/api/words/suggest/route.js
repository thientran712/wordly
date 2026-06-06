import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export async function GET(request) {
  // Verify user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ suggestions: [] });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase();
  if (!q || q.length < 2) return Response.json({ suggestions: [] });

  // Use admin client to bypass RLS on words table
  const admin = createAdminClient();
  const { data } = await admin
    .from("words")
    .select("id, word, phonetic, meaning_vi, level")
    .ilike("word", `${q}%`)
    .order("word", { ascending: true })
    .limit(8);

  return Response.json({ suggestions: data || [] });
}
