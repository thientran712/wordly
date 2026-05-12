import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { dbToCard, predictRetrievability } from "@/lib/fsrs";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const supabase = createAdminClient();
  const now = new Date();
  
  // 1. Get all enabled email preferences
  const { data: preferences, error: prefError } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("enabled", true);
  
  if (prefError) {
    return Response.json({ error: prefError.message }, { status: 500 });
  }
  
  if (!preferences || preferences.length === 0) {
    return Response.json({
      success: true,
      message: "No users with email enabled",
      sent: 0,
    });
  }
  
  // 2. Get profiles
  const userIds = preferences.map(p => p.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);
  
  // 3. Get auth users for emails
  const { data: authData } = await supabase.auth.admin.listUsers();
  
  // Build user lookup
  const userMap = {};
  for (const profile of profiles || []) {
    const authUser = authData.users.find(u => u.id === profile.id);
    userMap[profile.id] = {
      email: profile.email || authUser?.email,
      name: profile.name || authUser?.email?.split("@")[0],
      streak: profile.current_streak || 0,
      timezone: profile.timezone || "Asia/Ho_Chi_Minh",
    };
  }
  
  const sentTo = [];
  const skipped = [];
  const errors = [];
  
  for (const pref of preferences) {
    try {
      const userInfo = userMap[pref.user_id];
      if (!userInfo?.email) {
        skipped.push({ user_id: pref.user_id, reason: "no email" });
        continue;
      }
      
      // Calculate timezone-aware current time
      const userNow = new Date(now.toLocaleString("en-US", { timeZone: userInfo.timezone }));
      const currentHour = userNow.getHours();
      const currentMinute = userNow.getMinutes();
      const currentDay = userNow.getDay();
      
      const [sendHour, sendMinute] = pref.send_time.split(":").map(Number);
      const minutesDiff = Math.abs(
        (currentHour * 60 + currentMinute) - (sendHour * 60 + sendMinute)
      );
      
      if (minutesDiff > 15) {
        skipped.push({ email: userInfo.email, reason: "wrong time" });
        continue;
      }
      
      // Check frequency
      if (pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
        skipped.push({ email: userInfo.email, reason: "weekend" });
        continue;
      }
      if (pref.frequency === "custom" && !pref.custom_days?.includes(currentDay)) {
        skipped.push({ email: userInfo.email, reason: "not scheduled day" });
        continue;
      }
      
      // Anti-duplicate check
      const lastSent = pref.last_sent_at ? new Date(pref.last_sent_at) : null;
      if (lastSent) {
        const lastSentLocal = new Date(lastSent.toLocaleString("en-US", { timeZone: userInfo.timezone }));
        if (lastSentLocal.toDateString() === userNow.toDateString()) {
          skipped.push({ email: userInfo.email, reason: "already sent today" });
          continue;
        }
      }
      
      // ============================================
      // FSRS SMART WORD SELECTION
      // ============================================
      const selectedWord = await selectBestWordForUser(supabase, pref.user_id);
      
      if (!selectedWord) {
        errors.push({ email: userInfo.email, error: "No word available" });
        continue;
      }
      
      // Send email
      const result = await sendDailyWordEmail({
        to: userInfo.email,
        userName: userInfo.name,
        word: selectedWord.word,
        streak: userInfo.streak,
      });
      
      if (result.success) {
        sentTo.push({ 
          email: userInfo.email, 
          word: selectedWord.word.word,
          source: selectedWord.source,
        });
        
        await supabase
          .from("email_preferences")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("user_id", pref.user_id);
      } else {
        errors.push({ email: userInfo.email, error: result.error });
      }
    } catch (e) {
      errors.push({ user_id: pref.user_id, error: e.message });
    }
  }
  
  return Response.json({
    success: true,
    timestamp: now.toISOString(),
    total: preferences.length,
    sent: sentTo.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { sentTo, skipped, errors },
  });
}

// ============================================
// FSRS-BASED WORD SELECTION FOR EMAIL
// ============================================
async function selectBestWordForUser(supabase, userId) {
  const now = new Date().toISOString();
  
  // PRIORITY 1: Từ overdue (đã qua due_at)
  // → User cần ôn gấp, retention đang giảm
  const { data: overdueWords } = await supabase
    .from("user_progress")
    .select(`
      word_id, stability, difficulty, state, due_at, last_reviewed_at,
      words!inner(*)
    `)
    .eq("user_id", userId)
    .lt("due_at", now)
    .in("state", ["learning", "review", "relearning"])
    .order("due_at", { ascending: true }) // Overdue lâu nhất trước
    .limit(5);
  
  if (overdueWords && overdueWords.length > 0) {
    // Pick từ có retrievability thấp nhất (sắp quên nhất)
    let bestPick = overdueWords[0];
    let lowestR = 1.0;
    
    for (const item of overdueWords) {
      const card = dbToCard({
        ...item,
        due_at: item.due_at,
        last_reviewed_at: item.last_reviewed_at,
      });
      const r = predictRetrievability(card);
      
      if (r < lowestR) {
        lowestR = r;
        bestPick = item;
      }
    }
    
    return {
      word: bestPick.words,
      source: 'review_urgent',
      retrievability: lowestR,
    };
  }
  
  // PRIORITY 2: Từ mới chưa học
  // Strategy: lấy từ user chưa thấy bao giờ
  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", userId);
  
  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));
  
  // Get candidates (lấy 100 từ ngẫu nhiên, filter ra từ chưa học)
  const { data: candidates } = await supabase
    .from("words")
    .select("*")
    .limit(200);
  
  if (candidates) {
    const newWords = candidates.filter(w => !learnedSet.has(w.id));
    
    if (newWords.length > 0) {
      // Random pick
      const picked = newWords[Math.floor(Math.random() * newWords.length)];
      return {
        word: picked,
        source: 'new',
      };
    }
  }
  
  // FALLBACK: User đã học hết tất cả từ → random
  const { data: fallback } = await supabase
    .from("words")
    .select("*")
    .limit(1);
  
  return fallback?.[0] 
    ? { word: fallback[0], source: 'fallback' }
    : null;
}
