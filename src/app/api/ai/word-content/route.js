export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";
import { getUserFast } from "@/lib/get-user-fast";

const SELECT_FIELDS = "meanings, synonyms";

// GET — fetch cached content only
export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const word_id = searchParams.get("word_id");
  const skill_level = searchParams.get("skill_level");

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!word_id || !UUID_REGEX.test(word_id) || !skill_level) {
    return Response.json({ error: "Missing or invalid params" }, { status: 400 });
  }

  const { data } = await supabase
    .from("word_ai_content")
    .select(SELECT_FIELDS)
    .eq("word_id", word_id)
    .eq("skill_level", skill_level)
    .single();

  return Response.json({ content: data || null });
}

// POST — generate (or return cache hit)
export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { word_id, word, pos, word_level, skill_level, learning_goal } = await request.json();
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!word_id || !UUID_REGEX.test(word_id) || !word) {
    return Response.json({ error: "Missing or invalid required fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("word_ai_content")
    .select("meanings")
    .eq("word_id", word_id)
    .eq("skill_level", skill_level || "B1")
    .single();

  const wasCached = existing?.meanings?.length > 0;

  const content = await getOrGenerateWordContent(admin, {
    word_id, word, pos, word_level, skill_level, learning_goal,
  });

  if (!content) return Response.json({ error: "Generation failed" }, { status: 500 });

  return Response.json({ content, cached: wasCached });
}
