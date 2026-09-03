// Cấu hình model AI — TẬP TRUNG MỘT CHỖ.
//
// Vì sao có file này: tháng 9/2026 Groq ngừng cung cấp `llama-3.1-8b-instant`
// và `llama-3.3-70b-versatile` mà app đang dùng ở 5 file khác nhau → mọi
// tính năng AI (từ điển, chat với Alex, gợi ý từ) lỗi cùng lúc, và phải sửa
// 5 chỗ. Từ giờ đổi model chỉ sửa file này.
//
// Nhà cung cấp có thể ngừng model bất cứ lúc nào, nên mỗi vai trò có danh
// sách dự phòng: hàm callGroq() tự thử model tiếp theo khi model đầu lỗi.

export const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Model theo VAI TRÒ, không theo tên — code gọi theo việc cần làm.
 * Thứ tự trong mảng = thứ tự thử khi model trước lỗi.
 */
export const MODELS = {
  // Việc nhanh, khối lượng lớn, cần JSON: từ điển, gợi ý từ, đặt tiêu đề
  fast: ["qwen/qwen3.8-27b", "groq/compound-mini", "openai/gpt-oss-20b"],

  // Việc cần chất lượng cao: hội thoại với Alex, chấm bài, soạn đề
  quality: ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "groq/compound-mini"],

  // Chuyển audio thành văn bản (dùng cho chấm bài nói)
  transcribe: ["whisper-large-v3-turbo", "whisper-large-v3"],
};

/**
 * Gọi Groq với tự động chuyển model dự phòng.
 *
 * Vì sao cần: nhà cung cấp ngừng model là chuyện đã xảy ra một lần. Nếu chỉ
 * hardcode một tên, sự cố lặp lại sẽ làm sập tính năng lần nữa.
 *
 * @param role      'fast' | 'quality'
 * @param body      phần thân request (messages, temperature, ...)
 * @param signal    AbortSignal (tuỳ chọn)
 */
export async function callGroq(role, body, { signal } = {}) {
  const candidates = MODELS[role] || MODELS.fast;
  let lastError = null;

  for (const model of candidates) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, model }),
        signal,
      });

      if (res.ok) return { res, model };

      // 429 = quá tải/hết hạn mức: chờ rồi thử lại CÙNG model một lần,
      // vì chuyển model khác cũng sẽ gặp giới hạn tương tự.
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "3", 10);
        await new Promise((r) => setTimeout(r, Math.min(retryAfter, 10) * 1000));
        const retry = await fetch(GROQ_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...body, model }),
          signal,
        });
        if (retry.ok) return { res: retry, model };
        lastError = new Error(`Groq 429 sau khi thử lại (${model})`);
        continue;
      }

      // 404/400 thường là model không còn tồn tại → thử model tiếp theo
      const text = await res.text().catch(() => "");
      lastError = new Error(`Groq ${res.status} (${model}): ${text.slice(0, 200)}`);
      console.warn(`[ai-models] ${model} lỗi ${res.status}, thử model tiếp theo`);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastError = e;
      console.warn(`[ai-models] ${model} lỗi mạng, thử model tiếp theo:`, e.message);
    }
  }

  throw lastError || new Error("Tất cả model Groq đều lỗi");
}

/**
 * Chuyển audio thành văn bản bằng Whisper.
 * Trả về { text, model } hoặc throw.
 */
export async function transcribeAudio(audioBlob, { language = "en", signal } = {}) {
  let lastError = null;

  for (const model of MODELS.transcribe) {
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

/** Đọc nội dung JSON từ phản hồi Groq, chịu được vài kiểu sai định dạng. */
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
