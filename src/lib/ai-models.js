// Cấu hình model AI — TẬP TRUNG MỘT CHỖ.
//
// Vì sao có file này: tháng 9/2026 Groq ngừng cung cấp `llama-3.1-8b-instant`
// và `llama-3.3-70b-versatile` mà app đang dùng ở 5 file khác nhau → mọi
// tính năng AI (từ điển, chat với Alex, gợi ý từ) lỗi cùng lúc, và phải sửa
// 5 chỗ. Từ giờ đổi model chỉ sửa file này.
//
// Bài học lớn hơn từ sự cố đó: phụ thuộc MỘT nhà cung cấp là điểm chết đơn.
// Nên giờ mỗi vai trò có ladder xuyên nhà cung cấp — Gemini chính, Groq dự
// phòng. Gemini lỗi/hết quota/quá tải thì tính năng vẫn chạy qua Groq.

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Nhà cung cấp. Cả hai đều nói "tiếng OpenAI" nên phần thân request và hình
 * dạng phản hồi (`choices[0]`) giống nhau y hệt.
 *
 * QUAN TRỌNG: Gemini phải dùng endpoint tương thích OpenAI
 * (`/v1beta/openai/chat/completions`), KHÔNG dùng `generateContent` gốc.
 * Nhờ vậy 9 chỗ gọi AI trong app không phải sửa gì, và chat Alex đang
 * stream SSE (`choices[0].delta.content`) vẫn chạy nguyên.
 */
export const PROVIDERS = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
  },
  groq: {
    url: GROQ_URL,
    keyEnv: "GROQ_API_KEY",
  },
};

const g = (model) => ({ provider: "gemini", model });
const q = (model) => ({ provider: "groq", model });

/**
 * Model theo VAI TRÒ, không theo tên — code gọi theo việc cần làm.
 * Thứ tự trong mảng = thứ tự thử khi model trước lỗi.
 *
 * Vì sao chọn đúng những model này (đo tay 9/2026, không phải phỏng đoán):
 *   • gemini-flash-lite-latest ~0.9s, gemini-2.5-flash ~1.6s → dùng được
 *   • gemini-3-flash-preview ~15.8s, gemini-3.8-flash ~17.9s → LOẠI, đây là
 *     model "thinking"; thẻ từ vựng là chỗ người dùng ngồi chờ
 *   • gemini-2.5-pro trả 404 (không còn mở cho user mới) → LOẠI
 *   • gemini-pro-latest trả 429 (hết quota trên key hiện tại) → LOẠI
 */
export const MODELS = {
  // Việc nhanh, khối lượng lớn, cần JSON: từ điển, nghĩa từ, gợi ý từ, đặt tiêu đề
  fast: [
    g("gemini-flash-lite-latest"),
    g("gemini-2.5-flash"),
    q("qwen/qwen3.8-27b"),
    q("groq/compound-mini"),
  ],

  // Việc cần chất lượng cao: hội thoại với Alex, chấm bài, soạn đề
  quality: [
    g("gemini-2.5-flash"),
    g("gemini-3.5-flash"),
    q("openai/gpt-oss-120b"),
    q("qwen/qwen3.8-27b"),
  ],

  // Chuyển audio thành văn bản (dùng cho chấm bài nói).
  // Giữ ở Groq: Gemini không có endpoint transcription tương thích OpenAI.
  transcribe: [q("whisper-large-v3-turbo"), q("whisper-large-v3")],
};

/** Chuẩn hoá phần tử ladder — chịu được cả dạng chuỗi cũ. */
function normalize(entry) {
  return typeof entry === "string" ? { provider: "groq", model: entry } : entry;
}

async function postOnce({ provider, model }, body, signal) {
  const p = PROVIDERS[provider];
  const res = await fetch(p.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env[p.keyEnv]}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model }),
    signal,
  });
  return res;
}

/**
 * Gọi AI với tự động chuyển model VÀ chuyển nhà cung cấp.
 *
 * Vì sao cần: nhà cung cấp ngừng model là chuyện đã xảy ra một lần. Khi đo
 * tay còn gặp thật cả 503 "high demand" và 429 "hết quota" từ Gemini — nếu
 * không có lớp này thì mỗi lần như vậy là một lần tính năng sập.
 *
 * @param role      'fast' | 'quality'
 * @param body      phần thân request (messages, temperature, ...)
 * @param signal    AbortSignal (tuỳ chọn)
 * @returns { res, model, provider }
 */
