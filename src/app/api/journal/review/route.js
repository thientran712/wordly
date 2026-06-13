import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { dbToCard, rateCard, cardToDb } from "@/lib/fsrs";

// GET — next journal entry due for review
export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  // Count total due (new + overdue)
  const { count } = await supabase
    .from("journal_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .or(`state.eq.new,and(state.neq.new,due_at.lte.${new Date().toISOString()})`);

  // Pick next: new first, then by due_at asc
  const { data: newEntry } = await supabase
    .from("journal_entries")
    .select("id, content, state, stability, difficulty, due_at, review_count, lapses, last_reviewed_at, scheduled_days, elapsed_days")
    .eq("user_id", user.id)
    .eq("state", "new")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (newEntry) {
    return Response.json({ entry: newEntry, due_count: count || 0 });
  }

  const { data: dueEntry } = await supabase
    .from("journal_entries")
    .select("id, content, state, stability, difficulty, due_at, review_count, lapses, last_reviewed_at, scheduled_days, elapsed_days")
    .eq("user_id", user.id)
    .neq("state", "new")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(1)
    .single();

  return Response.json({ entry: dueEntry || null, due_count: count || 0 });
}

// POST — submit rating, update FSRS state
export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { id, rating } = await request.json();
  if (!id || !rating || rating < 1 || rating > 4) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  const { data: entry } = await supabase
    .from("journal_entries")
    .select("state, stability, difficulty, due_at, review_count, lapses, last_reviewed_at, scheduled_days, elapsed_days")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!entry) return Response.json({ error: "Not found" }, { status: 404 });

  const card = dbToCard({
    state: entry.state,
    stability: entry.stability,
    difficulty: entry.difficulty,
    due_at: entry.due_at,
    review_count: entry.review_count,
    lapses: entry.lapses,
    last_reviewed_at: entry.last_reviewed_at,
    scheduled_days: entry.scheduled_days,
    elapsed_days: entry.elapsed_days,
  });

  const { card: newCard } = rateCard(card, rating);
  const dbData = cardToDb(newCard);

  const { error } = await supabase
    .from("journal_entries")
    .update({
      state: dbData.state,
      stability: dbData.stability,
      difficulty: dbData.difficulty,
      due_at: dbData.due_at,
      scheduled_days: dbData.scheduled_days,
      elapsed_days: dbData.elapsed_days,
      lapses: dbData.lapses,
      review_count: dbData.review_count,
      last_reviewed_at: dbData.last_reviewed_at,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, scheduled_days: dbData.scheduled_days });
}
