import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { source_text, translated_text, direction, is_saved } = await request.json();
  if (!source_text?.trim() || !translated_text?.trim()) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Every translation gets its own row — same word translated again later
  // is a separate lookup, not an update. is_saved defaults to false (auto
  // log); the "Lưu" button uses PATCH to mark a row as explicitly saved.
  const { data, error } = await admin
    .from("translate_history")
    .insert({
      user_id: user.id,
      source_text: source_text.trim(),
      translated_text: translated_text.trim(),
      direction,
      is_saved: !!is_saved,
      saved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, id: data.id });
}

// Marks the most recent auto-logged (is_saved = false) row for this
// word/direction as explicitly saved by the user. Falls back to inserting
// a new saved row if no matching auto-logged row exists (e.g. the 10s
// auto-log debounce hadn't fired yet when "Lưu" was clicked).
export async function PATCH(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { source_text, translated_text, direction } = await request.json();
  if (!source_text?.trim() || !translated_text?.trim()) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();
  const trimmedSource = source_text.trim();

  const { data: existing } = await admin
    .from("translate_history")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_text", trimmedSource)
    .eq("direction", direction)
    .eq("is_saved", false)
    .order("saved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("translate_history")
      .update({ is_saved: true, saved_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, id: existing.id });
  }

  const { data, error } = await admin
    .from("translate_history")
    .insert({
      user_id: user.id,
      source_text: trimmedSource,
      translated_text: translated_text.trim(),
      direction,
      is_saved: true,
      saved_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, id: data.id });
}

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ history: [], hasMore: false });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const admin = createAdminClient();
  // Fetch limit+1 to know if there are more rows without a separate count query.
  const { data } = await admin
    .from("translate_history")
    .select("id, source_text, translated_text, direction, saved_at, is_saved")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false })
    .range(offset, offset + limit);

  const hasMore = (data || []).length > limit;
  return Response.json({ history: (data || []).slice(0, limit), hasMore });
}

export async function DELETE(request) {
  const user = await getUserFast();
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
