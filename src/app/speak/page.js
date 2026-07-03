"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronDown, History, Trash2 } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import ReelSpinner from "@/components/spinner/ReelSpinner";
import TimerModal from "@/components/spinner/TimerModal";
import FilterBar, { TOPIC_CATEGORIES, INTERVIEW_CATEGORIES } from "@/components/spinner/FilterBar";

const MODES = [
  { key: "topics", label: "IELTS Speaking" },
  { key: "interview", label: "Phỏng vấn" },
  { key: "vocab", label: "Từ vựng" },
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
function useSpinHistory(itemType) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    fetch(`/api/spinner/history?item_type=${itemType}`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items || []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [itemType]);

  useEffect(() => { refresh(); }, [refresh]);

  const excludedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);

  const logSpin = useCallback((id, label) => {
    if (!id) return;
    setItems((prev) => [{ id, label, spun_at: new Date().toISOString() }, ...prev]);
    fetch("/api/spinner/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: id, item_type: itemType }),
    }).catch(() => {});
  }, [itemType]);

  const removeFromHistory = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    fetch("/api/spinner/history", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: id, item_type: itemType }),
    }).catch(() => {});
  }, [itemType]);

  return { items, loaded, excludedIds, logSpin, removeFromHistory };
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
        {/* Back button is absolutely positioned so it sits on the same row as the
            title without taking up flex space — the row below keeps the same
            flex-1 + w-72 balance used by the spinner card underneath, so the
            title/tabs stay centered on the card regardless of the back button. */}
        <div className="relative flex items-start gap-5 mb-6">
          <div className="absolute left-0 top-0">
            <BackButton label="Quay lại" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
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
          <div className="hidden lg:block w-72 flex-shrink-0" />
        </div>

        {/* Keep all three mounted so spun state/position isn't lost when switching tabs */}
        <div style={{ display: mode === "topics" ? "block" : "none" }}>
          <TopicsMode />
        </div>
        <div style={{ display: mode === "interview" ? "block" : "none" }}>
          <InterviewMode />
        </div>
        <div style={{ display: mode === "vocab" ? "block" : "none" }}>
          <VocabMode />
        </div>
      </main>
    </>
  );
}