export async function callAI(role, body, { signal } = {}) {
  const ladder = (MODELS[role] || MODELS.fast).map(normalize);
  let lastError = null;

  for (const entry of ladder) {
    const { provider, model } = entry;

    // Thiếu key thì bỏ qua hẳn nhà cung cấp đó — đừng đốt thời gian gọi để
    // nhận 401. Trường hợp thật: GEMINI_API_KEY chưa thêm vào Vercel.
    if (!process.env[PROVIDERS[provider].keyEnv]) {
      lastError = lastError || new Error(`Thiếu ${PROVIDERS[provider].keyEnv}`);
      continue;
    }

    // Còn nhà cung cấp khác phía sau thì đừng chờ retry-after — chuyển luôn
    // sang nhà cung cấp khác nhanh hơn nhiều so với ngồi đợi hạn mức.
    const hasFallbackAhead = ladder
      .slice(ladder.indexOf(entry) + 1)
      .some((e) => process.env[PROVIDERS[e.provider].keyEnv]);

    try {
      const res = await postOnce(entry, body, signal);
      if (res.ok) return { res, model, provider };

      // 429 = quá tải/hết hạn mức. Nếu KHÔNG còn đường lui thì mới chờ rồi
      // thử lại cùng model; còn đường lui thì tụt xuống ngay.
      if (res.status === 429 && !hasFallbackAhead) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "3", 10);
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
        const retry = await postOnce(entry, body, signal);
        if (retry.ok) return { res: retry, model, provider };
        lastError = new Error(`${provider} 429 sau khi thử lại (${model})`);
        continue;
      }

      // 404/400 thường là model không còn tồn tại, 503 là quá tải tạm thời
      // → thử bậc tiếp theo trong ladder
      const text = await res.text().catch(() => "");
      lastError = new Error(`${provider} ${res.status} (${model}): ${text.slice(0, 200)}`);
      console.warn(`[ai-models] ${provider}/${model} lỗi ${res.status}, thử bậc tiếp theo`);
    } catch (e) {
      // Abort là chủ ý của người dùng (đóng tab, huỷ request) — không phải
      // lỗi nhà cung cấp, nên dừng ngay chứ không thử model khác.
      if (e.name === "AbortError") throw e;
      lastError = e;
      console.warn(`[ai-models] ${provider}/${model} lỗi mạng, thử bậc tiếp theo:`, e.message);
    }
  }

  throw lastError || new Error("Tất cả nhà cung cấp AI đều lỗi");
}

/**
 * Tên cũ, giữ để 9 chỗ gọi trong app không phải sửa.
 * Giờ đã đi qua ladder Gemini → Groq chứ không chỉ Groq.
 */
export const callGroq = callAI;

/**
 * Chuyển audio thành văn bản bằng Whisper (Groq).
 * Trả về { text, duration, model } hoặc throw.
 */
export async function transcribeAudio(audioBlob, { language = "en", signal } = {}) {
  let lastError = null;

  for (const entry of MODELS.transcribe) {
    const { model } = normalize(entry);
    try {
      const form = new FormData();
      form.append("file", audioBlob, "audio.webm");
      form.append("model", model);
      form.append("language", language);
      // verbose_json cho biết thêm thời lượng — dùng để tính tốc độ nói
      form.append("response_format", "verbose_json");

      const res = await fetch(GROQ_TRANSCRIBE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        return { text: data.text || "", duration: data.duration ?? null, model };
      }

      const text = await res.text().catch(() => "");
      lastError = new Error(`Whisper ${res.status} (${model}): ${text.slice(0, 200)}`);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastError = e;
    }
  }

  throw lastError || new Error("Không chuyển được audio thành văn bản");
}

/** Đọc nội dung JSON từ phản hồi AI, chịu được vài kiểu sai định dạng. */
export function parseJsonResponse(content) {
  if (typeof content !== "string") return null;
  try {
    return JSON.parse(content);
  } catch {
    // Model đôi khi bọc JSON trong ```json ... ``` hoặc thêm lời dẫn
    const m = content.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
