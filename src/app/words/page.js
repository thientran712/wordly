"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Volume2 } from "lucide-react";

const STATE_CONFIG = {
  learning:   { label: "Learning",  bg: "#FFF1F8", border: "#FFD0E2", color: "#FF5C8A", emoji: "🌱" },
  review:     { label: "Review",    bg: "#F0EDFC", border: "#DCC9FF", color: "#6C5CE7", emoji: "🌿" },
  relearning: { label: "Relearning",bg: "#FFE9A8", border: "#FFD75A", color: "#8B5500", emoji: "🔁" },
};

export default function WordsPage() {
  const router = useRouter();
  const [tab, setTab] = useState("learned");
  const [query, setQuery] = useState("");
  const [words, setWords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedWord, setSelectedWord] = useState(null);

  const fetchWords = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ tab, q: query });
      const res = await fetch(`/api/words/search?${params}`);
      const data = await res.json();
      if (data.words) setWords(data.words);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [tab, query]);

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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/50 transition-all"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">
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
              onClick={() => { setTab(t.value); setQuery(""); }}
              className="px-5 py-2.5 rounded-full font-bold text-sm transition-all"
              style={{
                background: tab === t.value ? "#FF5C8A" : "white",
                color: tab === t.value ? "white" : "var(--ink-soft)",
                boxShadow: tab === t.value ? "0 4px 12px rgba(255,92,138,0.25)" : "none",
                border: tab === t.value ? "none" : "2px solid var(--line)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[--ink-soft]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tab === "learned" ? "Tìm trong từ đã học..." : "Tìm trong yêu thích..."}
            className="w-full pl-12 pr-5 py-3 bg-white border-2 border-white rounded-2xl text-sm font-medium focus:outline-none focus:border-[--electric] focus:ring-4 focus:ring-purple-100 transition-all"
            style={{ boxShadow: "0 4px 16px rgba(108,92,231,0.07)" }}
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-[--ink-soft]">✕</button>
          )}
        </div>

        {/* Count */}
        {!isLoading && (
          <p className="text-sm text-[--ink-soft] mb-4">
            <span className="font-bold text-[--ink]">{words.length}</span> từ
            {query && <> · kết quả cho "<span className="font-bold">{query}</span>"</>}
          </p>
        )}

        {/* Word list */}
        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3 animate-bounce-soft">📖</div>
            <p className="text-[--ink-soft]">Đang tải...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">{tab === "bookmarked" ? "💔" : "📭"}</div>
            <p className="text-[--ink-soft] font-semibold">
              {tab === "bookmarked"
                ? "Chưa có từ yêu thích nào"
                : "Chưa học từ nào cả"}
            </p>
            <p className="text-sm text-[--ink-soft] mt-1">
              {tab === "bookmarked"
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
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 bg-white rounded-2xl border-2 border-[--line] hover:border-[--electric] hover:scale-[1.01] transition-all flex items-center gap-3"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-serif font-bold text-lg">{word.word}</span>
          {word.is_bookmarked && <span className="text-sm">💖</span>}
        </div>
        {word.phonetic && !word.phonetic.endsWith(".mp3") && (
          <p className="text-xs text-[--ink-soft] italic">{word.phonetic}</p>
        )}
        <p className="text-xs text-[--ink-soft] truncate mt-0.5">{word.def_en}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className="px-2 py-0.5 rounded-full text-[10px] font-bold"
          style={{ background: state.bg, color: state.color }}
        >
          {state.emoji} {state.label}
        </span>
        {word.level && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "#DCC9FF", color: "#5B3FBC" }}>
            {word.level}
          </span>
        )}
        <button
          onClick={e => onSpeak(e, word.word)}
          className="w-8 h-8 rounded-full bg-[--whisper] flex items-center justify-center text-[--electric] hover:bg-[--lavender] transition-all"
        >
          <Volume2 size={14} />
        </button>
      </div>
    </button>
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
      style={{ background: "rgba(45,27,78,0.4)", backdropFilter: "blur(12px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-[32px] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up relative"
        style={{ boxShadow: "0 20px 48px rgba(45,27,78,0.18)" }}
      >
        <button onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl border-2 border-[--line] bg-white cursor-pointer flex items-center justify-center hover:bg-[--pink] hover:rotate-90 transition-all text-[--ink-soft]"
        >✕</button>

        <div className="text-center mb-6">
          <h1 className="font-serif font-black gradient-text-word mb-2"
            style={{ fontSize: "clamp(40px,8vw,64px)" }}>
            {word.word}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="font-serif italic text-[--ink-soft]">{word.phonetic}</span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
              style={{ background: "#B8F3D2", color: "#00754C" }}>
              {word.pos}
            </span>
            {word.level && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                style={{ background: "#DCC9FF", color: "#5B3FBC" }}>
                {word.level}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: state.bg, color: state.color }}>
              {state.emoji} {state.label}
            </span>
            <button onClick={speakWord}
              className="w-10 h-10 rounded-full text-white flex items-center justify-center hover:scale-110 transition-all"
              style={{ background: "linear-gradient(135deg,#6C5CE7,#FF5C8A)" }}>
              <Volume2 size={16} />
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="p-4 rounded-2xl border-2"
            style={{ background: "linear-gradient(135deg,#FFF1F8,#FFE8F0)", borderColor: "#FFD0E2" }}>
            <div className="text-xs font-bold uppercase tracking-widest mb-1 text-[--hot-pink]">📖 Definition</div>
            <p className="text-sm font-medium">{word.def_en}</p>
          </div>

          {word.ex_en && (
            <div className="p-4 rounded-2xl border-2"
              style={{ background: "linear-gradient(135deg,#F0F9FF,#E8F4FE)", borderColor: "#C9E5FB" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1 text-[--ocean]">💬 Example</div>
              <p className="text-sm italic">"{word.ex_en}"</p>
            </div>
          )}

          {word.synonyms?.length > 0 && (
            <div className="p-4 rounded-2xl border-2"
              style={{ background: "linear-gradient(135deg,#F0FFF4,#E0FBE8)", borderColor: "#B8E8C9" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[--grass]">✨ Synonyms</div>
              <div className="flex flex-wrap gap-2">
                {word.synonyms.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-white border-2 rounded-full text-xs font-semibold text-[--grass]"
                    style={{ borderColor: "#B8E8C9" }}>
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
