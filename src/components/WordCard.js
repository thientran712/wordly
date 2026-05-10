"use client";

import { useState } from "react";
import { Volume2, ArrowLeft, ArrowRight, Check } from "lucide-react";

export default function WordCard({ word, currentIndex, total, isBookmarked, onBookmark, onPrev, onNext, onKnown }) {
  const [isPlaying, setIsPlaying] = useState(false);

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

  return (
    <div 
      className="bg-white rounded-[32px] p-6 sm:p-12 border-[3px] border-white relative overflow-hidden mb-6 animate-fade-in"
      style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.12)' }}
      key={currentIndex}
    >
      <div className="absolute -top-1/2 -right-1/5 w-[400px] h-[400px] rounded-full opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD8C9, transparent)' }} />
      <div className="absolute -bottom-1/3 -left-[10%] w-[300px] h-[300px] rounded-full opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #DCC9FF, transparent)' }} />

      <div className="relative z-10">
        <div className="flex justify-between items-center mb-6">
          <div 
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs sm:text-sm"
            style={{ background: 'linear-gradient(135deg, #DCC9FF, #FFC1D8)' }}
          >
            <span className="w-2 h-2 rounded-full bg-[--hot-pink] animate-pulse-dot"></span>
            <span>Word of the day · Day {currentIndex + 1}</span>
          </div>
          <button
            onClick={onBookmark}
            className={`w-11 h-11 rounded-2xl border-2 cursor-pointer flex items-center justify-center text-xl transition-all hover:scale-110 ${
              isBookmarked 
                ? 'bg-[--butter] border-[--sunshine]' 
                : 'bg-[--whisper] border-[--line] hover:bg-[--butter] hover:border-[--sunshine]'
            }`}
            title="Bookmark"
          >
            {isBookmarked ? '💖' : '🤍'}
          </button>
        </div>

        <div className="text-center my-6">
          <h1 
            className="font-serif font-black leading-none tracking-tight gradient-text-word inline-block mb-4"
            style={{ fontSize: 'clamp(64px, 9vw, 120px)' }}
          >
            {word.word}
          </h1>
          <div className="inline-flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {word.phonetic && (
              <span className="font-serif italic text-xl sm:text-2xl text-[--ink-soft]">
                {word.phonetic}
              </span>
            )}
            <span 
              className="px-3.5 py-1.5 rounded-full font-bold text-xs uppercase tracking-wider"
              style={{ background: '#B8F3D2', color: '#00754C' }}
            >
              {word.pos}
            </span>
            {word.level && (
              <span 
                className="px-3.5 py-1.5 rounded-full font-bold text-xs uppercase tracking-wider"
                style={{ background: '#DCC9FF', color: '#5B3FBC' }}
              >
                {word.level}
              </span>
            )}
            <button
              onClick={speakWord}
              className={`w-14 h-14 rounded-full border-none cursor-pointer flex items-center justify-center text-white transition-all hover:scale-110 relative ${isPlaying ? 'audio-btn-playing' : ''}`}
              style={{ 
                background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)',
                boxShadow: '0 8px 20px rgba(108, 92, 231, 0.35)'
              }}
              title="Listen to pronunciation"
            >
              <Volume2 size={22} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Definition - Full width */}
        <div className="mt-8 mb-4">
          <div 
            className="p-6 rounded-3xl border-2"
            style={{ background: 'linear-gradient(135deg, #FFF1F8, #FFE8F0)', borderColor: '#FFD0E2' }}
          >
            <div className="inline-flex items-center gap-1.5 font-bold text-xs uppercase tracking-widest mb-3 text-[--hot-pink]">
              📖 Definition
            </div>
            <div className="text-base sm:text-xl font-medium leading-relaxed text-[--ink]">
              {word.defEn}
            </div>
          </div>
        </div>

        {/* Example - Full width */}
        {word.exEn && (
          <div className="mb-4">
            <div 
              className="p-6 rounded-3xl border-2"
              style={{ background: 'linear-gradient(135deg, #F0F9FF, #E8F4FE)', borderColor: '#C9E5FB' }}
            >
              <div className="inline-flex items-center gap-1.5 font-bold text-xs uppercase tracking-widest mb-3 text-[--ocean]">
                💬 Example
              </div>
              <div className="text-base sm:text-lg font-medium leading-relaxed text-[--ink] italic">
                <span className="font-serif text-3xl text-[--ocean] opacity-40 leading-none mr-1">"</span>
                {word.exEn}
                <span className="font-serif text-3xl text-[--ocean] opacity-40 leading-none ml-1">"</span>
              </div>
            </div>
          </div>
        )}

        {/* Synonyms - Only show if any */}
        {word.syn && word.syn.length > 0 && (
          <div 
            className="p-6 rounded-3xl border-2 mb-4"
            style={{ background: 'linear-gradient(135deg, #F0FFF4, #E0FBE8)', borderColor: '#B8E8C9' }}
          >
            <div className="inline-flex items-center gap-1.5 font-bold text-xs uppercase tracking-widest mb-3 text-[--grass]">
              ✨ Synonyms
            </div>
            <div className="flex flex-wrap gap-2">
              {word.syn.map((s, i) => (
                <span 
                  key={i}
                  className="px-3.5 py-2 bg-white border-2 rounded-full font-semibold text-xs sm:text-sm text-[--grass] cursor-default transition-all hover:bg-[--mint] hover:scale-105"
                  style={{ borderColor: '#B8E8C9' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 mt-8 items-center">
          <button
            onClick={onPrev}
            className="inline-flex items-center justify-center gap-2.5 px-6 py-4 bg-white text-[--ink-soft] border-2 border-[--line] rounded-full font-bold text-sm sm:text-base cursor-pointer transition-all hover:bg-[--whisper] hover:border-[--electric] hover:text-[--electric] hover:-translate-x-1"
          >
            <ArrowLeft size={18} />
            <span>Previous</span>
          </button>
          <button
            onClick={onKnown}
            className="px-6 py-4 border-2 rounded-full font-bold text-sm sm:text-base cursor-pointer transition-all hover:scale-105 inline-flex items-center justify-center gap-2"
            style={{ background: '#B8F3D2', color: '#00C896', borderColor: '#00C896' }}
          >
            <Check size={18} />
            <span>I know this</span>
          </button>
          <button
            onClick={onNext}
            className="inline-flex items-center justify-center gap-2.5 px-8 py-4 text-white border-none rounded-full font-bold text-base cursor-pointer transition-all hover:translate-x-1 hover:-translate-y-0.5"
            style={{ 
              background: 'linear-gradient(135deg, #FF5C8A, #FF6B47)',
              boxShadow: '0 8px 20px rgba(255, 92, 138, 0.4)'
            }}
          >
            <span>Next word</span>
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
