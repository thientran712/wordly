import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";

// Guests get null (client falls back to in-memory defaults) instead of 401,
// so the same fetch call works whether logged in or not.
export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ preferences: null });

  const admin = createAdminClient();
  const { data } = await admin
    .from("spinner_preferences")
    .select("language, difficulty")
    .eq("user_id", user.id)
    .maybeSingle();

  return Response.json({ preferences: data || null });
}

// No-ops for guests (nothing to persist without an account).
export async function POST(request) {
  const user = await getUserFast();
  const { language, difficulty } = await request.json();

  if (!user) return Response.json({ ok: true, skipped: true });

  const admin = createAdminClient();
  const { error } = await admin.from("spinner_preferences").upsert({
    user_id: user.id,
    language,
    difficulty,
    updated_at: new Date().toISOString(),
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
