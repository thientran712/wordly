import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";

const CONTENT_TABLE = {
  topic: { table: "spinner_topics", label: "text" },
  interview: { table: "spinner_interview_questions", label: "text" },
  vocab: { table: "spinner_vocab", label: "word" },
};

// All-time spun item ids + display label for the current user/item_type, so
// the client can (a) fully exclude them from the spin pool — once spun, an
// item is gone from the wheel until the user removes it here — and (b) render
// a history panel. Guests always get an empty list — spins aren't tracked
// without an account.
export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ items: [] });

  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("item_type");
  const config = CONTENT_TABLE[itemType];
  if (!config) return Response.json({ error: "Invalid item_type" }, { status: 400 });

  const admin = createAdminClient();
  const { data: historyRows, error } = await admin
    .from("spinner_history")
    .select("item_id, spun_at")
    .eq("user_id", user.id)
    .eq("item_type", itemType)
    .order("spun_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!historyRows?.length) return Response.json({ items: [] });

  const ids = historyRows.map((r) => r.item_id);
  const { data: contentRows } = await admin
    .from(config.table)
    .select(`id, ${config.label}`)
    .in("id", ids);

  const contentById = new Map((contentRows || []).map((r) => [r.id, r[config.label]]));
  const items = historyRows
    .filter((r) => contentById.has(r.item_id))
    .map((r) => ({ id: r.item_id, label: contentById.get(r.item_id), spun_at: r.spun_at }));

  return Response.json({ items });
}

// Logs a spin. Silently no-ops for guests (returns 200 either way) so the
// client never has to special-case the fetch call based on auth state.
export async function POST(request) {
  const user = await getUserFast();
  const { item_id, item_type } = await request.json();
  if (!item_id || !item_type) return Response.json({ error: "Missing item_id or item_type" }, { status: 400 });

  if (!user) return Response.json({ ok: true, skipped: true });

  const admin = createAdminClient();
  const { error } = await admin.from("spinner_history").insert({ user_id: user.id, item_id, item_type });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

// Removes an item from history so it becomes eligible for the wheel again.
export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ ok: true, skipped: true });

  const { item_id, item_type } = await request.json();
  if (!item_id || !item_type) return Response.json({ error: "Missing item_id or item_type" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("spinner_history")
    .delete()
    .eq("user_id", user.id)
    .eq("item_type", item_type)
    .eq("item_id", item_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
