// Lớp gọi mạng tới DeepL / Gemini và đọc-ghi bảng translation_cache.
// Logic định tuyến + cache nằm ở hybrid-translate.js (có test); file này chỉ
// là phần "dây nối" mỏng.
import { callAI } from "@/lib/ai/ai-models";
import {
  buildTranslateSystemPrompt,
  parseGeminiTranslations,
  translateMaxTokens,
} from "@/lib/translate/translate-routing";

/**
 * DeepL nhận mảng `text` gốc → trả đúng thứ tự. Lỗi thì ném Error có
 * `.status` để route trả về đúng mã như trước.
 */
export async function translateWithDeepL(texts, { source, target }) {
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
    body: JSON.stringify({ text: texts, source_lang: source, target_lang: target }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw Object.assign(new Error(`DeepL error: ${err}`), { status: res.status });
  }

  const data = await res.json();
  const list = data.translations ?? [];
  return {
    texts: texts.map((_, i) => list[i]?.text ?? ""),
    detectedLang: list[0]?.detected_source_language ?? source,
  };
}

/**
 * Dịch MỌI câu còn thiếu trong MỘT lượt gọi Gemini, trả mảng cùng thứ tự,
 * hoặc null nếu phản hồi sai định dạng/độ dài (→ caller tụt về DeepL).
 * Có timeout: Gemini treo thì người dùng vẫn nhận bản dịch DeepL.
 */
export async function translateWithGemini(texts, { source, target }) {
  const totalChars = texts.reduce((n, t) => n + t.length, 0);
  // p50 đo được ~0.8s cho 1 câu; đoạn dài sinh nhiều token hơn nên nới theo độ dài
  const timeoutMs = Math.min(25_000, 6_000 + totalChars * 2);

  const { res } = await callAI(
    "translate",
    {
      messages: [
        { role: "system", content: buildTranslateSystemPrompt(source, target, texts.length) },
        { role: "user", content: JSON.stringify({ texts }) },
      ],
      temperature: 0.2,
      max_tokens: translateMaxTokens(totalChars),
      response_format: { type: "json_object" },
    },
    { signal: AbortSignal.timeout(timeoutMs) }
  );
  const data = await res.json();
  return parseGeminiTranslations(data.choices?.[0]?.message?.content, texts.length);
}

// PostgREST đặt danh sách `.in()` vào URL — chia lô để URL không quá dài
// (đoạn 10k ký tự có thể ra hàng trăm câu × 64 ký tự khoá).
const LOOKUP_BATCH = 50;

/**
 * Kho cache Postgres. Mô phỏng đúng cách /api/dictionary dùng
 * word_dictionary_cache: client admin (bảng dùng chung, không phải dữ liệu
 * riêng người dùng; chỉ service_role đọc/ghi được), ghi KHÔNG chặn phản hồi
 * qua `schedule` (truyền `after` của next/server vào).
 */
export function createPostgresTranslationStore(supabase, schedule) {
  return {
    async getMany(keys) {
      const out = new Map();
      for (let i = 0; i < keys.length; i += LOOKUP_BATCH) {
        const { data, error } = await supabase
          .from("translation_cache")
          .select("key, translated_text")
          .in("key", keys.slice(i, i + LOOKUP_BATCH));
        if (error) throw new Error(error.message);
        for (const row of data ?? []) out.set(row.key, row.translated_text);
      }
      return out;
    },

    setMany(rows) {
      // Lỗi ghi chỉ làm mất cache (lượt sau dịch lại), không làm sai kết quả
      // đang trả — chỉ log.
      schedule(async () => {
        try {
          const { error } = await supabase.from("translation_cache").upsert(rows, { onConflict: "key" });
          if (error) console.warn("[api/translate] ghi cache lỗi:", error.message);
        } catch (e) {
          console.warn("[api/translate] ghi cache lỗi:", e.message);
        }
      });
    },
  };
}
