import { callGroq } from "@/lib/ai-models";
import { buildWordContentPrompt, dedupeMeaningsByPos } from "@/lib/word-content-prompt";


export async function getOrGenerateWordContent(adminSupabase, { word_id, word, pos, word_level, skill_level, learning_goal }) {
  const sl = skill_level || "B1";

  const { data: cached } = await adminSupabase
    .from("word_ai_content")
    .select("meanings, synonyms")
    .eq("word_id", word_id)
    .eq("skill_level", sl)
    .single();

  if (cached?.meanings?.length > 0) return cached;

  const prompt = buildWordContentPrompt(word, pos || "", word_level || "", sl, learning_goal || "daily");

  try {
    // callGroq() trong ai-models.js đã tự lo: chọn model theo vai trò,
    // chuyển model dự phòng khi nhà cung cấp ngừng model, và thử lại khi
    // gặp 429. Trước đây logic retry 429 viết riêng ở đây — giờ dùng chung.
    const { res } = await callGroq("fast", {
      messages: [{ role: "user", content: prompt }],
      temperature: 0.75,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    });

    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    if (!Array.isArray(parsed.meanings) || parsed.meanings.length === 0) throw new Error("Invalid shape");

    // Chắn nghĩa trùng pos: đo thật thấy "run" trả 3 nghĩa đều là verb.
    parsed.meanings = dedupeMeaningsByPos(parsed.meanings);
    if (parsed.meanings.length === 0) throw new Error("Invalid shape");
    if (!Array.isArray(parsed.synonyms)) parsed.synonyms = [];

    await adminSupabase.from("word_ai_content").upsert({
      word_id,
      skill_level: sl,
      meanings: parsed.meanings,
      synonyms: parsed.synonyms,
    }, { onConflict: "word_id,skill_level" });

    return { meanings: parsed.meanings, synonyms: parsed.synonyms };
  } catch (err) {
    console.error("[generate-ai-content] failed:", err.message);
    return null;
  }
}
