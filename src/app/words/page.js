"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Volume2 } from "lucide-react";

const STATE_CONFIG = {
  learning:   { label: "Đang học",   bg: "var(--error-soft)",     border: "var(--error-border)",      color: "var(--error)",        emoji: "🌱" },
  review:     { label: "Ôn tập",     bg: "var(--green-subtle)",   border: "var(--green-subtle-border)", color: "var(--electric)",     emoji: "🌿" },
  relearning: { label: "Học lại",    bg: "var(--sunshine-soft)",  border: "var(--sunshine-border)",   color: "var(--sunshine-text)", emoji: "🔁" },
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

function formatLearnedDate(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays < 7) return `${diffDays} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} tháng trước`;
  return `${Math.floor(diffDays / 365)} năm trước`;
}

export default function WordsPage() {
  const router = useRouter();
  const [tab, setTab] = useState("learned");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [words, setWords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWord, setSelectedWord] = useState(null);

  const fetchWords = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ tab, q: query, level });
      const res = await fetch(`/api/words/search?${params}`);
      const data = await res.json();
      if (data.words) setWords(data.words);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [tab, query, level]);

  useEffect(() => {
    const timer = setTimeout(fetchWords, 300);
    return () => clearTimeout(timer);
  }, [fetchWords]);

  const speakWord = (e, word) => {
    e.stopPropagation();
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.85;
      speechSynthesis.speak(u);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setLevel("");
  };

  const hasActiveFilters = query || level;

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full hover:-translate-y-0.5 hover:shadow-sm transition-all"
            style={{ color: "var(--ink-soft)", background: "var(--surface-elevated)", border: "1px solid var(--line)" }}
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Quay lại</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            📖 My Words
          </h1>
          <div className="w-20" />
        </div>

        {/* Tabs */}
        <div className="flex gap-3 mb-5">
          {[
            { value: "learned", label: "📚 Đã học" },
            { value: "bookmarked", label: "💖 Yêu thích" },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); resetFilters(); }}
              className="px-5 py-2.5 rounded-full font-bold text-sm hover:-translate-y-0.5 transition-all"
              style={{
                background: tab === t.value ? "var(--electric)" : "var(--surface-elevated)",
                color: tab === t.value ? "#0A0A0A" : "var(--ink-soft)",
                boxShadow: tab === t.value ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                border: tab === t.value ? "none" : "1.5px solid var(--line)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-soft)" }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === "learned" ? "Tìm trong từ đã học..." : "Tìm trong yêu thích..."}
            className="w-full pl-12 pr-5 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 transition-all"
            style={{
              background: "var(--surface-elevated)",
              border: "1.5px solid var(--line)",
              color: "var(--ink)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
            onFocus={e => { e.target.style.borderColor = "var(--electric)"; e.target.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.15)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--line)"; e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2"
              style={{ color: "var(--ink-soft)" }}
            >✕</button>
          )}
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setLevel("")}
            className="px-3 py-1.5 rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all"
            style={{
              background: level === "" ? "var(--electric)" : "var(--surface-elevated)",
              color: level === "" ? "#0A0A0A" : "var(--ink-soft)",
              border: level === "" ? "none" : "1.5px solid var(--line)",
            }}
          >
            Tất cả
          </button>
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setLevel(level === l ? "" : l)}
              className="px-3 py-1.5 rounded-full text-xs font-bold hover:-translate-y-0.5 transition-all"
              style={{
                background: level === l ? "rgba(34,197,94,0.15)" : "var(--surface-elevated)",
                color: level === l ? "var(--electric)" : "var(--ink-soft)",
                border: level === l ? "1.5px solid var(--electric-border)" : "1.5px solid var(--line)",
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Count */}
        {!isLoading && (
          <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
            <span className="font-bold" style={{ color: "var(--ink)" }}>{words.length}</span> từ
            {hasActiveFilters && (
              <>
                {" "}·{" "}
                <button onClick={resetFilters} className="font-semibold hover:underline" style={{ color: "var(--electric)" }}>
                  Xoá filter
                </button>
              </>
            )}
          </p>
        )}

        {/* Word list */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📖</div>
            <p style={{ color: "var(--ink-soft)" }}>Đang tải...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{hasActiveFilters ? "🔍" : tab === "bookmarked" ? "💔" : "📭"}</div>
            <p className="font-semibold" style={{ color: "var(--ink-soft)" }}>
              {hasActiveFilters
                ? "Không tìm thấy từ nào"
                : tab === "bookmarked"
                ? "Chưa có từ yêu thích nào"
                : "Chưa học từ nào cả"}
            </p>
            <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
              {hasActiveFilters
                ? <button onClick={resetFilters} className="font-semibold hover:underline" style={{ color: "var(--electric)" }}>Xoá filter</button>
                : tab === "bookmarked"
                ? "Nhấn 💖 khi học để lưu từ yêu thích"
                : "Bắt đầu học để từ hiện ra ở đây!"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {words.map(word => (
              <WordRow
                key={word.id}
                word={word}
                onClick={() => setSelectedWord(word)}
                onSpeak={speakWord}
              />
            ))}
          </div>
        )}

        {selectedWord && (
          <WordDetailModal word={selectedWord} onClose={() => setSelectedWord(null)} />
        )}
      </main>
    </>
  );
}

