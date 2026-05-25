"use client";

import { useState, useEffect } from "react";
import { Volume2, RotateCcw, Frown, Smile, Zap, EyeOff, Bookmark, BookmarkCheck } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Again", icon: RotateCcw, desc: "<10m", color: "var(--error)",      bg: "var(--error-soft)",   border: "var(--error-border)",   hoverBg: "rgba(248,113,113,0.2)" },
  { rating: 2, label: "Hard",  icon: Frown,     desc: "<1d",  color: "var(--coral)",       bg: "var(--coral-soft)",   border: "var(--coral-border)",   hoverBg: "rgba(255,107,71,0.2)" },
  { rating: 3, label: "Good",  icon: Smile,     desc: "~3d",  color: "var(--grass-text)",  bg: "var(--grass-soft)",   border: "var(--grass-border)",   hoverBg: "rgba(52,211,153,0.2)" },
  { rating: 4, label: "Easy",  icon: Zap,       desc: "~7d",  color: "var(--electric)",    bg: "var(--electric-border)", border: "var(--electric-border)", hoverBg: "rgba(139,127,255,0.2)" },
];

const CONTEXT_ICONS = { love: "💕", life: "🌿", work: "💼" };

const LOADING_MESSAGES = [
  "✨ AI đang giải thích từ này...",
  "🧠 Đang tra từ điển thông minh...",
  "📖 Đang tìm nghĩa hay nhất...",
  "🔍 AI đang phân tích từ vựng...",
  "💡 Đang tạo ví dụ thực tế...",
];

