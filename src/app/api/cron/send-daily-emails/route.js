import { createAdminClient } from "@/lib/supabase-admin";
import { sendDailyWordEmail } from "@/lib/send-email";
import { selectBestWordForUser } from "@/lib/select-word-for-email";
import { getOrGenerateWordContent } from "@/lib/generate-ai-content";

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
  
  // 3. Get auth users for emails (fetch all, not just first 50)
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  
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
      
      // Anti-duplicate: chỉ gửi 1 lần/ngày (theo UTC)
      const lastSent = pref.last_sent_at ? new Date(pref.last_sent_at) : null;
      if (lastSent) {
        const todayUTC = now.toISOString().slice(0, 10);
        const lastSentUTC = lastSent.toISOString().slice(0, 10);
        if (lastSentUTC === todayUTC) {
          skipped.push({ email: userInfo.email, reason: "already sent today" });
          continue;
        }
      }
      
      const selectedWord = await selectBestWordForUser(supabase, pref.user_id);

      if (!selectedWord) {
        errors.push({ email: userInfo.email, error: "No word available" });
        continue;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("learning_goal")
        .eq("id", pref.user_id)
        .single();

      const aiContent = await getOrGenerateWordContent(supabase, {
        word_id: selectedWord.word.id,
        word: selectedWord.word.word,
        pos: selectedWord.word.pos,
        word_level: selectedWord.word.level,
        skill_level: selectedWord.skillLevel,
        learning_goal: profileData?.learning_goal || "daily",
      });

      // Send email
      const result = await sendDailyWordEmail({
        to: userInfo.email,
        userName: userInfo.name,
        word: selectedWord.word,
        aiContent: aiContent || null,
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
