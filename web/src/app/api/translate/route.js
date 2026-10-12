import { getUserFast } from "@/lib/auth/get-user-fast";
import { clientKeyFromRequest, rateLimitResponse } from "@/lib/security/rate-limit";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createLruCache } from "@/lib/translate/translation-cache";
import { createTieredCache, hybridTranslate } from "@/lib/translate/hybrid-translate";
import { persistentCacheKey } from "@/lib/translate/translate-routing";
import {
  createPostgresTranslationStore,
  translateWithDeepL,
  translateWithGemini,
} from "@/lib/translate/engines";

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

// Giới hạn độ dài: DeepL/Gemini tính phí theo ký tự/token, và UI đã chặn 10k ở client.
const MAX_CHARS = 10_000;

// Tầng cache thứ nhất trong RAM (theo CÂU): 1 ngày, tối đa 5.000 mục (vài
// MB RAM). Mất khi deploy — tầng Postgres (translation_cache) phía sau giữ lại.
const lru = createLruCache({ max: 5000, ttlMs: 24 * 60 * 60 * 1000 });

export async function POST(request) {
  const user = await getUserFast();
  // Client admin như /api/dictionary: bộ đếm rate limit và bảng cache dịch
  // là dữ liệu dùng chung, không phải dữ liệu riêng của người dùng.
  const supabase = createAdminClient();
  const rl = await checkRateLimitDb({
    supabase,
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

  const sourceLang = source === "VI" ? "VI" : "EN";
  const targetLang = target === "VI" ? "VI" : "EN";

  // Dịch lai (xem lib/translate/hybrid-translate.js):
  //   • ≤3 từ, không dấu câu → DeepL (Gemini hay bịa từ đơn tiếng Việt)
  //   • câu/đoạn → Gemini, lỗi/timeout/sai định dạng → DeepL
  //   • cache THEO CÂU: RAM trước, Postgres sau (bền qua deploy)
  const cache = createTieredCache({
    lru,
    store: createPostgresTranslationStore(supabase, after),
    keyOf: (t) => persistentCacheKey(t, sourceLang, targetLang),
    source: sourceLang,
    target: targetLang,
  });

  try {
    const body = await hybridTranslate({
      text,
      source: sourceLang,
      target: targetLang,
      cache,
      engines: {
        gemini: (texts) => translateWithGemini(texts, { source: sourceLang, target: targetLang }),
        deepl: (texts) => translateWithDeepL(texts, { source: sourceLang, target: targetLang }),
      },
    });
    // Hợp đồng { translated, detectedLang } — app iOS dựa vào, KHÔNG đổi
    return Response.json(body);
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 502 });
  }
}
