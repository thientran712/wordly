import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { claimBestWordForUser } from "@/lib/select-word-for-email";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not logged in" }, { status: 401 });

  const admin = createAdminClient();

  // Show what's in journal and translate_history for this user
  const [{ data: journal }, { data: history }] = await Promise.all([
    admin.from("journal_entries")
      .select("id, word, meaning_vi, last_emailed_at, email_count")
      .eq("user_id", user.id),
    admin.from("translate_history")
      .select("id, source_text, direction, last_emailed_at, email_count")
      .eq("user_id", user.id),
  ]);

  const selected = await claimBestWordForUser(admin, user.id);

  return Response.json({
    user_id: user.id,
    journal_entries: journal || [],
    translate_history: history || [],
    selected_word: selected,
  });
}
