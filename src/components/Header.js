"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User, BarChart3, UserCog, BookOpen, Menu } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export default function Header({ streak, userName, onOpenSettings }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex gap-2 sm:gap-3 justify-between items-center px-3 sm:px-6 py-2.5 sm:py-3 bg-white/70 backdrop-blur-xl rounded-2xl sm:rounded-3xl border-2 border-white/80 shadow-[0_8px_24px_rgba(108,92,231,0.08)] mb-6 sm:mb-8 relative">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div 
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center text-xl sm:text-2xl shadow-[0_4px_16px_rgba(255,92,138,0.35)] transition-transform hover:rotate-12 hover:scale-110 cursor-pointer flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', transform: 'rotate(-5deg)' }}
          onClick={() => router.push('/learn')}
        >
          🌈
        </div>
        <span 
          className="font-serif font-black text-xl sm:text-3xl gradient-text-purple-pink tracking-tight cursor-pointer truncate"
          onClick={() => router.push('/learn')}
        >
          Wordly
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
        {/* Streak - hide text on small mobile */}
        <div 
          className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-full font-bold text-xs sm:text-sm shadow-[0_4px_12px_rgba(255,182,39,0.25)]"
          style={{ background: 'linear-gradient(135deg, #FFE9A8, #FFB627)', color: '#8B5500' }}
        >
          <span className="text-base sm:text-lg animate-wiggle">🔥</span>
          <span className="hidden xs:inline">{streak}</span>
          <span className="hidden sm:inline">days</span>
        </div>

        {/* Stats - hide on mobile, show in menu */}
        <button
          onClick={() => router.push('/stats')}
          className="hidden sm:flex w-11 h-11 rounded-2xl bg-white border-2 border-[--line] cursor-pointer items-center justify-center transition-all duration-300 hover:bg-[--lavender] hover:border-[--electric] hover:scale-110 text-[--ink-soft]"
          title="Statistics"
        >
          <BarChart3 size={20} />
        </button>

        {/* Settings - hide on mobile */}
        <button
          onClick={onOpenSettings}
          className="hidden sm:flex w-11 h-11 rounded-2xl bg-white border-2 border-[--line] cursor-pointer items-center justify-center transition-all duration-300 hover:bg-[--lavender] hover:border-[--electric] hover:rotate-45 text-[--ink-soft]"
          title="Email Settings"
        >
          <Settings size={20} />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 text-white"
            style={{ background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)' }}
            title={userName || "Account"}
          >
            <User size={18} />
          </button>

          {isMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div 
                className="absolute right-0 top-12 sm:top-14 z-50 bg-white rounded-2xl border-2 border-[--line] py-2 min-w-[220px] animate-fade-in"
                style={{ boxShadow: '0 12px 32px rgba(45, 27, 78, 0.15)' }}
              >
                {userName && (
                  <div className="px-4 py-3 border-b border-[--line]">
                    <p className="text-xs text-[--ink-soft]">Welcome</p>
                    <p className="font-bold text-sm truncate">{userName}</p>
                  </div>
                )}
                {/* Mobile-only menu items */}
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push("/stats");
                  }}
                  className="sm:hidden w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--electric] transition-colors flex items-center gap-2"
                >
                  <BarChart3 size={16} />
                  Statistics
                </button>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="sm:hidden w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--electric] transition-colors flex items-center gap-2"
                >
                  <Settings size={16} />
                  Email Settings
                </button>
                
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push("/profile");
                  }}
                  className="w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--electric] transition-colors flex items-center gap-2"
                >
                  <UserCog size={16} />
                  Edit Profile
                </button>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    router.push("/words");
                  }}
                  className="w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--electric] transition-colors flex items-center gap-2"
                >
                  <BookOpen size={16} />
                  Browse Words
                </button>
                <div className="h-px bg-[--line] my-1"></div>
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--hot-pink] transition-colors flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
