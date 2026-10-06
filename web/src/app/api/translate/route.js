import { getUserFast } from "@/lib/get-user-fast";
import { clientKeyFromRequest, rateLimitResponse } from "@/lib/rate-limit";
import { checkRateLimitDb } from "@/lib/rate-limit-db";
import { createAdminClient } from "@/lib/supabase-admin";

// Route CÔNG KHAI (khách dùng được) nên phải có rate limit, nếu không ai
// cũng đốt được quota DeepL.
//
// Dùng bộ đếm POSTGRES: bản đếm trong RAM không hoạt động trên Vercel
// (đã kiểm chứng trên production 4/9/2026 — xem rate-limit-db.js).
//
// Khách: 20 lượt/phút. Đã đăng nhập: 60 lượt/phút (dịch nhiều là bình thường).
const GUEST_LIMIT = 20;
const USER_LIMIT = 60;
const WINDOW_MS = 60_000;

// Giới hạn độ dài: DeepL tính phí theo ký tự, và UI đã chặn 10k ở client.
const MAX_CHARS = 10_000;

export async function POST(request) {
  const user = await getUserFast();
  const rl = await checkRateLimitDb({
    supabase: createAdminClient(),
    scope: "translate",
    clientKey: clientKeyFromRequest(request, user?.id),
    limit: user ? USER_LIMIT : GUEST_LIMIT,
    windowMs: WINDOW_MS,
  });
  if (!rl.allowed) return rateLimitResponse(rl);

  const { text, source = "EN", target = "VI" } = await request.json();

  if (!text?.trim()) return Response.json({ error: "No text" }, { status: 400 });

  // Chặn ở SERVER, không tin giới hạn phía client
  if (text.length > MAX_CHARS) {
    return Response.json(
      { error: `Văn bản quá dài (tối đa ${MAX_CHARS.toLocaleString("vi-VN")} ký tự)` },
      { status: 400 }
    );
  }

  const apiKey = process.env.DEEPL_API_KEY;
  const isFree = apiKey?.endsWith(":fx");
  const endpoint = isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: [text],
      source_lang: source === "VI" ? "VI" : "EN",
      target_lang: target === "VI" ? "VI" : "EN",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: `DeepL error: ${err}` }, { status: res.status });
  }

  const data = await res.json();
  const translated = data.translations?.[0]?.text ?? "";
  const detectedLang = data.translations?.[0]?.detected_source_language ?? source;

  return Response.json({ translated, detectedLang });
}
