import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // 1. Words by state
  const { data: progress } = await supabase
    .from("user_progress")
    .select("state, stability, difficulty, last_reviewed_at, due_at, lapses")
    .eq("user_id", user.id);
  
  const byState = { new: 0, learning: 0, review: 0, relearning: 0, mastered: 0 };
  let totalStability = 0;
  let totalDifficulty = 0;
  let totalLapses = 0;
  
  (progress || []).forEach(p => {
    // Words với stability > 30 ngày → "mastered"
    if (p.stability > 30) {
      byState.mastered++;
    } else if (byState[p.state] !== undefined) {
      byState[p.state]++;
    }
    totalStability += p.stability || 0;
    totalDifficulty += p.difficulty || 0;
    totalLapses += p.lapses || 0;
  });
  
  const totalWords = progress?.length || 0;
  const avgStability = totalWords > 0 ? totalStability / totalWords : 0;
  const avgDifficulty = totalWords > 0 ? totalDifficulty / totalWords : 0;
  
  // 2. Review activity (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const { data: logs } = await supabase
    .from("review_logs")
    .select("rating, reviewed_at")
    .eq("user_id", user.id)
    .gte("reviewed_at", thirtyDaysAgo.toISOString())
    .order("reviewed_at", { ascending: true });
  
  // Build daily activity map
  const dailyActivity = {};
  (logs || []).forEach(log => {
    const date = log.reviewed_at.split('T')[0]; // YYYY-MM-DD
    if (!dailyActivity[date]) {
      dailyActivity[date] = { total: 0, again: 0, hard: 0, good: 0, easy: 0 };
    }
    dailyActivity[date].total++;
    if (log.rating === 1) dailyActivity[date].again++;
    if (log.rating === 2) dailyActivity[date].hard++;
    if (log.rating === 3) dailyActivity[date].good++;
    if (log.rating === 4) dailyActivity[date].easy++;
  });
  
  // 3. Retention rate (% Good + Easy / Total)
  const totalReviews = logs?.length || 0;
  const successfulReviews = (logs || []).filter(l => l.rating >= 3).length;
  const retentionRate = totalReviews > 0 ? successfulReviews / totalReviews : 0;
  
  // 4. Due today / overdue
  const now = new Date().toISOString();
  const dueNow = (progress || []).filter(p => p.due_at && p.due_at <= now).length;
  
  return Response.json({
    overview: {
      total_words: totalWords,
      mastered: byState.mastered,
      learning: byState.learning + byState.relearning,
      reviewing: byState.review,
      due_now: dueNow,
    },
    by_state: byState,
    metrics: {
      retention_rate: retentionRate,
      avg_stability: avgStability,
      avg_difficulty: avgDifficulty,
      total_lapses: totalLapses,
      total_reviews_30d: totalReviews,
    },
    daily_activity: dailyActivity,
  });
}
