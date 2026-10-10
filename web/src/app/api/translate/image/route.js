// Chụp ảnh để dịch (giống Google Dịch) — OCR + dịch trong 1 lần gọi Gemini
// vision, không lưu ảnh (dùng xong bỏ). Xem docs/superpowers thiết kế đã
// duyệt trong chat 2026-10-10.
import { getUserFast } from "@/lib/auth/get-user-fast";
import { clientKeyFromRequest, rateLimitResponse } from "@/lib/security/rate-limit";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { createAdminClient } from "@/lib/supabase/admin";
import { callAI } from "@/lib/ai/ai-models";
import { validateImageDataUrl, parseImageTranslateResponse } from "@/lib/translate/image-validation";

// Ảnh đắt hơn text nhiều (token hình + token OCR) nên hạn mức thấp hơn
// /api/translate (20/60 mỗi phút).
const GUEST_LIMIT = 5;
const USER_LIMIT = 15;
const WINDOW_MS = 60_000;

const PROMPT = `You are an OCR + translation tool. Read the English text visible in this image, then translate it to Vietnamese.

Return ONLY valid JSON, no markdown, no extra text, in this exact shape:
{
  "source_text": "the exact English text read from the image",
  "translated_text": "Vietnamese translation of source_text"
}

Rules:
- If the image contains no readable English text, return {"source_text": "", "translated_text": ""}.
- Preserve line breaks in source_text as spaces (one continuous sentence/paragraph).
- Do not add commentary, only the JSON.`;

export async function POST(request) {
  const user = await getUserFast();
  const rl = await checkRateLimitDb({
    supabase: createAdminClient(),
    scope: "translate-image",
    clientKey: clientKeyFromRequest(request, user?.id),
    limit: user ? USER_LIMIT : GUEST_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { image } = await request.json().catch(() => ({}));
  const { error: validationError } = validateImageDataUrl(image);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  let res;
  try {
    ({ res } = await callAI("vision", {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }));
  } catch (e) {
    return Response.json({ error: `Không đọc được ảnh: ${e.message}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return Response.json({ error: `AI lỗi: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  const { source_text, translated_text, error } = parseImageTranslateResponse(content);

  if (error) return Response.json({ error }, { status: 422 });

  return Response.json({ source_text, translated_text });
}
