"use client";

import { useState } from "react";
import { Volume2, X, Frown, Smile, Sparkles } from "lucide-react";

export default function WordCard({ 
  word, 
  currentIndex, 
  total, 
  isBookmarked, 
  onBookmark, 
  onRate,
  progress,
  source,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRating, setIsRating] = useState(false);

  const speakWord = () => {
    if ('speechSynthesis' in window) {
      setIsPlaying(true);
      const utterance = new SpeechSynthesisUtterance(word.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.onend = () => setIsPlaying(false);
      speechSynthesis.speak(utterance);
    }
  };

  const handleRate = async (rating) => {
    if (isRating) return;
    setIsRating(true);
    try {
      await onRate(rating);
    } finally {
      setTimeout(() => setIsRating(false), 500);
    }
  };

  const badgeText = source === 'review' 
    ? `🔄 Review · ${formatStability(progress?.stability)}`
    : source === 'new'
    ? '✨ New word'
    : `📚 Day ${currentIndex + 1}`;

  return (
    <div 
      className="bg-white rounded-3xl sm:rounded-[32px] p-4 sm:p-12 border-2 sm:border-[3px] border-white relative overflow-hidden mb-4 sm:mb-6 animate-fade-in"
      style={{ boxShadow: '0 12px 32px rgba(45, 27, 78, 0.10)' }}
      key={currentIndex}
    >
      <div className="absolute -top-1/2 -right-1/5 w-[300px] sm:w-[400px] h-[300px] sm:h-[400px] rounded-full opacity-40 sm:opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD8C9, transparent)' }} />
      <div className="absolute -bottom-1/3 -left-[10%] w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] rounded-full opacity-40 sm:opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #DCC9FF, transparent)' }} />

      <div className="relative z-10">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-4 sm:mb-6 gap-2">
          <div 
            className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-[10px] sm:text-sm min-w-0"
            style={{ 
              background: source === 'review' 
                ? 'linear-gradient(135deg, #FFE9A8, #FFD0E2)' 
                : 'linear-gradient(135deg, #DCC9FF, #FFC1D8)' 
            }}
          >
            <span className="w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-[--hot-pink] animate-pulse-dot flex-shrink-0"></span>
            <span className="truncate">{badgeText}</span>
          </div>
          <button
            onClick={onBookmark}
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl border-2 cursor-pointer flex items-center justify-center text-lg sm:text-xl transition-all hover:scale-110 flex-shrink-0 ${
              isBookmarked 
                ? 'bg-[--butter] border-[--sunshine]' 
                : 'bg-[--whisper] border-[--line] hover:bg-[--butter] hover:border-[--sunshine]'
            }`}
            title="Bookmark"
          >
            {isBookmarked ? '💖' : '🤍'}
          </button>
        </div>

        {/* Word */}
        <div className="text-center my-4 sm:my-6">
          <h1 
            className="font-serif font-black leading-none tracking-tight gradient-text-word inline-block mb-3 sm:mb-4"
            style={{ fontSize: 'clamp(40px, 12vw, 120px)' }}
          >
            {word.word}
          </h1>
          <div className="inline-flex flex-wrap items-center justify-center gap-2 sm:gap-4">
            {word.phonetic && (
              <span className="font-serif italic text-base sm:text-2xl text-[--ink-soft] w-full sm:w-auto">
                {word.phonetic}
              </span>
            )}
            <div className="flex items-center gap-2 sm:gap-3">
              <span 
                className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wider"
                style={{ background: '#B8F3D2', color: '#00754C' }}
              >
                {word.pos}
              </span>
              {word.level && (
                <span 
                  className="px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-full font-bold text-[10px] sm:text-xs uppercase tracking-wider"
                  style={{ background: '#DCC9FF', color: '#5B3FBC' }}
                >
                  {word.level}
                </span>
              )}
              <button
                onClick={speakWord}
                className={`w-11 h-11 sm:w-14 sm:h-14 rounded-full border-none cursor-pointer flex items-center justify-center text-white transition-all hover:scale-110 relative ${isPlaying ? 'audio-btn-playing' : ''}`}
                style={{ 
                  background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)',
                  boxShadow: '0 8px 20px rgba(108, 92, 231, 0.35)'
                }}
                title="Listen"
              >
                <Volume2 size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Definition */}
        <div className="mt-6 sm:mt-8 mb-3 sm:mb-4">
          <div 
            className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2"
            style={{ background: 'linear-gradient(135deg, #FFF1F8, #FFE8F0)', borderColor: '#FFD0E2' }}
          >
            <div className="inline-flex items-center gap-1.5 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-2 sm:mb-3 text-[--hot-pink]">
              📖 Definition
            </div>
            <div className="text-sm sm:text-xl font-medium leading-relaxed text-[--ink]">
              {word.def_en}
            </div>
          </div>
        </div>

        {/* Example */}
        {word.ex_en && (
          <div className="mb-3 sm:mb-4">
            <div 
              className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2"
              style={{ background: 'linear-gradient(135deg, #F0F9FF, #E8F4FE)', borderColor: '#C9E5FB' }}
            >
              <div className="inline-flex items-center gap-1.5 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-2 sm:mb-3 text-[--ocean]">
                💬 Example
              </div>
              <div className="text-sm sm:text-lg font-medium leading-relaxed text-[--ink] italic">
                <span className="font-serif text-xl sm:text-3xl text-[--ocean] opacity-40 leading-none mr-1">"</span>
                {word.ex_en}
                <span className="font-serif text-xl sm:text-3xl text-[--ocean] opacity-40 leading-none ml-1">"</span>
              </div>
            </div>
          </div>
        )}

        {/* Synonyms */}
        {word.synonyms && word.synonyms.length > 0 && (
          <div 
            className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl border-2 mb-3 sm:mb-4"
            style={{ background: 'linear-gradient(135deg, #F0FFF4, #E0FBE8)', borderColor: '#B8E8C9' }}
          >
            <div className="inline-flex items-center gap-1.5 font-bold text-[10px] sm:text-xs uppercase tracking-widest mb-2 sm:mb-3 text-[--grass]">
              ✨ Synonyms
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {word.synonyms.map((s, i) => (
                <span 
                  key={i}
                  className="px-2.5 sm:px-3.5 py-1 sm:py-2 bg-white border-2 rounded-full font-semibold text-xs sm:text-sm text-[--grass]"
                  style={{ borderColor: '#B8E8C9' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Rating Buttons */}
        <div className="mt-6 sm:mt-8">
          <p className="text-center text-xs sm:text-sm font-semibold text-[--ink-soft] mb-3 sm:mb-4">
            How well did you remember this word?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <RateButton
              rating={1}
              label="Again"
              icon={<X size={18} />}
              description="< 10 min"
              color="#FF5C8A"
              bgColor="#FFE8EE"
              borderColor="#FFB4C8"
              onClick={handleRate}
              disabled={isRating}
              shortcut="1"
            />
            <RateButton
              rating={2}
              label="Hard"
              icon={<Frown size={18} />}
              description="< 1 day"
              color="#FF6B47"
              bgColor="#FFE9DD"
              borderColor="#FFC9B4"
              onClick={handleRate}
              disabled={isRating}
              shortcut="2"
            />
            <RateButton
              rating={3}
              label="Good"
              icon={<Smile size={18} />}
              description="~ 3 days"
              color="#00C896"
              bgColor="#E0FBE8"
              borderColor="#B8E8C9"
              onClick={handleRate}
              disabled={isRating}
              shortcut="3"
            />
            <RateButton
              rating={4}
              label="Easy"
              icon={<Sparkles size={18} />}
              description="~ 7 days"
              color="#6C5CE7"
              bgColor="#EFEAFE"
              borderColor="#C9B8FA"
              onClick={handleRate}
              disabled={isRating}
              shortcut="4"
            />
          </div>
          <p className="hidden sm:block text-center text-xs text-[--ink-soft] mt-3 opacity-60">
            💡 Use keyboard 1-4 for quick rating
          </p>
        </div>
      </div>
    </div>
  );
}

function RateButton({ rating, label, icon, description, color, bgColor, borderColor, onClick, disabled, shortcut }) {
  return (
    <button
      onClick={() => onClick(rating)}
      disabled={disabled}
      className="relative px-2 sm:px-3 py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 font-bold cursor-pointer transition-all hover:scale-105 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 group"
      style={{
        background: bgColor,
        borderColor: borderColor,
        color: color,
        boxShadow: `0 4px 12px ${color}25`,
      }}
    >
      <div className="flex flex-col items-center gap-0.5 sm:gap-1">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {icon}
          <span className="text-sm sm:text-base">{label}</span>
        </div>
        <span className="text-[10px] sm:text-xs opacity-70">{description}</span>
      </div>
      <span 
        className="hidden sm:block absolute top-1 right-2 text-xs font-mono opacity-40 group-hover:opacity-80 transition-opacity"
      >
        {shortcut}
      </span>
    </button>
  );
}

function formatStability(days) {
  if (!days || days < 1) return "new";
  if (days < 7) return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}
