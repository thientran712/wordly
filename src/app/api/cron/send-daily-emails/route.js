import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";

export async function GET(request) {
  // Bảo mật: chỉ Vercel Cron hoặc người có CRON_SECRET mới gọi được
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const supabase = createAdminClient();
  const now = new Date();
  
  // 1. Lấy tất cả email preferences đang enabled
  const { data: preferences, error: prefError } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("enabled", true);
  
  if (prefError) {
    console.error("Fetch preferences error:", prefError);
    return Response.json({ error: prefError.message }, { status: 500 });
  }
  
  if (!preferences || preferences.length === 0) {
    return Response.json({
      success: true,
      message: "No users with email enabled",
      sent: 0,
      skipped: 0,
    });
  }
  
  // 2. Lấy profile của các users đó
  const userIds = preferences.map(p => p.user_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .in("id", userIds);
  
  if (profileError) {
    console.error("Fetch profiles error:", profileError);
    return Response.json({ error: profileError.message }, { status: 500 });
  }
  
  // 3. Lấy email từ auth.users (vì profiles có thể không có email)
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError) {
    console.error("Fetch auth users error:", authError);
    return Response.json({ error: authError.message }, { status: 500 });
  }
  
  // Build lookup map: user_id → { email, name, streak, timezone }
  const userMap = {};
  for (const profile of profiles || []) {
    const authUser = authUsers.users.find(u => u.id === profile.id);
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
      
      // Tính giờ hiện tại theo timezone của user
      const userNow = new Date(now.toLocaleString("en-US", { timeZone: userInfo.timezone }));
      const currentHour = userNow.getHours();
      const currentMinute = userNow.getMinutes();
      const currentDay = userNow.getDay();
      
      // Parse send_time (format: HH:MM:SS)
      const [sendHour, sendMinute] = pref.send_time.split(":").map(Number);
      
      // Check khoảng thời gian (cron chạy mỗi 15 phút, cho phép sai số 15 phút)
      const minutesDiff = Math.abs(
        (currentHour * 60 + currentMinute) - (sendHour * 60 + sendMinute)
      );
      
      if (minutesDiff > 15) {
        skipped.push({ email: userInfo.email, reason: "wrong time", currentTime: `${currentHour}:${currentMinute}`, scheduledTime: pref.send_time });
        continue;
      }
      
      // Check tần suất
      if (pref.frequency === "weekdays" && (currentDay === 0 || currentDay === 6)) {
        skipped.push({ email: userInfo.email, reason: "weekend" });
        continue;
      }
      if (pref.frequency === "custom" && !pref.custom_days?.includes(currentDay)) {
        skipped.push({ email: userInfo.email, reason: "not scheduled day" });
        continue;
      }
      
      // Check đã gửi hôm nay chưa
      const lastSent = pref.last_sent_at ? new Date(pref.last_sent_at) : null;
      if (lastSent) {
        const lastSentLocal = new Date(lastSent.toLocaleString("en-US", { timeZone: userInfo.timezone }));
        if (lastSentLocal.toDateString() === userNow.toDateString()) {
          skipped.push({ email: userInfo.email, reason: "already sent today" });
          continue;
        }
      }
      
      // Lấy danh sách word_id đã học của user
      const { data: learnedProgress } = await supabase
        .from("user_progress")
        .select("word_id")
        .eq("user_id", pref.user_id)
        .gt("review_count", 0);
      
      const learnedIds = (learnedProgress || []).map(p => p.word_id);
      
      // Lấy 1 từ chưa học
      let selectedWord;
      let wordsQuery = supabase.from("words").select("*").limit(1);
      
      if (learnedIds.length > 0) {
        wordsQuery = wordsQuery.not("id", "in", `(${learnedIds.map(id => `"${id}"`).join(",")})`);
      }
      
      const { data: unlearned } = await wordsQuery;
      
      if (unlearned && unlearned.length > 0) {
        selectedWord = unlearned[0];
      } else {
        // Đã học hết, gửi random
        const { data: allWords } = await supabase.from("words").select("*");
        if (allWords && allWords.length > 0) {
          selectedWord = allWords[Math.floor(Math.random() * allWords.length)];
        }
      }
      
      if (!selectedWord) {
        errors.push({ email: userInfo.email, error: "No word available" });
        continue;
      }
      
      // Gửi email
      const result = await sendDailyWordEmail({
        to: userInfo.email,
        userName: userInfo.name,
        word: selectedWord,
        streak: userInfo.streak,
      });
      
      if (result.success) {
        sentTo.push({ email: userInfo.email, word: selectedWord.word });
        
        // Update last_sent_at
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