function TopicsMode() {
  const [allTopics, setAllTopics] = useState([]);
  const [category, setCategory] = useState(null);
  const [landed, setLanded] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const history = useSpinHistory("topic");

  useEffect(() => {
    fetch("/api/spinner/topics?language=en")
      .then((r) => r.json())
      .then((d) => setAllTopics(d.topics || []))
      .catch(() => setAllTopics([]));
  }, []);

  const items = useMemo(() => {
    let filtered = category ? allTopics.filter((t) => t.category === category) : allTopics;
    if (filtered.length === 0) filtered = allTopics;
    return excludeSpun(filtered, history.excludedIds);
  }, [allTopics, category, history.excludedIds]);

  const handleLanded = (item) => {
    setLanded(item);
    history.logSpin(item?.id, item?.text);
  };

  const timerSeconds = landed?.category === "part2" ? 120 : 60;

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
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

        <ReelSpinner items={items} renderItem={(t) => t.text} onLanded={handleLanded} />

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

        <TimerModal open={timerOpen} onClose={() => setTimerOpen(false)} defaultSeconds={timerSeconds} topicLabel={landed?.text} />
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
  const [openFramework, setOpenFramework] = useState(null);
  const history = useSpinHistory("interview");

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
    setOpenFramework(item?.framework || null);
    history.logSpin(item?.id, item?.text);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
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

        <ReelSpinner items={items} renderItem={(q) => q.text} onLanded={handleLanded} />

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

        <div className="flex flex-col gap-2.5">
          {FRAMEWORKS.map((fw) => {
            const isOpen = openFramework === fw.id;
            const isRecommended = landed?.framework === fw.id;
            return (
              <div
                key={fw.id}
                className="rounded-2xl overflow-hidden transition-all"
                style={{
                  background: "var(--surface)",
                  border: isRecommended ? "1.5px solid var(--electric)" : "1.5px solid var(--line)",
                  boxShadow: isRecommended ? "0 4px 20px rgba(var(--electric-rgb),0.2)" : "none",
                }}
              >
                <button
                  onClick={() => setOpenFramework(isOpen ? null : fw.id)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 relative"
                >
                  <span className="font-bold text-base" style={{ color: isRecommended ? "var(--electric)" : "var(--ink)" }}>
                    {fw.label}
                  </span>
                  {isRecommended && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--green-subtle)", color: "var(--electric)" }}>
                      GỢI Ý
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className="absolute right-4"
                    style={{ color: "var(--ink-soft)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-3.5 flex flex-col gap-1.5">
                    {fw.steps.map((s, i) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>• {s}</p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <TimerModal open={timerOpen} onClose={() => setTimerOpen(false)} defaultSeconds={90} topicLabel={landed?.text} />
      </div>

      <div className="w-full lg:w-72 flex-shrink-0">
        <HistoryPanel items={history.items} loaded={history.loaded} onRemove={history.removeFromHistory} />
      </div>
    </div>
  );
}

function VocabMode() {
  const [allWords, setAllWords] = useState([]);
  const [language, setLanguage] = useState("en");
  const [difficulty, setDifficulty] = useState(null);
  const [landed, setLanded] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const history = useSpinHistory("vocab");

  useEffect(() => {
    fetch("/api/spinner/preferences")
      .then((r) => r.json())
      .then((d) => {
        if (d.preferences) {
          setLanguage(d.preferences.language || "en");
          setDifficulty(d.preferences.difficulty === "random" ? null : d.preferences.difficulty);
        }
      })
      .catch(() => {});
  }, []);

  const fetchWords = useCallback((lang) => {
    fetch(`/api/spinner/vocab?language=${lang}`)
      .then((r) => r.json())
      .then((d) => setAllWords(d.words || []))
      .catch(() => setAllWords([]));
  }, []);

  useEffect(() => { fetchWords(language); }, [language, fetchWords]);

  const items = useMemo(() => {
    let filtered = allWords.filter((v) => !difficulty || v.difficulty === difficulty);
    if (filtered.length === 0) filtered = allWords;
    return excludeSpun(filtered, history.excludedIds);
  }, [allWords, difficulty, history.excludedIds]);

  const savePrefs = (lang, diff) => {
    fetch("/api/spinner/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: lang, difficulty: diff || "random" }),
    }).catch(() => {});
  };

  const handleLanded = (item) => {
    setLanded(item);
    history.logSpin(item?.id, item?.word);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-5 items-start">
      <div
        className="flex-1 min-w-0 w-full rounded-2xl p-5 sm:p-6"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
      >
        <p className="text-sm mb-5 text-center" style={{ color: "var(--ink-soft)" }}>
          Quay để nhận một từ ngẫu nhiên, rồi thử dùng từ đó khi luyện nói.
        </p>

        <FilterBar
          language={language}
          onLanguageChange={(v) => { const l = v || "en"; setLanguage(l); savePrefs(l, difficulty); }}
          difficulty={difficulty}
          onDifficultyChange={(v) => { setDifficulty(v); savePrefs(language, v); }}
        />

        <ReelSpinner items={items} renderItem={(v) => v.word} onLanded={handleLanded} />

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

        {landed && (
          <div className="mt-5 p-5 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-bold" style={{ color: "var(--electric)" }}>{landed.word}</span>
              {landed.pos && <span className="text-xs italic" style={{ color: "var(--ink-soft)" }}>{landed.pos}</span>}
            </div>
            <p className="text-sm mb-3" style={{ color: "var(--ink)" }}>{landed.definition}</p>

            {landed.sentence && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--sunshine-text)" }}>Ví dụ</p>
                <p className="text-sm italic" style={{ color: "var(--ink-soft)" }}>&ldquo;{landed.sentence}&rdquo;</p>
              </div>
            )}

            {landed.angle && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--sunshine-text)" }}>Gợi ý luyện nói</p>
                <p className="text-sm" style={{ color: "var(--ink)" }}>{landed.angle}</p>
              </div>
            )}
          </div>
        )}

        <TimerModal open={timerOpen} onClose={() => setTimerOpen(false)} defaultSeconds={30} topicLabel={landed?.word} />
      </div>

      <div className="w-full lg:w-72 flex-shrink-0">
        <HistoryPanel items={history.items} loaded={history.loaded} onRemove={history.removeFromHistory} />
      </div>
    </div>
  );
}
