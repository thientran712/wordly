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
    <header
      className="backdrop-blur-xl border-b mb-5 sticky top-0 z-50"
      style={{ background: "rgba(10,10,10,0.95)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      {/* 3-column grid: logo | nav | user — constrained width so they stay close */}
      <div
        className="max-w-5xl mx-auto px-6 sm:px-8 py-3 items-center"
        style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr" }}
      >
        {/* ── Logo (left) ── */}
        <div
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity w-fit"
          onClick={() => router.push("/")}
        >
          <div
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #22C55E, #16A34A)",
              boxShadow: "0 2px 8px rgba(34,197,94,0.35)",
            }}
          >
            🌈
          </div>
          <span className="font-serif font-black text-xl sm:text-2xl gradient-text-purple-pink tracking-tight">
            Wordly
          </span>
        </div>

        {/* ── Center nav ── */}
        <div className="flex items-center gap-2">
          {/* Streak */}
          <div className="relative">
            <button
              onClick={() => { setIsStreakOpen(!isStreakOpen); setIsMenuOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs hover:-translate-y-0.5 transition-all"
              style={{
                background: "rgba(252,211,77,0.12)",
                color: "#FBBF24",
                border: "1px solid rgba(252,211,77,0.25)",
              }}
              title="Xem thống kê"
            >
              🔥 <span>{streak}</span>
              <span className="hidden sm:inline text-xs opacity-70">days</span>
            </button>

            {isStreakOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsStreakOpen(false)} />
                <div
                  className="absolute left-1/2 -translate-x-1/2 top-12 z-50 rounded-2xl py-3 min-w-[220px] animate-fade-in"
                  style={{
                    background: "#1A1A1A",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
                  }}
                >
                  <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "var(--ink-soft)" }}>Thống kê học tập</p>
                    <div className="flex items-center gap-3">
                      <div className="text-center flex-1">
                        <div className="text-2xl font-black" style={{ color: "#FBBF24" }}>{streak}</div>
                        <div className="text-[10px] font-semibold mt-0.5" style={{ color: "var(--ink-soft)" }}>🔥 Streak</div>
                      </div>
                      <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <div className="text-center flex-1">
                        <div className="text-2xl font-black" style={{ color: "var(--electric)" }}>{totalDays}</div>
                        <div className="text-[10px] font-semibold mt-0.5" style={{ color: "var(--ink-soft)" }}>📅 Ngày</div>
                      </div>
                      <div className="w-px h-10" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <div className="text-center flex-1">
                        <div className="text-2xl font-black" style={{ color: "var(--electric)" }}>{reviewCount}</div>
                        <div className="text-[10px] font-semibold mt-0.5" style={{ color: "var(--ink-soft)" }}>⭐ Hôm nay</div>
                      </div>
                    </div>
                  </div>
                  <p className="px-4 pt-2 text-[10px] leading-relaxed" style={{ color: "var(--ink-soft)" }}>
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold hover:-translate-y-0.5 transition-all"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--ink-soft)",
            }}
          >
            <BookOpen size={14} />
            <span className="hidden sm:inline">My Words</span>
          </button>
        </div>

        {/* ── User (right) ── */}
        <div className="flex justify-end">
          <div className="relative">
            <button
              onClick={() => { setIsMenuOpen(!isMenuOpen); setIsStreakOpen(false); }}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-white hover:scale-110 transition-all"
              style={{
                background: "var(--electric)",
                boxShadow: isMenuOpen ? "0 4px 16px rgba(34,197,94,0.5)" : "0 2px 8px rgba(34,197,94,0.3)",
              }}
              title={userName || "Account"}
            >
              <User size={15} />
            </button>

            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <div
                  className="absolute right-0 top-12 z-50 rounded-2xl py-1.5 min-w-[200px] animate-fade-in"
                  style={{
                    background: "#1A1A1A",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
                  }}
                >
                  {userName && (
                    <div className="px-4 py-2.5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Xin chào</p>
                      <p className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>{userName}</p>
                    </div>
                  )}
                  <button
                    onClick={() => { setIsMenuOpen(false); router.push("/words"); }}
                    className="sm:hidden w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <BookOpen size={14} /> My Words
                  </button>
                  <div className="sm:hidden h-px my-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <button
                    onClick={() => { setIsMenuOpen(false); router.push("/profile"); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-[--electric] transition-colors"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <UserCog size={14} /> Profile Settings
                  </button>
                  <button
                    onClick={() => { setIsMenuOpen(false); router.push("/profile/email"); }}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center gap-2 hover:bg-white/5 hover:text-[--electric] transition-colors"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Mail size={14} /> Email Settings
                  </button>
                  <div className="h-px my-1" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors"
                    style={{ color: "#F87171" }}
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
