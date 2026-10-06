// Cache audio TTS hai tầng: RAM (nhanh, mất khi instance tắt) → R2 (bền, dùng
// chung mọi instance) → Google TTS (tính phí).
//
// Vì sao: cache chỉ trong RAM gần như luôn trống trên Vercel serverless, nên
// cùng một từ đọc 100 lần là Google tính phí 100 lần. R2 không tính phí băng
// thông tải xuống nên rẻ hơn Supabase Storage cho việc này.
//
// Cache KHÔNG BAO GIỜ làm hỏng phát âm: R2 lỗi khi đọc/ghi thì vẫn trả audio
// từ Google. Logic thuần (store/synthesize truyền vào) để test được không cần mạng.
import { createHash } from "node:crypto";

/** Key R2 cho một (giọng, câu). Băm câu để không lộ nội dung người dùng trong key. */
export function ttsCacheKey(voice, text) {
  const hash = createHash("sha256").update(text.trim()).digest("hex");
  return `tts/v1/${voice}/${hash}.mp3`;
}

/**
 * @param key         từ ttsCacheKey()
 * @param memory      Map dùng làm cache RAM của instance
 * @param store       { get(key) → bytes|null, put(key, bytes) } — R2
 * @param synthesize  () → bytes — gọi Google TTS
 * @returns { audio, source: "memory" | "r2" | "google" }
 */
export async function getOrCreateAudio({ key, memory, store, synthesize, memoryMax = 500 }) {
  const remember = (audio) => {
    if (memory.size >= memoryMax) memory.delete(memory.keys().next().value); // bỏ cái cũ nhất
    memory.set(key, audio);
  };

  const inMemory = memory.get(key);
  if (inMemory) return { audio: inMemory, source: "memory" };

  try {
    const stored = await store.get(key);
    if (stored) {
      remember(stored);
      return { audio: stored, source: "r2" };
    }
  } catch (e) {
    console.warn("[tts-cache] đọc R2 lỗi, gọi Google:", e.message);
  }

  const audio = await synthesize();
  try {
    await store.put(key, audio);
  } catch (e) {
    console.warn("[tts-cache] ghi R2 lỗi (vẫn trả audio):", e.message);
  }
  remember(audio);
  return { audio, source: "google" };
}
