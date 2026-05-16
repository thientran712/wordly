"use client";

import { useState, useEffect } from "react";
import { Volume2, RotateCcw, Frown, Smile, Zap, Sparkles } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Again", icon: RotateCcw, desc: "<10m", color: "#E5405E", bg: "#FFF0F3", border: "#FFCCD6", hoverShadow: "rgba(229,64,94,0.25)" },
  { rating: 2, label: "Hard",  icon: Frown,     desc: "<1d",  color: "#E06030", bg: "#FFF3EE", border: "#FECDB8", hoverShadow: "rgba(224,96,48,0.25)" },
  { rating: 3, label: "Good",  icon: Smile,     desc: "~3d",  color: "#059669", bg: "#F0FDF8", border: "#A7F3D0", hoverShadow: "rgba(5,150,105,0.25)" },
  { rating: 4, label: "Easy",  icon: Zap,       desc: "~7d",  color: "#6C5CE7", bg: "#F5F3FF", border: "#C4B5FD", hoverShadow: "rgba(108,92,231,0.25)" },
];

const CONTEXT_ICONS = { love: "💕", life: "🌿", work: "💼" };

export default function WordCard({ word, currentIndex, isBookmarked, onBookmark, onRate, progress, source, skillLevel, learningGoal }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [aiContent, setAiContent] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  // Fetch AI content whenever the word changes
  useEffect(() => {
    if (!word?.id) return;
    setAiContent(null);
    setIsLoadingAI(true);

    fetch("/api/ai/word-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        word_id: word.id,
        word: word.word,
        pos: word.pos,
        word_level: word.level,
        skill_level: skillLevel || "B1",
        learning_goal: learningGoal || "daily",
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.content) setAiContent(data.content); })
      .catch(() => {})
      .finally(() => setIsLoadingAI(false));
  }, [word?.id]);

  const speakWord = () => {
    if ("speechSynthesis" in window) {
      setIsPlaying(true);
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = "en-US"; u.rate = 0.85;
      u.onend = () => setIsPlaying(false);
      speechSynthesis.speak(u);
    }
  };

  const handleRate = async (rating) => {
    if (isRating) return;
    setIsRating(true);
    try { await onRate(rating); }
    finally { setTimeout(() => setIsRating(false), 500); }
  };

  const isReview = source === "review";

  return (
    <div
      className="bg-white rounded-3xl border border-[--line] overflow-hidden mb-3 animate-fade-in"
      style={{ boxShadow: "0 8px 32px rgba(45,27,78,0.08)" }}
      key={currentIndex}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-6 lg:px-8 pt-5 pb-4 border-b border-[--line]">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs"
          style={{ background: isReview ? "linear-gradient(135deg,#FFE9A8,#FFD0E2)" : "linear-gradient(135deg,#DCC9FF,#FFC1D8)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[--hot-pink] flex-shrink-0" />
          {isReview ? `🔄 Review · ${formatStability(progress?.stability)}` : "✨ New word"}
        </span>
        <button
          onClick={onBookmark}
          className={`w-9 h-9 rounded-xl border-2 cursor-pointer flex items-center justify-center text-base transition-all duration-150 hover:scale-110 ${
            isBookmarked
              ? "bg-[--butter] border-[--sunshine] shadow-[0_4px_12px_rgba(255,182,39,0.3)]"
              : "bg-[--whisper] border-[--line] hover:bg-[--butter] hover:border-[--sunshine]"
          }`}
        >
          {isBookmarked ? "💖" : "🤍"}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex">

        {/* LEFT */}
        <div className="flex-1 min-w-0 px-6 lg:px-8 py-6">

          {/* Word */}
          <h1
            className="font-serif font-black leading-none tracking-tight gradient-text-word mb-4"
            style={{ fontSize: "clamp(42px, 5vw, 80px)" }}
          >
            {word.word}
          </h1>

          {/* Phonetic + badges + audio */}
          <div className="flex flex-wrap items-center gap-2.5 mb-6">
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="font-serif italic text-lg text-[--ink-soft]">{word.phonetic}</span>
            )}
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="text-[--line] select-none">·</span>
            )}
            <span className="px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider"
              style={{ background: "#ECFDF5", color: "#059669", border: "1.5px solid #A7F3D0" }}>
              {word.pos}
            </span>
            {word.level && (
              <span className="px-3 py-1 rounded-full font-bold text-xs uppercase tracking-wider"
                style={{ background: "#F5F3FF", color: "#6C5CE7", border: "1.5px solid #C4B5FD" }}>
                {word.level}
              </span>
            )}
            <button
              onClick={speakWord}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white hover:scale-110 hover:shadow-lg"
              style={{
                background: "linear-gradient(135deg,#6C5CE7,#FF5C8A)",
                boxShadow: isPlaying ? "0 0 0 3px rgba(108,92,231,0.35)" : "0 2px 8px rgba(108,92,231,0.3)",
                opacity: isPlaying ? 0.75 : 1,
              }}
              title="Nghe phát âm"
            >
              <Volume2 size={14} />
            </button>
          </div>

          {/* Definition */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--hot-pink] mb-2">📖 Definition</p>
            <p className="text-lg lg:text-xl leading-relaxed text-[--ink] font-medium">{word.def_en}</p>
          </div>

          {word.ex_en && <div className="h-px bg-[--line] mb-5" />}

          {/* Example */}
          {word.ex_en && (
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--ocean] mb-2">💬 Example</p>
              <p className="text-lg lg:text-xl leading-relaxed text-[--ink-soft] italic">"{word.ex_en}"</p>
            </div>
          )}

          {/* Synonyms */}
          {word.synonyms?.length > 0 && (
            <>
              <div className="h-px bg-[--line] mb-4" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--grass]">✨ Also</span>
                {word.synonyms.slice(0, 6).map((s, i) => (
                  <span key={i}
                    className="px-2.5 py-1 rounded-full text-sm font-semibold cursor-default hover:scale-105"
                    style={{ background: "#F0FDF4", color: "#059669", border: "1.5px solid #A7F3D0" }}>
                    {s}
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── AI Content ── */}
          {(isLoadingAI || aiContent) && (
            <div className="mt-5 pt-5 border-t border-[--line]">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"
                style={{ color: "#6C5CE7" }}>
                <Sparkles size={11} />
                AI Examples
              </p>

              {isLoadingAI ? (
                <AILoadingSkeleton />
              ) : (
                <>
                  {/* 3 examples */}
                  <div className="space-y-2.5 mb-4">
                    {aiContent.examples.map((ex, i) => (
                      <div key={i} className="flex gap-2.5 items-start">
                        <span className="text-base leading-none mt-0.5 flex-shrink-0">
                          {CONTEXT_ICONS[ex.context] || "•"}
                        </span>
                        <p className="text-sm lg:text-base leading-relaxed text-[--ink-soft] italic">
                          "{ex.sentence}"
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Paragraph */}
                  {aiContent.paragraph && (
                    <>
                      <div className="h-px bg-[--line] mb-3" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--ink-soft] mb-2">
                        📝 In a story
                      </p>
                      <p className="text-sm lg:text-base leading-relaxed text-[--ink]">
                        {aiContent.paragraph}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Mobile rating */}
          <div className="sm:hidden mt-6 pt-5 border-t border-[--line]">
            <p className="text-xs font-semibold text-[--ink-soft] mb-3 text-center">How well did you know this?</p>
            <div className="grid grid-cols-4 gap-2">
              {RATINGS.map(r => (
                <button
                  key={r.rating}
                  onClick={() => handleRate(r.rating)}
                  disabled={isRating}
                  className="py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95"
                  style={{
                    background: r.bg,
                    borderColor: hovered === `m${r.rating}` ? r.color : r.border,
                    color: r.color,
                    boxShadow: hovered === `m${r.rating}` ? `0 4px 16px ${r.hoverShadow}` : "none",
                    transform: hovered === `m${r.rating}` ? "translateY(-2px)" : "none",
                  }}
                  onMouseEnter={() => setHovered(`m${r.rating}`)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <r.icon size={14} />
                  <span>{r.label}</span>
                  <span className="text-[10px] opacity-55 font-normal">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — desktop */}
        <div className="hidden sm:flex flex-col w-[140px] lg:w-[160px] flex-shrink-0 border-l border-[--line]">
          <div className="flex flex-col flex-1 p-3 gap-2 justify-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[--ink-soft] text-center mb-1">
              Nhớ chưa?
            </p>
            {RATINGS.map(r => (
              <button
                key={r.rating}
                onClick={() => handleRate(r.rating)}
                disabled={isRating}
                onMouseEnter={() => setHovered(r.rating)}
                onMouseLeave={() => setHovered(null)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 font-semibold text-sm cursor-pointer disabled:opacity-50"
                style={{
                  background: r.bg,
                  borderColor: hovered === r.rating ? r.color : r.border,
                  color: r.color,
                  boxShadow: hovered === r.rating ? `0 6px 20px ${r.hoverShadow}` : "none",
                  transform: hovered === r.rating ? "translateY(-2px) scale(1.02)" : "none",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <r.icon size={14} />
                  <span>{r.label}</span>
                </div>
                <span className="text-[10px] opacity-50 font-normal tabular-nums">{r.desc}</span>
              </button>
            ))}
            <p className="text-[9px] text-center text-[--ink-soft] opacity-30 mt-1 tracking-widest">
              1 · 2 · 3 · 4
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AILoadingSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      {[90, 75, 85].map((w, i) => (
        <div key={i} className="flex gap-2.5 items-start">
          <div className="w-5 h-5 rounded-full bg-[--line] flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-[--line] rounded-full" style={{ width: `${w}%` }} />
            <div className="h-3 bg-[--line] rounded-full" style={{ width: `${w - 20}%` }} />
          </div>
        </div>
      ))}
      <div className="mt-4 pt-3 border-t border-[--line] space-y-1.5">
        <div className="h-3 bg-[--line] rounded-full w-full" />
        <div className="h-3 bg-[--line] rounded-full w-5/6" />
        <div className="h-3 bg-[--line] rounded-full w-4/6" />
      </div>
    </div>
  );
}

function formatStability(days) {
  if (!days || days < 1) return "new";
  if (days < 7) return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}
