import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";

const TOPIC_LABELS = {
  business: "Business & Strategy",
  communication: "Communication & Negotiation",
  psychology: "Psychology & Human Behavior",
  technology: "Technology & AI",
  academic: "Academic & IELTS",
  daily: "Daily Sophisticated English",
};

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  let layers = [];
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("word_layers")
      .select("word_id, semantic_family, topic, register, collocations, usage_notes, frequency, words!inner(id, word, pos, level, def_en, ex_en, phonetic)")
      .not("topic", "is", null)
      .range(from, from + 999);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    layers = layers.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const { data: progress } = await admin
    .from("user_progress")
    .select("word_id, state, due_at")
    .eq("user_id", user.id);

  const progressByWordId = new Map((progress || []).map((p) => [p.word_id, p]));

  const topicMap = new Map();
  for (const l of layers) {
    const topicKey = l.topic;
    if (!topicMap.has(topicKey)) {
      topicMap.set(topicKey, { key: topicKey, label: TOPIC_LABELS[topicKey] || topicKey, families: new Map() });
    }
    const topicEntry = topicMap.get(topicKey);

    const familyKey = l.semantic_family || "Other";
    if (!topicEntry.families.has(familyKey)) {
      topicEntry.families.set(familyKey, { name: familyKey, words: [] });
    }

    const p = progressByWordId.get(l.word_id);
    topicEntry.families.get(familyKey).words.push({
      id: l.words.id,
      word: l.words.word,
      pos: l.words.pos,
      level: l.words.level,
      def_en: l.words.def_en,
      ex_en: l.words.ex_en,
      phonetic: l.words.phonetic,
      register: l.register,
      collocations: l.collocations || [],
      usage_notes: l.usage_notes,
      frequency: l.frequency,
      user_state: p?.state || null,
      due_at: p?.due_at || null,
    });
  }

  const topics = [...topicMap.values()].map((t) => ({
    key: t.key,
    label: t.label,
    families: [...t.families.values()]
      .map((f) => ({ ...f, words: f.words.sort((a, b) => (b.frequency || 0) - (a.frequency || 0)) }))
      .sort((a, b) => b.words.length - a.words.length),
  }));

  return Response.json({ topics });
}