export default function WordCard({ word, currentIndex, isBookmarked, onBookmark, onRate, progress, source, skillLevel, learningGoal }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRating, setIsRating] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [aiContent, setAiContent] = useState(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);

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
    if (word.audio_url) {
      const audio = new Audio(word.audio_url);
      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => setIsPlaying(false);
      audio.onerror = () => { setIsPlaying(false); speakWithTTS(); };
      audio.play().catch(() => { setIsPlaying(false); speakWithTTS(); });
      return;
    }
    speakWithTTS();
  };

  const speakWithTTS = () => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const speak = () => {
      const voices = speechSynthesis.getVoices();
      const preferred =
        voices.find(v => v.name === "Google US English") ||
        voices.find(v => v.lang === "en-US" && !v.localService) ||
        voices.find(v => v.lang === "en-US") || null;
      const u = new SpeechSynthesisUtterance(word.word);
      u.lang = "en-US"; u.rate = 0.9;
      if (preferred) u.voice = preferred;
      u.onstart = () => setIsPlaying(true);
      u.onend = () => setIsPlaying(false);
      u.onerror = () => setIsPlaying(false);
      speechSynthesis.speak(u);
    };
    if (speechSynthesis.getVoices().length > 0) speak();
    else speechSynthesis.onvoiceschanged = () => { speak(); speechSynthesis.onvoiceschanged = null; };
  };

  const handleRate = async (rating) => {
    if (isRating) return;
    setIsRating(true);
    try { await onRate(rating); }
    finally { setTimeout(() => setIsRating(false), 500); }
  };

  const isReview = source === "review";
  const isEmailToday = source === "email_today";

  const sourceBadge = isEmailToday
    ? { label: "📧 Email word", color: "var(--electric)", bg: "rgba(139,127,255,0.15)", border: "var(--electric-border)" }
    : isReview
    ? { label: `🔄 Review · ${formatStability(progress?.stability)}`, color: "var(--sunshine-text)", bg: "rgba(252,211,77,0.12)", border: "rgba(252,211,77,0.25)" }
    : { label: "✨ New word", color: "var(--grass-text)", bg: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.25)" };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 72px)" }} key={currentIndex}>

      {/* ── Scrollable content ── */}
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-4">

        {/* Top row: badge + bookmark */}
        <div className="flex items-center justify-between mb-8">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
            style={{ color: sourceBadge.color, background: sourceBadge.bg, borderColor: sourceBadge.border }}
          >
            {sourceBadge.label}
          </span>
          <button
            onClick={onBookmark}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: isBookmarked ? "rgba(252,211,77,0.15)" : "var(--surface)",
              color: isBookmarked ? "var(--sunshine-text)" : "var(--ink-soft)",
              border: `1.5px solid ${isBookmarked ? "rgba(252,211,77,0.4)" : "var(--line)"}`,
            }}
          >
            {isBookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>

        {/* Word */}
        <h1
          className="font-serif font-black leading-none tracking-tight gradient-text-word mb-4"
          style={{ fontSize: "clamp(52px, 8vw, 96px)" }}
        >
          {word.word}
        </h1>

        {/* Phonetic + audio + badges */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          {aiContent?.meanings?.[0]?.phonetic_ipa && (
            <span className="font-serif italic text-base" style={{ color: "var(--ink-soft)" }}>
              /{aiContent.meanings[0].phonetic_ipa}/
            </span>
          )}
          <button
            onClick={speakWord}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition-all"
            style={{
              background: isPlaying ? "var(--electric)" : "var(--surface-elevated)",
              color: isPlaying ? "white" : "var(--electric)",
              border: "1.5px solid var(--electric-border)",
              boxShadow: isPlaying ? "0 0 0 3px rgba(139,127,255,0.25)" : "none",
            }}
            title="Nghe phát âm"
          >
            <Volume2 size={14} />
          </button>
          {word.level && (
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider"
              style={{ background: "var(--surface-elevated)", color: "var(--electric)", border: "1.5px solid var(--electric-border)" }}
            >
              {word.level}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="mb-6" style={{ height: "1px", background: "var(--line)" }} />

        {/* AI Content */}
        {isLoadingAI ? (
          <AILoadingSkeleton message={loadingMsg} />
        ) : aiContent?.meanings?.length > 0 ? (
          <div className="space-y-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--ink-soft)" }}>
              📖 {aiContent.meanings.length} nghĩa phổ biến
            </p>

            {aiContent.meanings.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl px-5 py-4 border"
                style={{ background: "var(--surface)", borderColor: "var(--line)" }}
              >
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[10px] font-black opacity-30" style={{ color: "var(--ink)" }}>{i + 1}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}
                  >
                    {m.pos}
                  </span>
                </div>

                {m.memory_vi && (
                  <div
                    className="rounded-xl px-3 py-2.5 mb-3 border"
                    style={{ background: "var(--sunshine-soft)", borderColor: "var(--sunshine-border)" }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--sunshine-text)" }}>
                      💡 Mẹo nhớ
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--sunshine-dark)" }}>
                      {m.memory_vi}
                    </p>
                  </div>
                )}

                <p className="text-base font-semibold leading-snug mb-1" style={{ color: "var(--ink)" }}>
                  {m.definition_en}
                </p>
                {m.definition_vi && (
                  <p className="text-sm mb-3" style={{ color: "var(--ink-soft)" }}>
                    🇻🇳 {m.definition_vi}
                  </p>
                )}

                {m.examples?.length > 0 && (
                  <div className="space-y-1.5 mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                    {m.examples.map((ex, j) => (
                      <div key={j} className="flex gap-2 items-start">
                        <span className="flex-shrink-0 text-sm mt-0.5">{CONTEXT_ICONS[ex.context] || "•"}</span>
                        <p className="text-sm italic leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                          "{ex.sentence}"
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Synonyms */}
            {aiContent?.synonyms?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--grass-text)" }}>
                  ✨ Also
                </p>
                <div className="flex flex-wrap gap-2">
                  {aiContent.synonyms.map((s, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full text-sm font-semibold"
                      style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: "var(--hot-pink)" }}>
              📖 Definition
            </p>
            <p className="text-lg leading-relaxed font-medium" style={{ color: "var(--ink)" }}>{word.def_en}</p>
          </div>
        )}

        <div className="h-8" />
      </div>

      {/* ── Sticky rating bar ── */}
      <div
        className="sticky bottom-0 w-full border-t backdrop-blur-xl"
        style={{ background: "rgba(11,11,22,0.92)", borderColor: "var(--line)" }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
          <div className="grid grid-cols-4 gap-2 mb-2">
            {RATINGS.map(r => (
              <button
                key={r.rating}
                onClick={() => handleRate(r.rating)}
                disabled={isRating}
                onMouseEnter={() => setHovered(r.rating)}
                onMouseLeave={() => setHovered(null)}
                className="flex flex-col items-center gap-1 py-3 rounded-2xl border font-semibold text-xs disabled:opacity-40 transition-all"
                style={{
                  background: hovered === r.rating ? r.hoverBg : r.bg,
                  borderColor: r.border,
                  color: r.color,
                  transform: hovered === r.rating ? "translateY(-2px)" : "none",
                }}
              >
                <r.icon size={15} />
                <span>{r.label}</span>
                <span className="text-[10px] opacity-50 font-normal">{r.desc}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => handleRate(0)}
            disabled={isRating}
            className="w-full py-1.5 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-white/5 transition-colors"
            style={{ color: "var(--ink-ghost)" }}
          >
            <EyeOff size={11} />
            Không cần nhắc lại từ này
          </button>
        </div>
      </div>
    </div>
  );
}

function AILoadingSkeleton({ message }) {
  return (
    <div className="py-1">
      <p className="text-sm font-semibold mb-5" style={{ color: "var(--electric)" }}>{message}</p>
      <div className="animate-pulse space-y-5">
        {[
          { w1: "75%", w2: "60%", w3: "88%", w4: "70%", w5: "55%" },
          { w1: "82%", w2: "55%", w3: "78%", w4: "65%", w5: "80%" },
        ].map((ws, i) => (
          <div key={i} className="rounded-2xl p-5 space-y-2.5" style={{ background: "var(--surface)" }}>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ background: "var(--line)" }} />
              <div className="h-4 w-16 rounded-full" style={{ background: "var(--line)" }} />
            </div>
            <div className="h-4 rounded-full" style={{ background: "var(--line)", width: ws.w1 }} />
            <div className="h-4 rounded-full" style={{ background: "var(--surface-elevated)", width: ws.w2 }} />
            <div className="h-3 rounded-full" style={{ background: "var(--surface-elevated)", width: ws.w3 }} />
            <div className="pl-1 space-y-1.5 pt-1">
              <div className="h-3 rounded-full" style={{ background: "var(--surface-elevated)", width: ws.w4 }} />
              <div className="h-3 rounded-full" style={{ background: "var(--surface-elevated)", width: ws.w5 }} />
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
