import { createClient } from "@/lib/supabase-server";
import { sendDailyWordEmail } from "@/lib/send-email";

export async function POST() {
  const supabase = await createClient();
  
  // Verify user đã login
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Lấy profile của user
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  
  // Random 1 từ vựng
  const { data: words, error: wordsError } = await supabase
    .from("words")
    .select("*")
    .limit(30);
  
  if (wordsError || !words || words.length === 0) {
    return Response.json({ error: "No words found" }, { status: 500 });
  }
  
  const randomWord = words[Math.floor(Math.random() * words.length)];
  
  // Gửi email
  const result = await sendDailyWordEmail({
    to: user.email,
    userName: profile?.name || user.email.split("@")[0],
    word: randomWord,
  });
  
  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 });
  }
  
  return Response.json({ 
    success: true, 
    message: "Email đã được gửi! Check inbox của bạn 📬",
    word: randomWord.word,
  });
}
