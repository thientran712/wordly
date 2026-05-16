import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

export async function POST() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, skill_level, learning_goal")
    .eq("id", user.id)
    .single();

  const selected = await selectBestWordForUser(supabase, user.id);
  if (!selected) return Response.json({ error: "No word available" }, { status: 500 });

  const aiContent = await getOrGenerateWordContent(admin, {
    word_id: selected.word.id,
    word: selected.word.word,
    pos: selected.word.pos,
    word_level: selected.word.level,
    skill_level: selected.skillLevel,
    learning_goal: profile?.learning_goal || "daily",
  });

  const result = await sendDailyWordEmail({
    to: user.email,
    userName: profile?.name || user.email.split("@")[0],
    word: selected.word,
    aiContent: aiContent || null,
  });

  if (!result.success) return Response.json({ error: result.error }, { status: 500 });

  return Response.json({
    success: true,
    message: "Email đã được gửi! Check inbox của bạn",
    word: selected.word.word,
    source: selected.source,
    hasAiContent: !!aiContent,
  });
}
