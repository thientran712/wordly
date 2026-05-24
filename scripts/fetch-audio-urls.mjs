import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://blattojsgqyhoxkglind.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsYXR0b2pzZ3F5aG94a2dsaW5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODM0NzgxNCwiZXhwIjoyMDkzOTIzODE0fQ.T5M7raR5QrlszXMJ8aGokWyYvpWhn7iAZbtU8mPPL3w"
);

async function getAudioUrl(word) {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Ưu tiên audio US, fallback bất kỳ audio nào có
    const phonetics = data[0]?.phonetics || [];
    const usAudio = phonetics.find(p => p.audio?.includes("-us."));
    const anyAudio = phonetics.find(p => p.audio);
    return usAudio?.audio || anyAudio?.audio || null;
  } catch {
    return null;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // Lấy tất cả từ chưa có audio_url
  const { data: words, error } = await supabase
    .from("words")
    .select("id, word")
    .is("audio_url", null)
    .order("id");

  if (error) { console.error("Lỗi fetch words:", error.message); process.exit(1); }
  console.log(`Tổng số từ cần fetch: ${words.length}`);

  let found = 0, notFound = 0, errors = 0;
  const BATCH = 5;

  for (let i = 0; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH);

    await Promise.all(batch.map(async (w) => {
      const audioUrl = await getAudioUrl(w.word);
      if (audioUrl) {
        const { error: updateError } = await supabase
          .from("words")
          .update({ audio_url: audioUrl })
          .eq("id", w.id);
        if (updateError) { errors++; }
        else { found++; }
      } else {
        notFound++;
      }
    }));

    // Progress log mỗi 100 từ
    const processed = Math.min(i + BATCH, words.length);
    if (processed % 100 === 0 || processed === words.length) {
      console.log(`[${processed}/${words.length}] ✅ ${found} found | ⚠️ ${notFound} not found | ❌ ${errors} errors`);
    }

    await sleep(150); // 150ms giữa các batch tránh rate limit
  }

  console.log("\n=== Hoàn thành ===");
  console.log(`✅ Có audio: ${found}`);
  console.log(`⚠️  Không có audio: ${notFound}`);
  console.log(`❌ Lỗi: ${errors}`);
}

main();
