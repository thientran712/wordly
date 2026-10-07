import { createAdminClient } from "@/lib/supabase/admin";
import { sendDailyWordEmail } from "@/lib/email/send-email";
import { selectEmailContent, selectBankWords } from "@/lib/email/select-word-for-email";
import { getUserFast } from "@/lib/auth/get-user-fast";

export async function POST() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.email) return Response.json({ error: "No email address" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  // Same mix as the scheduled email: saved words + one word from the bank
  const picked = await selectEmailContent(admin, user.id);
  const bankWords = await selectBankWords(admin, user.id, { count: 1 }).catch(() => []);
  const content = picked || bankWords.length
    ? { words: [...(picked?.words || []), ...bankWords], journal: picked?.journal || null }
    : null;
  if (!content) return Response.json({ error: "Nothing to send — add words to your journal or translate history first" }, { status: 404 });

  const result = await sendDailyWordEmail({
    to: user.email,
    userName: profile?.name || user.email.split("@")[0],
    words: content.words,
    journal: content.journal,
  });

  if (!result.success) return Response.json({ error: result.error }, { status: 500 });

  return Response.json({
    success: true,
    words: content.words.map(w => w.word),
    journal: content.journal?.content || null,
  });
}
