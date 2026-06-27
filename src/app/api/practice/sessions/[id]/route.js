import { getUserFast } from "@/lib/get-user-fast";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request, { params }) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json({ session: data });
}

export async function PATCH(request, { params }) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const allowed = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.messages !== undefined) allowed.messages = body.messages;
  allowed.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("practice_sessions")
    .update(allowed)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, title, updated_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ session: data });
}

export async function DELETE(request, { params }) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
