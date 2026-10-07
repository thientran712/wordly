import { createAdminClient } from "@/lib/supabase/admin";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { clearAllTargets } from "@/lib/learning/history-delete";

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
    .is("deleted_at", null)
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
    .is("deleted_at", null)
    .order("saved_at", { ascending: false })
    .range(offset, offset + limit);

  const hasMore = (data || []).length > limit;
  return Response.json({ history: (data || []).slice(0, limit), hasMore });
}

// Xoá mềm: chỉ đánh dấu deleted_at (hoàn tác qua POST /api/translate-history/restore).
// Trả về `ids` đã xoá để client hiện nút "Hoàn tác".
//   ?id=…  → xoá một dòng (kể cả từ đã lưu — người dùng chủ động xoá từng dòng)
//   không id → "Xoá hết": chỉ xoá dòng CHƯA lưu, từ đã lưu luôn được giữ
export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const admin = createAdminClient();
  const now = new Date().toISOString();

  let ids;
  if (id) {
    ids = [id];
  } else {
    const { data, error } = await admin
      .from("translate_history")
      .select("id, is_saved, deleted_at")
      .eq("user_id", user.id)
      .eq("is_saved", false)
      .is("deleted_at", null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    ids = clearAllTargets(data);
  }

  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await admin
      .from("translate_history")
      .update({ deleted_at: now })
      .eq("user_id", user.id)
      .in("id", ids.slice(i, i + 500));
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true, ids });
}
