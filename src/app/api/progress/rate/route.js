import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";
import { dbToCard, rateCard, cardToDb } from "@/lib/fsrs";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { word_id, rating } = await request.json();

  // Validate — rating 0 = "retire" (never review again), 1-4 = FSRS
  if (!word_id || rating === undefined || rating === null || rating < 0 || rating > 4) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }

  // 1. Get current progress (if exists)
  const { data: existing } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("word_id", word_id)
    .single();

  // Handle rating=0: retire word (set due far in future, skip FSRS)
  if (rating === 0) {
    const farFuture = new Date();
    farFuture.setFullYear(farFuture.getFullYear() + 50);

    const { error: retireError } = await supabase
      .from("user_progress")
      .upsert({
        user_id: user.id,
        word_id,
        state: 'review',
        stability: 9999,
        difficulty: existing?.difficulty || 5.0,
        due_at: farFuture.toISOString(),
        scheduled_days: 18250,
        elapsed_days: 0,
        lapses: existing?.lapses || 0,
        review_count: (existing?.review_count || 0) + 1,
        last_reviewed_at: new Date().toISOString(),
        is_bookmarked: existing?.is_bookmarked || false,
      }, { onConflict: "user_id,word_id" });

    if (retireError) {
      console.error("Retire word error:", retireError);
      return Response.json({ error: retireError.message }, { status: 500 });
    }

    return Response.json({ success: true, retired: true });
  }

  // 2. Convert to FSRS card
  const currentCard = dbToCard(existing);

  // 3. Apply rating → get new state
  const { card: newCard, log } = rateCard(currentCard, rating);

  // 4. Save to user_progress (upsert)
  const dbData = cardToDb(newCard);

  const { data: progress, error: progressError } = await supabase
    .from("user_progress")
    .upsert({
      user_id: user.id,
      word_id,
      ...dbData,
      is_bookmarked: existing?.is_bookmarked || false,
    }, { onConflict: "user_id,word_id" })
    .select()
    .single();

  if (progressError) {
    console.error("Update progress error:", progressError);
    return Response.json({ error: progressError.message }, { status: 500 });
  }

  // 5. Log review history
  const { error: logError } = await supabase
    .from("review_logs")
    .insert({
      user_id: user.id,
      word_id,
      rating,
      state_before: existing?.state || 'new',
      stability_before: existing?.stability || 0,
      difficulty_before: existing?.difficulty || 5.0,
      state_after: dbData.state,
      stability_after: dbData.stability,
      difficulty_after: dbData.difficulty,
      elapsed_days: dbData.elapsed_days,
      scheduled_days: dbData.scheduled_days,
    });

  if (logError) {
    console.error("Log review error:", logError);
    // Don't fail the request - log error is non-critical
  }

  // 6. Return new state for UI feedback
  return Response.json({
    success: true,
    progress: {
      stability: dbData.stability,
      difficulty: dbData.difficulty,
      state: dbData.state,
      due_at: dbData.due_at,
      next_review_in_days: dbData.scheduled_days,
    },
  });
}
