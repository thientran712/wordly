import { createAdminClient } from "@/lib/supabase-admin";
import { getUserFast } from "@/lib/get-user-fast";
import { EXAM_GOALS, examGoalsForLevel } from "@/lib/exam-goals";
import { TOPICS } from "@/lib/topic-classifier";

const TOPIC_LABELS = Object.fromEntries(TOPICS.map((t) => [t.key, t.label]));
const ALL_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Levels that count toward a given exam goal (inverse of examGoalsForLevel).
const LEVELS_FOR_EXAM = Object.fromEntries(
  EXAM_GOALS.map((g) => [g.key, ALL_LEVELS.filter((lv) => examGoalsForLevel(lv).includes(g.key))])
);

const PAGE_SIZE = 40;

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const examFilter = searchParams.get("exam");
  const topicFilter = searchParams.get("topic");
  const levelFilter = searchParams.get("level");
  const q = (searchParams.get("q") || "").trim();
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);
  const withCounts = searchParams.get("counts") === "1";

  const admin = createAdminClient();

  const levelsForQuery = levelFilter
    ? [levelFilter]
    : examFilter
    ? LEVELS_FOR_EXAM[examFilter] || []
    : null;

  // ── Page of words matching the current filters — DB does the filtering,
  // sorting, and pagination, so we only ever pull PAGE_SIZE rows over the
  // wire instead of the full 7.5k-word table. ────────────────────────────
  let wordsQuery = admin
    .from("word_layers")
    .select(
      "word_id, semantic_family, topic, register, collocations, usage_notes, frequency, words!inner(id, word, pos, level, def_en, ex_en, phonetic)",
      { count: "exact" }
    )
    .not("topic", "is", null);

  if (topicFilter) wordsQuery = wordsQuery.eq("topic", topicFilter);
  if (levelsForQuery) wordsQuery = wordsQuery.in("words.level", levelsForQuery);
  if (q) wordsQuery = wordsQuery.ilike("words.word", `${q}%`);

  wordsQuery = wordsQuery.order("frequency", { ascending: false, nullsFirst: false }).range(offset, offset + PAGE_SIZE - 1);

  const { data: page, error, count: total } = await wordsQuery;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const wordIds = (page || []).map((l) => l.word_id);
  const { data: progress } = wordIds.length
    ? await admin.from("user_progress").select("word_id, state, due_at").eq("user_id", user.id).in("word_id", wordIds)
    : { data: [] };
  const progressByWordId = new Map((progress || []).map((p) => [p.word_id, p]));

  const words = (page || []).map((l) => {
    const p = progressByWordId.get(l.word_id);
    return {
      id: l.words.id,
      word: l.words.word,
      pos: l.words.pos,
      level: l.words.level,
      def_en: l.words.def_en,
      ex_en: l.words.ex_en,
      phonetic: l.words.phonetic,
      topic: l.topic,
      topicLabel: TOPIC_LABELS[l.topic] || l.topic,
      register: l.register,
      collocations: l.collocations || [],
      usage_notes: l.usage_notes,
      frequency: l.frequency,
      user_state: p?.state || null,
      due_at: p?.due_at || null,
    };
  });

  const result = { words, total: total || 0 };

  // ── Filter-pill counts — only computed on demand (first load / filter
  // reset), not on every keystroke or page change, and done as lightweight
  // head-only COUNT queries run in parallel rather than pulling full rows. ──
  if (withCounts) {
    const [examCountEntries, topicCountEntries] = await Promise.all([
      Promise.all(
        EXAM_GOALS.map(async (g) => {
          const { count } = await admin
            .from("word_layers")
            .select("word_id, words!inner(level)", { count: "exact", head: true })
            .not("topic", "is", null)
            .in("words.level", LEVELS_FOR_EXAM[g.key] || []);
          return [g.key, count || 0];
        })
      ),
      Promise.all(
        TOPICS.map(async (t) => {
          const { count } = await admin
            .from("word_layers")
            .select("word_id", { count: "exact", head: true })
            .eq("topic", t.key);
          return [t.key, count || 0];
        })
      ),
    ]);
    result.examCounts = Object.fromEntries(examCountEntries);
    result.topicCounts = Object.fromEntries(topicCountEntries);
  }

  return Response.json(result);
}
