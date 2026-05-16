"use client";

import { useState, useEffect } from "react";
import { Volume2, RotateCcw, Frown, Smile, Zap, EyeOff } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Again", icon: RotateCcw, desc: "<10m", color: "#E5405E", bg: "#FFF0F3", border: "#FFCCD6", hoverShadow: "rgba(229,64,94,0.25)" },
  { rating: 2, label: "Hard",  icon: Frown,     desc: "<1d",  color: "#E06030", bg: "#FFF3EE", border: "#FECDB8", hoverShadow: "rgba(224,96,48,0.25)" },
  { rating: 3, label: "Good",  icon: Smile,     desc: "~3d",  color: "#059669", bg: "#F0FDF8", border: "#A7F3D0", hoverShadow: "rgba(5,150,105,0.25)" },
  { rating: 4, label: "Easy",  icon: Zap,       desc: "~7d",  color: "#6C5CE7", bg: "#F5F3FF", border: "#C4B5FD", hoverShadow: "rgba(108,92,231,0.25)" },
];

const CONTEXT_ICONS = { love: "💕", life: "🌿", work: "💼" };

const LOADING_MESSAGES = [
  "✨ AI đang giải thích từ này...",
  "🧠 Đang tra từ điển thông minh...",
  "📖 Đang tìm nghĩa hay nhất cho bạn...",
  "🔍 AI đang phân tích từ vựng...",
  "💡 Đang tạo ví dụ thực tế...",
  "🌟 Sắp có rồi, chờ xíu nhé...",
];

