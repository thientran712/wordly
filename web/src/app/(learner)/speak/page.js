"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { History, Trash2 } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import ReelSpinner from "@/components/spinner/ReelSpinner";
import TimerModal from "@/components/spinner/TimerModal";
import FilterBar, { TOPIC_CATEGORIES, INTERVIEW_CATEGORIES, DEEP_TALK_CATEGORIES } from "@/components/spinner/FilterBar";
import { trackEvent } from "@/lib/analytics";

const MODES = [
  { key: "topics", label: "IELTS Speaking" },
  { key: "interview", label: "Phỏng vấn" },
  { key: "deepTalk", label: "Deep Talk" },
];

function pillStyle(active) {
  return {
    background: active ? "var(--electric)" : "var(--surface-elevated)",
    color: active ? "var(--on-electric)" : "var(--ink-soft)",
    boxShadow: active ? "0 4px 12px rgba(var(--electric-rgb),0.3)" : "none",
    border: active ? "none" : "1.5px solid var(--line)",
  };
}

// Fetches + owns the spun-history list for one item_type, shared by every
// mode so the history panel and the spin-pool exclusion logic stay in sync.
//
// The most-recently-landed item is tracked separately as `pendingId` and kept
// OUT of `excludedIds` on purpose: it's already saved to history (so it shows
// up in the history panel right away), but it stays visible/spinnable in the
// wheel until the user spins again. `commitPending()` is called from
// ReelSpinner's onSpinStart right as a new spin begins — it folds the pending
// id into the real exclusion set and returns the up-to-date id set
// synchronously, so that very spin already excludes it (not just the next
// render after).
function useSpinHistory(itemType) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const pendingIdRef = useRef(null);

  const refresh = useCallback(() => {
    fetch(`/api/spinner/history?item_type=${itemType}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [itemType]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { pendingIdRef.current = pendingId; }, [pendingId]);

  const excludedIds = useMemo(() => {
    const ids = new Set(items.map((i) => i.id));
    if (pendingId != null) ids.delete(pendingId);
    return ids;
  }, [items, pendingId]);

  const logSpin = useCallback((id, label) => {
    if (!id) return;
    setItems((prev) => [{ id, label, spun_at: new Date().toISOString() }, ...prev]);
    setPendingId(id);
    trackEvent("spin", { item_type: itemType });
    fetch("/api/spinner/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: id, item_type: itemType }),
    }).catch(() => {});
  }, [itemType]);

  // Called at the start of a new spin — folds the previously-pending id into
  // the real exclusion set and hands back the fresh Set synchronously.
  const commitPending = useCallback(() => {
    if (pendingIdRef.current == null) return excludedIds;
    const ids = new Set(excludedIds);
    ids.add(pendingIdRef.current);
    setPendingId(null);
    return ids;
  }, [excludedIds]);

  const removeFromHistory = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setPendingId((prev) => (prev === id ? null : prev));
    fetch("/api/spinner/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: id, item_type: itemType }),
    }).catch(() => {});
  }, [itemType]);

  return { items, loaded, excludedIds, logSpin, commitPending, removeFromHistory };
}

// Once an item has been spun, it's fully removed from the wheel (not just
// deprioritized) until the user deletes it from history. If everything
// eligible has already been spun, fall back to the full pool rather than
// leaving the wheel empty.
function excludeSpun(pool, excludedIds) {
  if (excludedIds.size === 0) return pool;
  const remaining = pool.filter((item) => !excludedIds.has(item.id));
  return remaining.length > 0 ? remaining : pool;
}

// AI-generated vocab suggestions for the currently-landed question. Fetches
// fresh every time (no caching, per user's choice — variety over reuse) so
// spinning the same question twice yields different suggested words. Failure
// just resolves to an empty array — this is a bonus feature that should
// never block or error out the core spin/speak flow.
function useVocabSuggestions() {
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const fetchFor = useCallback((question, kind) => {
    if (!question) { setWords([]); setLoading(false); return; }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setWords([]);
    fetch("/api/spinner/vocab-suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, kind }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (requestIdRef.current !== requestId) return; // stale response from a previous spin
        setWords(d.words || []);
      })
      .catch(() => {
        if (requestIdRef.current === requestId) setWords([]);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, []);

  return { words, loading, fetchFor };
}

function HistoryPanel({ items, loaded, onRemove, emptyHint }) {
  return (
    <div
      className="rounded-2xl p-4 sm:p-5 flex flex-col"
      style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)", maxHeight: 560 }}
    >
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <History size={16} style={{ color: "var(--electric)" }} />
        <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Đã quay trúng</span>
        {items.length > 0 && (
          <span className="text-xs font-bold ml-auto" style={{ color: "var(--ink-soft)" }}>{items.length}</span>
        )}
      </div>

      {!loaded ? (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Đang tải...</p>
      ) : items.length === 0 ? (
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
          {emptyHint || "Chưa có mục nào — những gì bạn quay trúng sẽ hiện ở đây, và sẽ không lặp lại trong vòng quay cho đến khi bạn xoá."}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="group flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "var(--surface)" }}
            >
              <span className="text-xs flex-1 leading-snug" style={{ color: "var(--ink)" }}>{item.label}</span>
              <button
                onClick={() => onRemove(item.id)}
                title="Xoá khỏi lịch sử — sẽ có thể quay trúng lại"
                className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all active:scale-90 opacity-60 hover:opacity-100"
                style={{ color: "var(--error)" }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SpeakPage() {
  const [mode, setMode] = useState("topics");

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Back button gets its own row below lg: (stacking, not absolute
            positioning — a fixed-width offset can't reliably balance a
            variable-width back button + title on narrow real devices,
            confirmed broken on-device). From lg: up, back to one row with the
            w-72 spacer balancing against the real history-panel column width. */}
        <div className="lg:hidden flex items-center justify-between mb-3">
          <BackButton label="Quay lại" />
        </div>
        {/* Same flex-1 + lever-width split as the reel/filter/button rows inside
            each mode's card, so the title+tabs center over the question column
            itself instead of the whole card (which would skew them relative to
            the lever column on the right). */}
        <div className="flex w-full gap-3 mb-3 lg:hidden">
          <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              🎙️ Luyện nói
            </h1>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className="px-4 py-2 rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all whitespace-nowrap"
                  style={pillStyle(mode === m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <div className="hidden lg:flex items-start gap-5 mb-6">
          <BackButton label="Quay lại" />
          <div className="flex-1 min-w-0 flex gap-3">
            <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
                🎙️ Luyện nói
              </h1>
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className="px-4 py-2 rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all whitespace-nowrap"
                    style={pillStyle(mode === m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-shrink-0" style={{ width: 56 }} />
          </div>
          <div className="w-72 flex-shrink-0" />
        </div>

        {/* Keep all modes mounted so spun state/position isn't lost when switching tabs */}
        <div style={{ display: mode === "topics" ? "block" : "none" }}>
          <TopicsMode />
        </div>
        <div style={{ display: mode === "interview" ? "block" : "none" }}>
          <InterviewMode />
        </div>
        <div style={{ display: mode === "deepTalk" ? "block" : "none" }}>
          <DeepTalkMode />
        </div>
      </main>
    </>
  );
}

// One framework per IELTS Speaking part — each targets that part's distinct
// answer shape (short factual Part 1 vs. 1-2min cue-card Part 2 vs.
// analytical-discussion Part 3), auto-highlighted by the landed question's
// category, mirroring how FRAMEWORKS/openFramework work in InterviewMode.
const IELTS_FRAMEWORKS = [
  { id: "pee", category: "part1", label: "PEE", steps: ["Point — Trả lời thẳng câu hỏi", "Extend — Thêm 1 câu lý do/giải thích", "Example — Ví dụ cá nhân cụ thể"] },
  { id: "area", category: "part2", label: "AREA", steps: ["Answer — Trả lời thẳng ý chính (ai/gì/khi nào/ở đâu)", "Reason — Vì sao/bối cảnh xảy ra", "Example — Chi tiết hoặc kỷ niệm cụ thể", "Add-on — Cảm nghĩ/ảnh hưởng lâu dài"] },
  { id: "oreo", category: "part3", label: "OREO", steps: ["Opinion — Nêu quan điểm rõ ràng", "Reason — Lý do cho quan điểm đó", "Example — Ví dụ minh hoạ (nên mang tính xã hội)", "Opinion — Chốt lại quan điểm"] },
];

function TopicsMode() {
  const [allTopics, setAllTopics] = useState([]);
  const [category, setCategory] = useState(null);
  const [landed, setLanded] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const history = useSpinHistory("topic");
  const vocab = useVocabSuggestions();

  useEffect(() => {
    fetch("/api/spinner/topics?language=en")
      .then((r) => r.json())
      .then((d) => setAllTopics(d.topics || []))
      .catch(() => setAllTopics([]));
  }, []);

  const filteredPool = useMemo(() => {
    const filtered = category ? allTopics.filter((t) => t.category === category) : allTopics;
    return filtered.length > 0 ? filtered : allTopics;
  }, [allTopics, category]);

  const items = useMemo(
    () => excludeSpun(filteredPool, history.excludedIds),
    [filteredPool, history.excludedIds]
  );

  const handleLanded = (item) => {
    setLanded(item);
    history.logSpin(item?.id, item?.text);
    vocab.fetchFor(item?.text, "ielts");
  };

  const handleSpinStart = () => excludeSpun(filteredPool, history.commitPending());

  const timerSeconds = landed?.category === "part2" ? 120 : 60;

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
        {/* Subtitle + filter centered over just the reel-window's flex-1 share
            (matching ReelSpinner's own internal split), not the whole card,
            so they line up with the questions instead of the lever column. */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm mb-5 text-center" style={{ color: "var(--ink-soft)" }}>
              Quay để nhận một câu hỏi IELTS Speaking (Part 1–3), rồi luyện nói trong thời gian giới hạn.
            </p>

            <FilterBar
              showLanguage={false}
              showDifficulty={false}
              category={category}
              onCategoryChange={setCategory}
              categoryOptions={TOPIC_CATEGORIES}
              categoryAllLabel="🎲 Ngẫu nhiên (Part 1–3)"
            />
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <ReelSpinner items={items} renderItem={(t) => t.text} onLanded={handleLanded} onSpinStart={handleSpinStart} />

        {/* Same flex-1 + lever-width split as ReelSpinner's own button row, so
            this centers under the reel-window instead of the whole card. */}
        <div className="flex w-full gap-3 mt-3">
          <div className="flex-1 min-w-0 flex justify-center">
            <button
              onClick={() => setTimerOpen(true)}
              disabled={!landed}
              className="px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1.5px solid var(--electric-border)", color: "var(--electric)", background: "transparent" }}
            >
              Bắt đầu hẹn giờ →
            </button>
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <TimerModal
          open={timerOpen}
          onClose={() => setTimerOpen(false)}
          defaultSeconds={timerSeconds}
          topicLabel={landed?.text}
          vocabWords={vocab.words}
          vocabLoading={vocab.loading}
          frameworks={IELTS_FRAMEWORKS}
          recommendedFrameworkId={IELTS_FRAMEWORKS.find((f) => f.category === landed?.category)?.id}
        />
      </div>

      <div className="w-full lg:w-72 flex-shrink-0">
        <HistoryPanel items={history.items} loaded={history.loaded} onRemove={history.removeFromHistory} />
      </div>
    </div>
  );
}

function DeepTalkMode() {
  const [allQuestions, setAllQuestions] = useState([]);
  const [category, setCategory] = useState(null);
  const [landed, setLanded] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const history = useSpinHistory("deep_talk");
  const vocab = useVocabSuggestions();

  const fetchQuestions = useCallback((cat) => {
    const params = cat ? `?category=${cat}` : "";
    fetch(`/api/spinner/deep-talk${params}`)
      .then((r) => r.json())
      .then((d) => setAllQuestions(d.questions || []))
      .catch(() => setAllQuestions([]));
  }, []);

  useEffect(() => { fetchQuestions(category); }, [category, fetchQuestions]);

  const items = useMemo(
    () => excludeSpun(allQuestions, history.excludedIds),
    [allQuestions, history.excludedIds]
  );

  const handleLanded = (item) => {
    setLanded(item);
    history.logSpin(item?.id, item?.text);
    vocab.fetchFor(item?.text, "deep_talk");
  };

  const handleSpinStart = () => excludeSpun(allQuestions, history.commitPending());

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
        {/* Subtitle + filter centered over just the reel-window's flex-1 share,
            matching ReelSpinner's own internal split — see TopicsMode's
            identical wrapper for the full rationale. */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm mb-5 text-center" style={{ color: "var(--ink-soft)" }}>
              Quay để nhận một câu hỏi trò chuyện sâu, giúp bạn luyện nói tiếng Anh về những chủ đề thật sự đáng suy ngẫm.
            </p>

            <FilterBar
              showLanguage={false}
              showDifficulty={false}
              category={category}
              onCategoryChange={setCategory}
              categoryOptions={DEEP_TALK_CATEGORIES}
              categoryAllLabel="🎲 Mọi chủ đề"
            />
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <ReelSpinner items={items} renderItem={(q) => q.text} onLanded={handleLanded} onSpinStart={handleSpinStart} />

        {/* Same flex-1 + lever-width split as ReelSpinner's own button row, so
            this centers under the reel-window instead of the whole card. */}
        <div className="flex w-full gap-3 mt-3">
          <div className="flex-1 min-w-0 flex justify-center">
            <button
              onClick={() => setTimerOpen(true)}
              disabled={!landed}
              className="px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1.5px solid var(--electric-border)", color: "var(--electric)", background: "transparent" }}
            >
              Bắt đầu hẹn giờ →
            </button>
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <TimerModal
          open={timerOpen}
          onClose={() => setTimerOpen(false)}
          defaultSeconds={90}
          topicLabel={landed?.text}
          vocabWords={vocab.words}
          vocabLoading={vocab.loading}
        />
      </div>

      <div className="w-full lg:w-72 flex-shrink-0">
        <HistoryPanel items={history.items} loaded={history.loaded} onRemove={history.removeFromHistory} />
      </div>
    </div>
  );
}

const FRAMEWORKS = [
  { id: "star", label: "STAR", steps: ["Situation — Bối cảnh sự việc", "Task — Vai trò của bạn là gì?", "Action — Bạn đã làm gì?", "Result — Kết quả ra sao?"] },
  { id: "prep", label: "PREP", steps: ["Point — Nêu luận điểm chính", "Reason — Vì sao điều đó đúng?", "Example — Đưa ví dụ cụ thể", "Point — Nhắc lại luận điểm"] },
  { id: "ppf", label: "PPF", steps: ["Past — Trước đây bạn ở đâu?", "Present — Hiện tại bạn đang ở đâu?", "Future — Bạn sẽ đi đến đâu?"] },
  { id: "mece", label: "MECE", steps: ["Mutually Exclusive — Không chồng chéo", "Collectively Exhaustive — Không bỏ sót", "Chia câu trả lời thành các nhóm rõ ràng", "Ưu tiên và tóm tắt lại"] },
];

function InterviewMode() {
  const [allQuestions, setAllQuestions] = useState([]);
  const [category, setCategory] = useState("behavioral");
  const [landed, setLanded] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const history = useSpinHistory("interview");
  const vocab = useVocabSuggestions();

  const fetchQuestions = useCallback((cat) => {
    fetch(`/api/spinner/interview?category=${cat}`)
      .then((r) => r.json())
      .then((d) => setAllQuestions(d.questions || []))
      .catch(() => setAllQuestions([]));
  }, []);

  useEffect(() => { fetchQuestions(category); }, [category, fetchQuestions]);

  const items = useMemo(
    () => excludeSpun(allQuestions, history.excludedIds),
    [allQuestions, history.excludedIds]
  );

  const handleLanded = (item) => {
    setLanded(item);
    history.logSpin(item?.id, item?.text);
    vocab.fetchFor(item?.text, "interview");
  };

  const handleSpinStart = () => excludeSpun(allQuestions, history.commitPending());

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
        {/* Subtitle + filter centered over just the reel-window's flex-1 share,
            matching ReelSpinner's own internal split — see TopicsMode's
            identical wrapper for the full rationale. */}
        <div className="flex w-full gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm mb-5 text-center" style={{ color: "var(--ink-soft)" }}>
              Quay để nhận câu hỏi phỏng vấn, áp dụng framework gợi ý để trả lời có cấu trúc.
            </p>

            <FilterBar
              showLanguage={false}
              showDifficulty={false}
              category={category}
              onCategoryChange={(v) => setCategory(v || "behavioral")}
              categoryOptions={INTERVIEW_CATEGORIES}
              categoryAllLabel={undefined}
            />
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <ReelSpinner items={items} renderItem={(q) => q.text} onLanded={handleLanded} onSpinStart={handleSpinStart} />

        {/* Same flex-1 + lever-width split as ReelSpinner's own button row, so
            this centers under the reel-window instead of the whole card. */}
        <div className="flex w-full gap-3 mt-3 mb-6">
          <div className="flex-1 min-w-0 flex justify-center">
            <button
              onClick={() => setTimerOpen(true)}
              disabled={!landed}
              className="px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ border: "1.5px solid var(--electric-border)", color: "var(--electric)", background: "transparent" }}
            >
              Bắt đầu hẹn giờ →
            </button>
          </div>
          <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
        </div>

        <TimerModal
          open={timerOpen}
          onClose={() => setTimerOpen(false)}
          defaultSeconds={90}
          topicLabel={landed?.text}
          vocabWords={vocab.words}
          vocabLoading={vocab.loading}
          frameworks={FRAMEWORKS}
          recommendedFrameworkId={landed?.framework}
        />
      </div>

      <div className="w-full lg:w-72 flex-shrink-0">
        <HistoryPanel items={history.items} loaded={history.loaded} onRemove={history.removeFromHistory} />
      </div>
    </div>
  );
}

