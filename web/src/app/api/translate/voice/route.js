// Ghi âm để dịch (giống Google Dịch) — CHỈ dùng khi browser không hỗ trợ Web
// Speech API (client ưu tiên SpeechRecognition trước, xem InlineTranslate.js).
// Chuyển audio → text bằng Groq Whisper (transcribeAudio() có sẵn, đã dùng
// cho chấm bài nói), không lưu audio — client tự gọi /api/translate với text
// nhận được để dịch tiếp, đồng nhất với toàn app (không gộp dịch ở đây).
import { getUserFast } from "@/lib/auth/get-user-fast";
import { clientKeyFromRequest, rateLimitResponse } from "@/lib/security/rate-limit";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeAudio } from "@/lib/ai/ai-models";
import { validateVoiceUpload } from "@/lib/translate/image-validation";

const GUEST_LIMIT = 5;
const USER_LIMIT = 15;
const WINDOW_MS = 60_000;

export async function POST(request) {
  const user = await getUserFast();
  const rl = await checkRateLimitDb({
    supabase: createAdminClient(),
    scope: "translate-voice",
    clientKey: clientKeyFromRequest(request, user?.id),
    limit: user ? USER_LIMIT : GUEST_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("audio");

  const { error: validationError } = validateVoiceUpload(file);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  try {
    const { text } = await transcribeAudio(file, { language: "en" });
    if (!text?.trim()) {
      return Response.json({ error: "Không nghe được giọng nói, thử lại nhé" }, { status: 422 });
    }
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: `Không chuyển được giọng nói thành văn bản: ${e.message}` }, { status: 502 });
  }
}