export default function WordCard({ word, currentIndex, isBookmarked, onBookmark, onRate, progress, source, skillLevel, learningGoal }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [aiContent, setAiContent] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

  // Fetch AI content whenever the word changes
  useEffect(() => {
    if (!word?.id) return;
    setAiContent(null);
    setIsLoadingAI(true);
    setLoadingMsg(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]);

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
      className="bg-white rounded-3xl border border-[--line] overflow-clip mb-3 animate-fade-in"
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

          {/* Badges + audio */}
          <div className="flex flex-wrap items-center gap-2.5 mb-6">
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

          {/* ── AI Content: meanings + examples + paragraph ── */}
          {isLoadingAI ? (
            <AILoadingSkeleton message={loadingMsg} />
          ) : aiContent?.meanings?.length > 0 ? (
            <>
              {/* Meaning count header */}
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--hot-pink] mb-3">
                📖 {aiContent.meanings.length} nghĩa phổ biến
              </p>

              {/* Meanings */}
              <div className="mb-5 space-y-3">
                {aiContent.meanings.map((m, i) => (
                  <div key={i}
                    className="rounded-2xl px-4 py-3.5 border border-[--line]"
                    style={{ background: i === 0 ? "#FAFBFF" : "#FEFEFE" }}
                  >
                    {/* POS badge + phonetic + number */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-black text-[--ink-soft] opacity-40">
                        {i + 1}
                      </span>
                      <span className="px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider"
                        style={{ background: "#ECFDF5", color: "#059669", border: "1.5px solid #A7F3D0" }}>
                        {m.pos}
                      </span>
                      {m.phonetic_ipa && (
                        <span className="flex items-center gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-wider opacity-40 text-[--ink-soft]">🇺🇸 IPA</span>
                          <span className="font-serif italic text-sm text-[--ink-soft]">{m.phonetic_ipa}</span>
                        </span>
                      )}
                    </div>
                    {m.memory_vi && (
                      <div className="rounded-xl px-3 py-2.5 mb-2"
                        style={{ background: "linear-gradient(135deg,#FFFBEB,#FFF3E0)", border: "1.5px solid #FDE68A" }}>
                        <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#D97706" }}>
                          💡 Mẹo nhớ
                        </p>
                        <p className="text-sm leading-relaxed" style={{ color: "#92400E" }}>
                          {m.memory_vi}
                        </p>
                      </div>
                    )}

                    {/* EN definition */}
                    <p className="text-base lg:text-lg font-semibold text-[--ink] leading-snug mb-1">
                      {m.definition_en}
                    </p>

                    {/* VI definition */}
                    {m.definition_vi && (
                      <p className="text-sm text-[--ink-soft] mb-2.5">
                        🇻🇳 {m.definition_vi}
                      </p>
                    )}

                    {/* 3 examples per meaning */}
                    {m.examples?.length > 0 && (
                      <div className="mt-2.5 space-y-2">
                        {m.examples.map((ex, j) => (
                          <div key={j} className="flex gap-2 items-start">
                            <span className="flex-shrink-0 text-sm leading-snug mt-0.5">
                              {CONTEXT_ICONS[ex.context] || "•"}
                            </span>
                            <p className="text-sm leading-relaxed text-[--ink-soft] italic">
                              "{ex.sentence}"
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </>
          ) : (
            /* Fallback nếu AI lỗi */
            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--hot-pink] mb-2">📖 Definition</p>
              <p className="text-lg lg:text-xl leading-relaxed text-[--ink] font-medium">{word.def_en}</p>
            </div>
          )}

          {/* Synonyms — AI generated */}
          {!isLoadingAI && (
            <>
              <div className="h-px bg-[--line] mt-4 mb-4" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[--grass]">✨ Also</span>
                {aiContent?.synonyms?.length > 0 ? (
                  aiContent.synonyms.map((s, i) => (
                    <span key={i}
                      className="px-2.5 py-1 rounded-full text-sm font-semibold cursor-default hover:scale-105 transition-transform"
                      style={{ background: "#F0FDF4", color: "#059669", border: "1.5px solid #A7F3D0" }}>
                      {s}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[--ink-soft] italic">Không có từ đồng nghĩa</span>
                )}
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
            <button
              onClick={() => handleRate(0)}
              disabled={isRating}
              className="mt-3 w-full py-2.5 rounded-xl border border-gray-200 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 hover:bg-gray-50 active:scale-95"
              style={{ color: "#9CA3AF" }}
            >
              <EyeOff size={12} />
              Không cần nhắc lại từ này
            </button>
          </div>
        </div>

        {/* RIGHT — desktop, sticky so ratings stay at top regardless of content length */}
        <div className="hidden sm:flex flex-col w-[140px] lg:w-[160px] flex-shrink-0 border-l border-[--line]">
          <div className="sticky top-4 flex flex-col p-3 gap-2">
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
            <div className="border-t border-[--line] mt-2 pt-2">
              <button
                onClick={() => handleRate(0)}
                disabled={isRating}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-medium cursor-pointer disabled:opacity-50 transition-all hover:bg-gray-50"
                style={{ color: "#9CA3AF" }}
              >
                <EyeOff size={11} />
                Bỏ qua mãi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AILoadingSkeleton({ message }) {
  return (
    <div className="py-1">
      {/* Loading message */}
      <p className="text-sm font-semibold mb-5" style={{ color: "#6C5CE7" }}>
        {message}
      </p>

      {/* Shimmer skeleton — 2 meanings */}
      <div className="animate-pulse space-y-5">
        {[
          { w1: "75%", w2: "60%", w3: "88%", w4: "70%", w5: "55%" },
          { w1: "82%", w2: "55%", w3: "78%", w4: "65%", w5: "80%" },
        ].map((ws, i) => (
          <div key={i} className="space-y-2.5">
            {/* POS badge */}
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-200" />
              <div className="h-4 w-16 rounded-full bg-gray-200" />
            </div>
            {/* EN definition */}
            <div className="h-4 rounded-full bg-gray-200" style={{ width: ws.w1 }} />
            <div className="h-4 rounded-full bg-gray-100" style={{ width: ws.w2 }} />
            {/* VI definition */}
            <div className="h-3 rounded-full bg-gray-100" style={{ width: ws.w3 }} />
            {/* Examples */}
            <div className="pl-1 space-y-1.5 pt-1">
              <div className="h-3 rounded-full bg-gray-100" style={{ width: ws.w4 }} />
              <div className="h-3 rounded-full bg-gray-100" style={{ width: ws.w5 }} />
              <div className="h-3 rounded-full bg-gray-100" style={{ width: ws.w1 }} />
            </div>
          </div>
        ))}
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
