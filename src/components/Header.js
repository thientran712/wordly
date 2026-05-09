"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, LogOut, User } from "lucide-react";
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
    <header className="flex flex-wrap gap-3 justify-between items-center px-4 sm:px-6 py-3 bg-white/70 backdrop-blur-xl rounded-3xl border-2 border-white/80 shadow-[0_8px_24px_rgba(108,92,231,0.08)] mb-8 relative">
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

        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="w-11 h-11 rounded-2xl flex items-center justify-center cursor-pointer transition-all hover:scale-110 text-white"
            style={{ background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)' }}
            title={userName || "Tài khoản"}
          >
            <User size={20} />
          </button>

          {isMenuOpen && (
            <>
              <div 
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div 
                className="absolute right-0 top-14 z-50 bg-white rounded-2xl border-2 border-[--line] py-2 min-w-[200px] animate-fade-in"
                style={{ boxShadow: '0 12px 32px rgba(45, 27, 78, 0.15)' }}
              >
                {userName && (
                  <div className="px-4 py-3 border-b border-[--line]">
                    <p className="text-xs text-[--ink-soft]">Xin chào</p>
                    <p className="font-bold text-sm truncate">{userName}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--whisper] hover:text-[--hot-pink] transition-colors flex items-center gap-2"
                >
                  <LogOut size={16} />
                  Đăng xuất
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
