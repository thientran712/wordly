import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { claimBestWordForUser } from "@/lib/select-word-for-email";

export async function POST() {
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  const selected = await claimBestWordForUser(admin, user.id);
  if (!selected) return Response.json({ error: "No word available — add words to your journal or translate history first" }, { status: 404 });

  const result = await sendDailyWordEmail({
    to: user.email,
    userName: profile?.name || user.email.split("@")[0],
    word: selected.word,
    aiContent: null,
    source: selected.source,
  });

  if (!result.success) return Response.json({ error: result.error }, { status: 500 });

  return Response.json({
    success: true,
    word: selected.word.word,
    source: selected.source,
  });
}
