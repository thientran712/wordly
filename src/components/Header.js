"use client";

import { Settings } from "lucide-react";

export default function Header({ streak, onOpenSettings }) {
  return (
    <header className="flex flex-wrap gap-3 justify-between items-center px-4 sm:px-6 py-3 bg-white/70 backdrop-blur-xl rounded-3xl border-2 border-white/80 shadow-[0_8px_24px_rgba(108,92,231,0.08)] mb-8">
      <div className="flex items-center gap-3">
        <div 
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-2xl shadow-[0_4px_16px_rgba(255,92,138,0.35)] transition-transform hover:rotate-12 hover:scale-110"
          style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', transform: 'rotate(-5deg)' }}
        >
          🌈
        </div>
        <span className="font-serif font-black text-2xl sm:text-3xl gradient-text-purple-pink tracking-tight">
          Wordly
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div 
          className="flex items-center gap-2 px-4 py-2.5 rounded-full font-bold text-sm shadow-[0_4px_12px_rgba(255,182,39,0.25)]"
          style={{ background: 'linear-gradient(135deg, #FFE9A8, #FFB627)', color: '#8B5500' }}
        >
          <span className="text-lg animate-wiggle">🔥</span>
          <span>{streak} ngày</span>
        </div>
        <button
          onClick={onOpenSettings}
          className="w-11 h-11 rounded-2xl bg-white border-2 border-[--line] cursor-pointer flex items-center justify-center transition-all duration-300 hover:bg-[--lavender] hover:border-[--electric] hover:rotate-45 text-[--ink-soft]"
          title="Cài đặt"
        >
          <Settings size={20} />
        </button>
      </div>
    </header>
  );
}