function WordRow({ word, onClick, onSpeak }) {
  const state = STATE_CONFIG[word.user_state] || STATE_CONFIG.learning;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="w-full text-left px-4 py-3.5 rounded-2xl flex items-center gap-3 cursor-pointer transition-all hover:scale-[1.01]"
      style={{
        background: "var(--surface-elevated)",
        border: "1.5px solid var(--line)",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--electric)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(34,197,94,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-lg" style={{ color: "var(--ink)" }}>{word.word}</span>
          {word.is_bookmarked && <span className="text-sm">💖</span>}
        </div>
        {word.phonetic && !word.phonetic.endsWith(".mp3") && (
          <p className="text-xs italic" style={{ color: "var(--ink-soft)" }}>{word.phonetic}</p>
        )}
        <p className="text-xs truncate mt-0.5" style={{ color: "var(--ink-soft)" }}>{word.def_en}</p>
      </div>

      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: state.bg, color: state.color }}
          >
            {state.emoji} {state.label}
          </span>
          {word.level && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "rgba(34,197,94,0.12)", color: "var(--electric)", border: "1px solid var(--electric-border)" }}>
              {word.level}
            </span>
          )}
          <button
            onClick={e => onSpeak(e, word.word)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-all"
            style={{ background: "rgba(34,197,94,0.1)", color: "var(--electric)", border: "1px solid var(--electric-border)" }}
          >
            <Volume2 size={14} />
          </button>
        </div>
        {word.learned_at && (
          <span className="text-[10px]" style={{ color: "var(--ink-ghost)" }}>
            🗓 {formatLearnedDate(word.learned_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function WordDetailModal({ word, onClose }) {
  const speakWord = () => {
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = "en-US";
      u.rate = 0.85;
      speechSynthesis.speak(u);
    }
  };

  const state = STATE_CONFIG[word.user_state] || STATE_CONFIG.learning;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-[32px] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up relative"
        style={{
          background: "var(--surface-elevated)",
          border: "1.5px solid var(--line)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
        }}
      >
        <button onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl flex items-center justify-center hover:rotate-90 transition-all"
          style={{ border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)" }}
        >✕</button>

        <div className="text-center mb-6">
          <h1 className="font-serif font-black gradient-text-word mb-2"
            style={{ fontSize: "clamp(40px,8vw,64px)" }}>
            {word.word}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="font-serif italic" style={{ color: "var(--ink-soft)" }}>{word.phonetic}</span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
              style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
              {word.pos}
            </span>
            {word.level && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                style={{ background: "rgba(34,197,94,0.12)", color: "var(--electric)", border: "1px solid var(--electric-border)" }}>
                {word.level}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: state.bg, color: state.color }}>
              {state.emoji} {state.label}
            </span>
            <button onClick={speakWord}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center hover:scale-110 transition-all"
              style={{ background: "linear-gradient(135deg,#22C55E,#16A34A)" }}>
              <Volume2 size={16} />
            </button>
          </div>
          {word.learned_at && (
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              🗓 Bắt đầu học {formatLearnedDate(word.learned_at)}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-2xl"
            style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--electric)" }}>📖 Definition</div>
            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{word.def_en}</p>
          </div>

          {word.ex_en && (
            <div className="p-4 rounded-2xl"
              style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ocean)" }}>💬 Example</div>
              <p className="text-sm italic" style={{ color: "var(--ink-soft)" }}>"{word.ex_en}"</p>
            </div>
          )}

          {word.synonyms?.length > 0 && (
            <div className="p-4 rounded-2xl"
              style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--grass-text)" }}>✨ Synonyms</div>
              <div className="flex flex-wrap gap-2">
                {word.synonyms.map((s, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
