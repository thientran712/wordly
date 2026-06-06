import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function POST(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { source_text, translated_text, direction } = await request.json();
  if (!source_text?.trim() || !translated_text?.trim()) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Upsert — same source+direction for this user just updates saved_at
  const { data, error } = await admin
    .from("translate_history")
    .upsert(
      {
        user_id: user.id,
        source_text: source_text.trim(),
        translated_text: translated_text.trim(),
        direction,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,source_text,direction", ignoreDuplicates: false }
    )
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, id: data.id });
}

export async function GET(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ history: [] });

  const admin = createAdminClient();
  const { data } = await admin
    .from("translate_history")
    .select("id, source_text, translated_text, direction, saved_at")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false })
    .limit(120);

  return Response.json({ history: data || [] });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const admin = createAdminClient();
  if (id) {
    await admin.from("translate_history").delete().eq("id", id).eq("user_id", user.id);
  } else {
    // clear all
    await admin.from("translate_history").delete().eq("user_id", user.id);
  }
  return Response.json({ success: true });
}
