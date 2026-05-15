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

const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function getTargetLevels(skillLevel) {
  const idx = LEVEL_ORDER.indexOf(skillLevel);
  if (idx === -1) return LEVEL_ORDER.slice(2); // default B1 trở lên
  return LEVEL_ORDER.slice(idx);
}

// ============================================
// FSRS-BASED WORD SELECTION FOR EMAIL
// ============================================
async function selectBestWordForUser(supabase, userId) {
  const now = new Date().toISOString();

  // Lấy skill_level của user
  const { data: profile } = await supabase
    .from("profiles")
    .select("skill_level")
    .eq("id", userId)
    .single();

  const skillLevel = profile?.skill_level || 'B1';
  const targetLevels = getTargetLevels(skillLevel);

  // PRIORITY 1: Từ overdue (đã qua due_at)
  const { data: overdueWords } = await supabase
    .from("user_progress")
    .select(`
      word_id, stability, difficulty, state, due_at, last_reviewed_at,
      words!inner(*)
    `)
    .eq("user_id", userId)
    .lte("due_at", now)
    .in("state", ["learning", "review", "relearning"])
    .order("due_at", { ascending: true })
    .limit(5);

  if (overdueWords && overdueWords.length > 0) {
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

  // PRIORITY 2: Từ mới theo level của user (cùng logic với /api/words/next)
  const { data: learnedIds } = await supabase
    .from("user_progress")
    .select("word_id")
    .eq("user_id", userId);

  const learnedSet = new Set((learnedIds || []).map(r => r.word_id));

  // Fetch song song từng level, gộp lại rồi random
  const levelFetches = await Promise.all(
    targetLevels.map(lvl =>
      supabase.from("words").select("*").eq("level", lvl).limit(80)
    )
  );

  const pool = levelFetches
    .flatMap(({ data }) => data || [])
    .filter(w => !learnedSet.has(w.id));

  if (pool.length > 0) {
    const picked = pool[Math.floor(Math.random() * pool.length)];
    return { word: picked, source: 'new' };
  }

  // PRIORITY 3: học hết level của mình → mở rộng sang các level khác,
  // ưu tiên level cao nhất có sẵn (đồng nhất với web /api/words/next)
  const { data: allCandidates } = await supabase
    .from("words")
    .select("*")
    .order("level", { ascending: false })
    .limit(500);

  const anyNewWords = (allCandidates || []).filter(w => !learnedSet.has(w.id));

  if (anyNewWords.length > 0) {
    const topCandidates = anyNewWords.slice(0, Math.min(30, anyNewWords.length));
    const picked = topCandidates[Math.floor(Math.random() * topCandidates.length)];
    return { word: picked, source: 'new_expanded' };
  }

  // FALLBACK CUỐI: đã học hết mọi từ → random bất kỳ
  const { data: fallback } = await supabase
    .from("words")
    .select("*")
    .limit(20);

  return fallback?.[0]
    ? { word: fallback[Math.floor(Math.random() * fallback.length)], source: 'fallback' }
    : null;
}
