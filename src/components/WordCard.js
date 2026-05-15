"use client";

import { useState } from "react";
import { Volume2, RotateCcw, Frown, Smile, Zap } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Again", icon: RotateCcw, desc: "<10m", color: "#E5405E", bg: "#FFF0F3", border: "#FFCCD6", hoverShadow: "rgba(229,64,94,0.25)" },
  { rating: 2, label: "Hard",  icon: Frown,     desc: "<1d",  color: "#E06030", bg: "#FFF3EE", border: "#FECDB8", hoverShadow: "rgba(224,96,48,0.25)" },
  { rating: 3, label: "Good",  icon: Smile,     desc: "~3d",  color: "#059669", bg: "#F0FDF8", border: "#A7F3D0", hoverShadow: "rgba(5,150,105,0.25)" },
  { rating: 4, label: "Easy",  icon: Zap,       desc: "~7d",  color: "#6C5CE7", bg: "#F5F3FF", border: "#C4B5FD", hoverShadow: "rgba(108,92,231,0.25)" },
];

export default function WordCard({ word, currentIndex, isBookmarked, onBookmark, onRate, progress, source }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [hovered, setHovered] = useState(null);

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

          {/* Phonetic + badges */}
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
            {/* Audio on mobile */}
            <button
              onClick={speakWord}
              className="sm:hidden w-9 h-9 rounded-full flex items-center justify-center text-white active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg,#6C5CE7,#FF5C8A)", boxShadow: "0 4px 12px rgba(108,92,231,0.35)" }}
            >
              <Volume2 size={15} />
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
                    className="px-2.5 py-1 rounded-full text-sm font-semibold transition-all duration-150 cursor-default hover:scale-105"
                    style={{ background: "#F0FDF4", color: "#059669", border: "1.5px solid #A7F3D0" }}>
                    {s}
                  </span>
                ))}
              </div>
            </>
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
                  className="py-3 rounded-xl border-2 font-bold text-xs flex flex-col items-center gap-1 cursor-pointer disabled:opacity-50 active:scale-95 transition-all duration-150"
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

          {/* Listen */}
          <button
            onClick={speakWord}
            onMouseEnter={() => setHovered("listen")}
            onMouseLeave={() => setHovered(null)}
            className="flex flex-col items-center justify-center gap-2 py-6 text-white font-bold text-sm cursor-pointer border-b border-[--line] transition-all duration-150"
            style={{
              background: "linear-gradient(160deg,#6C5CE7,#FF5C8A)",
              opacity: hovered === "listen" ? 0.88 : 1,
              transform: hovered === "listen" ? "scale(1.02)" : "scale(1)",
            }}
          >
            <Volume2 size={22} strokeWidth={2} className={isPlaying ? "opacity-60" : ""} />
            <span>{isPlaying ? "Playing…" : "Listen"}</span>
          </button>

          {/* Ratings */}
          <div className="flex flex-col flex-1 p-3 gap-2">
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
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 font-semibold text-sm cursor-pointer disabled:opacity-50 transition-all duration-150"
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

function formatStability(days) {
  if (!days || days < 1) return "new";
  if (days < 7) return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}
