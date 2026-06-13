import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";

export async function GET() {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // app_metadata.provider requires a full getUser() call (not in JWT claims for
  // all Supabase project configs), so we fetch it in parallel with the profile.
  const [{ data: { user: fullUser } }, { data, error }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("*").eq("id", user.id).single(),
  ]);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    profile: data,
    email: user.email || fullUser?.email,
    auth_provider: fullUser?.app_metadata?.provider || 'email',
  });
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const body = await request.json();
  
  // Whitelist các fields cho phép update
  const allowedFields = ['name', 'skill_level', 'learning_goal', 'timezone'];
  const updates = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) {
      updates[key] = body[key];
    }
  }
  
  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }
  
  // Validation
  if (updates.skill_level) {
    const validLevels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    if (!validLevels.includes(updates.skill_level)) {
      return Response.json({ error: "Invalid skill level" }, { status: 400 });
    }
  }
  if (updates.learning_goal) {
    const validGoals = ['daily', 'toeic', 'ielts', 'business', 'travel'];
    if (!validGoals.includes(updates.learning_goal)) {
      return Response.json({ error: "Invalid goal" }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    console.error("[profile PUT] Supabase error:", error);
    return Response.json({ error: "Failed to update profile" }, { status: 500 });
  }

  return Response.json({ success: true, profile: data });
}
