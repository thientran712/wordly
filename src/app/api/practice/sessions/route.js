import { getUserFast } from "@/lib/get-user-fast";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ sessions: data || [] });
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, messages } = await request.json();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({ user_id: user.id, title: title || "New conversation", messages: messages || [] })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ session: data });
}
