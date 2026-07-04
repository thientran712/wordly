"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, Volume2, X } from "lucide-react";
import BackButton from "@/components/ui/BackButton";
import Dropdown from "@/components/ui/Dropdown";
import { EXAM_GOALS } from "@/lib/exam-goals";
import { TOPICS } from "@/lib/topic-classifier";

// Same server-side Google Cloud TTS used by translation (InlineTranslate.js) —
// much better quality than the browser's built-in speechSynthesis, which is
// kept only as a fallback if the API call fails.
async function speak(text, lang = "en-US") {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) throw new Error("TTS API failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  } catch {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  }
}

function starRating(n) {
  const filled = Math.max(0, Math.min(5, n || 0));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function dueRank(word) {
  if (!word.due_at) return 1;
  return new Date(word.due_at).getTime() <= Date.now() ? 0 : 2;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const LEVEL_LABELS = {
  A1: "A1 — Mới bắt đầu", A2: "A2 — Sơ cấp",
  B1: "B1 — Trung cấp", B2: "B2 — Trung cấp cao",
  C1: "C1 — Nâng cao", C2: "C2 — Thành thạo",
};
const WORDS_PER_PAGE = 40;

export default function VocabularyChatPage() {
  const router = useRouter();

  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [examCounts, setExamCounts] = useState({});
  const [topicCounts, setTopicCounts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [examFilter, setExamFilter] = useState(null);
  const [topicFilter, setTopicFilter] = useState(null);
  const [levelFilter, setLevelFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedWord, setSelectedWord] = useState(null);
  const debounceRef = useRef(null);

  // Server does the filtering, sorting, and pagination — each request pulls
  // only PAGE_SIZE rows instead of the full ~7.5k-word table, so changing a
  // filter is a small targeted query instead of a full-table scan + JS filter.
  const fetchPage = useCallback(async ({ exam, topic, level, q, offset, withCounts }) => {
    const params = new URLSearchParams();
    if (exam) params.set("exam", exam);
    if (topic) params.set("topic", topic);
    if (level) params.set("level", level);
    if (q) params.set("q", q);
    params.set("offset", String(offset));
    if (withCounts) params.set("counts", "1");

    const res = await fetch(`/api/words/by-topic?${params}`);
    return res.json();
  }, []);

  // Filter/level/exam/topic changes: fresh query, replace the list. Counts
  // are only requested once on first load — they don't change per-filter.
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();

    const run = async () => {
      setIsLoading(true);
      try {
        const data = await fetchPage({
          exam: examFilter, topic: topicFilter, level: levelFilter, q, offset: 0,
          withCounts: Object.keys(examCounts).length === 0,
        });
        if (cancelled) return;
        setWords(data.words || []);
        setTotal(data.total || 0);
        if (data.examCounts) setExamCounts(data.examCounts);
        if (data.topicCounts) setTopicCounts(data.topicCounts);
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(run, q ? 300 : 0);
    return () => { cancelled = true; clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examFilter, topicFilter, levelFilter, query, fetchPage]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const data = await fetchPage({
        exam: examFilter, topic: topicFilter, level: levelFilter, q: query.trim(), offset: words.length,
      });
      setWords((prev) => [...prev, ...(data.words || [])]);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openChat = (word) => {
    const params = new URLSearchParams({ word: word.word, word_id: word.id });
    router.push(`/practice?${params}`);
  };

  const speakWord = (e, word, accent) => {
    e.stopPropagation();
    speak(word, accent);
  };

  const examOptions = EXAM_GOALS.map((g) => ({ value: g.key, label: `${g.icon} ${g.label} (${examCounts[g.key] || 0})` }));
  const topicOptions = TOPICS.map((t) => ({ value: t.key, label: `${t.icon} ${t.label} (${topicCounts[t.key] || 0})` }));
  const levelOptions = LEVELS.map((lv) => ({ value: lv, label: LEVEL_LABELS[lv] }));

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header — stacked on mobile (back button its own row, title centered
            below with nothing to collide with) since a fixed-width spacer can't
            reliably balance a variable-width back button + title on narrow real
            devices (confirmed broken on-device); one row again from md: up. */}
        <div className="mb-6">
          <div className="flex items-center justify-between md:hidden">
            <BackButton label="Quay lại" />
          </div>
          <div className="hidden md:flex md:items-center md:justify-between">
            <BackButton label="Quay lại" />
            <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              📚 Học từ mới
            </h1>
            <div className="w-20" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-center mt-3 md:hidden" style={{ color: "var(--ink)" }}>
            📚 Học từ mới
          </h1>
        </div>

        <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
          Lọc theo mục tiêu thi, chủ đề và level, rồi bấm vào một từ để xem chi tiết và trò chuyện với Alex.
        </p>

        {/* Parallel filters: exam goal + topic + level (AND) */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <Dropdown value={examFilter} onChange={setExamFilter} options={examOptions} allLabel="Mọi mục tiêu thi" />
          <Dropdown value={topicFilter} onChange={setTopicFilter} options={topicOptions} allLabel="Mọi chủ đề" />
          <Dropdown value={levelFilter} onChange={setLevelFilter} options={levelOptions} allLabel="Mọi level" />
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-soft)" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ..."
            className="w-full pl-12 pr-5 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 transition-all"
            style={{
              background: "var(--surface-elevated)",
              border: "1.5px solid var(--line)",
              color: "var(--ink)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--electric)"; e.target.style.boxShadow = "0 0 0 3px rgba(var(--electric-rgb),0.15)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--line)"; e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-soft)" }}>✕</button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <p style={{ color: "var(--ink-soft)" }}>Đang tải...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="font-semibold" style={{ color: "var(--ink-soft)" }}>Không tìm thấy từ nào với bộ lọc này</p>
          </div>
        ) : (
          <>
            <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>{total.toLocaleString()} từ</p>
            <div className="flex flex-wrap gap-2">
              {words.map((word) => (
                <button
                  key={word.id}
                  onClick={() => setSelectedWord(word)}
                  className="px-3 py-2 rounded-xl text-left transition-all hover:scale-[1.02]"
                  style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--electric)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{word.word}</span>
                    {dueRank(word) === 0 && word.user_state && <span className="text-[9px]" title="Cần ôn">🔴</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px]" style={{ color: "var(--sunshine-text)" }}>{starRating(word.frequency)}</span>
                    {word.level && (
                      <span className="text-[9px] font-bold" style={{ color: "var(--electric)" }}>{word.level}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {words.length < total && (
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="w-full mt-4 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-60"
                style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)", color: "var(--ink)" }}
              >
                {isLoadingMore ? "Đang tải..." : `Xem thêm ${Math.min(WORDS_PER_PAGE, total - words.length)} từ`}
              </button>
            )}
          </>
        )}

        {selectedWord && (
          <WordDetailModal word={selectedWord} onClose={() => setSelectedWord(null)} onChat={() => openChat(selectedWord)} onSpeak={speakWord} />
        )}
      </main>
    </>
  );
}

const ACCENTS = [
  { key: "en-US", label: "🇺🇸 US" },
  { key: "en-GB", label: "🇬🇧 UK" },
];

function WordDetailModal({ word, onClose, onChat, onSpeak }) {
  const [accent, setAccent] = useState("en-US");

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(12px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-[32px] p-5 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up relative"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        <button onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl flex items-center justify-center hover:rotate-90 transition-all"
          style={{ border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)" }}
        ><X size={16} /></button>

        <div className="text-center mb-6">
          <h1 className="font-black gradient-text-word mb-2" style={{ fontSize: "clamp(36px,7vw,56px)" }}>
            {word.word}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="italic" style={{ color: "var(--ink-soft)" }}>{word.phonetic}</span>
            )}
            {word.pos && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
                {word.pos}
              </span>
            )}
            {word.level && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--electric-border)" }}>
                {word.level}
              </span>
            )}
            <button onClick={(e) => onSpeak(e, word.word, accent)}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-all"
              style={{ background: "linear-gradient(135deg,var(--electric),var(--electric-muted))", color: "var(--on-electric)" }}>
              <Volume2 size={16} />
            </button>
          </div>

          {/* Accent toggle */}
          <div className="flex items-center justify-center gap-1.5 mb-2">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                onClick={(e) => { e.stopPropagation(); setAccent(a.key); }}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
                style={{
                  background: accent === a.key ? "var(--electric)" : "var(--surface)",
                  color: accent === a.key ? "var(--on-electric)" : "var(--ink-soft)",
                  border: accent === a.key ? "none" : "1px solid var(--line)",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>

          {word.frequency != null && (
            <p className="text-xs" style={{ color: "var(--sunshine-text)" }}>{starRating(word.frequency)}</p>
          )}
        </div>

        <div className="space-y-3">
          {word.def_en && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--electric)" }}>📖 Definition</div>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{word.def_en}</p>
            </div>
          )}

          {word.ex_en && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ocean)" }}>💬 Example</div>
              <p className="text-sm italic" style={{ color: "var(--ink-soft)" }}>&ldquo;{word.ex_en}&rdquo;</p>
            </div>
          )}

          {word.collocations?.length > 0 && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--grass-text)" }}>🔗 Collocations</div>
              <div className="flex flex-wrap gap-2">
                {word.collocations.map((c, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(word.register || word.usage_notes) && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>📝 Usage</div>
              {word.register && (
                <p className="text-sm" style={{ color: "var(--ink)" }}>Register: <span className="font-semibold capitalize">{word.register}</span></p>
              )}
              {word.usage_notes && (
                <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{word.usage_notes}</p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onChat}
          className="w-full mt-5 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 4px 20px rgba(var(--electric-rgb),0.3)" }}
        >
          <MessageCircle size={16} /> Chat với Alex về từ này
        </button>
      </div>
    </div>
  );
}
