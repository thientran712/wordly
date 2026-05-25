"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BookOpen, UserCog, User, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export default function Header({ streak, totalDays, userName, reviewCount = 0 }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isStreakOpen, setIsStreakOpen] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex items-center px-6 sm:px-10 py-3 backdrop-blur-xl border-b mb-5 relative z-50 sticky top-0" style={{ background: "rgba(10,10,10,0.92)", borderColor: "var(--line)" }}>
      {/* Logo */}
      <div
        className="flex items-center gap-2 cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
        onClick={() => router.push("/")}
      >
        <div
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-lg shadow-[0_2px_8px_rgba(255,92,138,0.3)] flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #22C55E, #16A34A)", transform: "rotate(-5deg)" }}
        >
          🌈
        </div>
        <span className="font-serif font-black text-xl sm:text-2xl gradient-text-purple-pink tracking-tight">
          Wordly
        </span>
      </div>

      {/* Center nav — absolutely centered */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2">
        {/* Streak badge + popup */}
        <div className="relative">
          <button
            onClick={() => { setIsStreakOpen(!isStreakOpen); setIsMenuOpen(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: "linear-gradient(135deg, var(--butter), var(--sunshine))", color: "#8B5500" }}
            title="Xem thống kê streak"
          >
            🔥 <span>{streak}</span>
            <span className="hidden sm:inline">days</span>
          </button>

          {isStreakOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsStreakOpen(false)} />
              <div
                className="absolute left-1/2 -translate-x-1/2 top-12 z-50 rounded-2xl py-3 min-w-[220px] animate-fade-in"
                style={{
                  background: "var(--surface-elevated)",
                  boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(252,211,77,0.2)",
                }}
              >
                <div className="px-4 py-2 border-b border-[--line]">
                  <p className="text-[10px] text-[--ink-soft] uppercase tracking-wider mb-2">Thống kê học tập</p>
                  <div className="flex items-center gap-3">
                    <div className="text-center flex-1">
                      <div className="text-2xl font-black" style={{ color: "var(--sunshine-text)" }}>{streak}</div>
                      <div className="text-[10px] font-semibold text-[--ink-soft] mt-0.5">🔥 Liên tiếp</div>
                    </div>
                    <div className="w-px h-10 bg-[--line]" />
                    <div className="text-center flex-1">
                      <div className="text-2xl font-black" style={{ color: "var(--electric)" }}>{totalDays}</div>
                      <div className="text-[10px] font-semibold text-[--ink-soft] mt-0.5">📅 Tổng ngày</div>
                    </div>
                    <div className="w-px h-10 bg-[--line]" />
                    <div className="text-center flex-1">
                      <div className="text-2xl font-black" style={{ color: "var(--grass)" }}>{reviewCount}</div>
                      <div className="text-[10px] font-semibold text-[--ink-soft] mt-0.5">⭐ Hôm nay</div>
                    </div>
                  </div>
                </div>
                <p className="px-4 pt-2 text-[10px] text-[--ink-soft] leading-relaxed">
                  {streak > 0
                    ? `Tuyệt vời! Bạn đang học ${streak} ngày liên tiếp.`
                    : "Học hôm nay để bắt đầu streak nhé! 💪"}
                </p>
              </div>
            </>
          )}
        </div>

        {/* My Words */}
        <button
          onClick={() => router.push("/words")}
          title="My Words"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold hover:-translate-y-0.5 hover:shadow-sm transition-all"
          style={{ background: "var(--surface)", borderColor: "var(--line)", color: "var(--ink-soft)" }}
        >
          <BookOpen size={15} />
          <span className="hidden sm:inline">My Words</span>
        </button>
      </div>

      {/* User avatar — sign out + mobile nav */}
      <div className="relative ml-auto">
        <button
          onClick={() => { setIsMenuOpen(!isMenuOpen); setIsStreakOpen(false); }}
          className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-white cursor-pointer flex-shrink-0 hover:scale-110 hover:shadow-[0_4px_16px_rgba(34,197,94,0.4)]"
          style={{ background: "linear-gradient(135deg, var(--electric), var(--hot-pink))" }}
          title={userName || "Account"}
        >
          <User size={16} />
        </button>

        {isMenuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
            <div
              className="absolute right-0 top-12 z-50 rounded-2xl py-1.5 min-w-[200px]"
              style={{
                background: "var(--surface-elevated)",
                boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1.5px rgba(34,197,94,0.2)",
              }}
            >
              {userName && (
                <div className="px-4 py-2.5 border-b border-[--line]">
                  <p className="text-[10px] text-[--ink-soft] uppercase tracking-wider">Xin chào</p>
                  <p className="font-bold text-sm truncate">{userName}</p>
                </div>
              )}
              <button
                onClick={() => { setIsMenuOpen(false); router.push("/words"); }}
                className="sm:hidden w-full px-4 py-2.5 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--surface] hover:text-[--electric] transition-colors flex items-center gap-2"
              >
                <BookOpen size={15} /> My Words
              </button>
              <div className="sm:hidden h-px bg-[--line] my-1" />
              <button
                onClick={() => { setIsMenuOpen(false); router.push("/profile"); }}
                className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--surface] hover:text-[--electric] transition-colors flex items-center gap-2"
              >
                <UserCog size={15} /> Profile Settings
              </button>
              <button
                onClick={() => { setIsMenuOpen(false); router.push("/profile/email"); }}
                className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--surface] hover:text-[--electric] transition-colors flex items-center gap-2"
              >
                <Mail size={15} /> Email Settings
              </button>
              <div className="h-px bg-[--line] my-1" />
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2.5 text-left text-sm font-semibold text-[--ink-soft] hover:bg-[--surface] hover:text-[--hot-pink] transition-colors flex items-center gap-2"
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
