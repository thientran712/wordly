import { createClient } from "@/lib/supabase-server";
import { getUserFast } from "@/lib/get-user-fast";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  // Get all distinct review dates from review_logs
  const { data, error } = await supabase
    .from("review_logs")
    .select("reviewed_at")
    .eq("user_id", user.id)
    .order("reviewed_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Extract distinct calendar dates (UTC date string YYYY-MM-DD)
  const dateSet = new Set();
  for (const row of data || []) {
    dateSet.add((row.reviewed_at || "").slice(0, 10));
  }
  const sortedDates = [...dateSet].sort((a, b) => b.localeCompare(a)); // desc

  const total_days = sortedDates.length;

  let streak = 0;
  if (sortedDates.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Streak is only active if there's a review today or yesterday
    if (sortedDates[0] === today || sortedDates[0] === yesterday) {
      streak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const prev = new Date(sortedDates[i - 1] + "T12:00:00Z");
        const curr = new Date(sortedDates[i] + "T12:00:00Z");
        const diffDays = Math.round((prev - curr) / 86400000);
        if (diffDays === 1) {
          streak++;
        } else {
          break;
        }
      }
    }
  }

  return Response.json({ streak, total_days });
}
