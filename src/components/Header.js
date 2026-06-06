"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { LogOut, BookOpen, UserCog, Mail, Sun, Moon, User, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export default function Header({ userName, isGuest = false }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState("dark");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const saved = localStorage.getItem("wordly-theme") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("wordly-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl border-b mb-3"
      style={{ background: "var(--header-bg)", borderColor: "var(--card-border)" }}
    >
      <div className="max-w-2xl mx-auto px-3 sm:px-5 h-13 sm:h-14 flex items-center justify-between gap-2">

        {/* Logo */}
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 flex-shrink-0 active:opacity-70 transition-opacity"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #22C55E, #16A34A)",
              boxShadow: "0 2px 8px rgba(34,197,94,0.35)",
            }}
          >
            🌈
          </div>
          <span className="font-serif font-black text-xl gradient-text-purple-pink tracking-tight">
            Wordly
          </span>
        </button>

        {/* Center nav */}
        {isGuest ? (
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
            style={{ background: "var(--electric)", color: "#0A0A0A", boxShadow: "0 2px 8px rgba(34,197,94,0.3)" }}
          >
            <LogIn size={13} />
            <span>Đăng nhập</span>
          </button>
        ) : (
          <button
            onClick={() => router.push("/words")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95"
            style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)", color: "var(--ink-soft)" }}
          >
            <BookOpen size={13} />
            <span>My Words</span>
          </button>
        )}

        {/* Right: theme + avatar */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
            style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)", color: "var(--ink-soft)" }}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* Avatar / menu — logged-in only */}
          {!isGuest && (
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(o => !o)}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-black active:scale-95 transition-all"
                style={{
                  background: "var(--electric)",
                  boxShadow: isMenuOpen ? "0 4px 16px rgba(34,197,94,0.5)" : "0 2px 8px rgba(34,197,94,0.3)",
                }}
              >
                <User size={15} />
              </button>

              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-11 z-50 rounded-2xl py-1.5 min-w-[190px] animate-fade-in"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      boxShadow: "0 20px 56px rgba(0,0,0,0.4)",
                    }}
                  >
                    {userName && (
                      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--divider)" }}>
                        <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--ink-soft)" }}>Xin chào</p>
                        <p className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>{userName}</p>
                      </div>
                    )}
                    <MenuItem icon={UserCog} label="Profile" onClick={() => { setIsMenuOpen(false); router.push("/profile"); }} />
                    <MenuItem icon={Mail} label="Email Settings" onClick={() => { setIsMenuOpen(false); router.push("/profile/email"); }} />
                    <div className="h-px my-1" style={{ background: "var(--divider)" }} />
                    <MenuItem icon={LogOut} label="Sign out" onClick={handleLogout} danger />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left text-sm font-semibold flex items-center gap-2.5 transition-colors"
      style={{ color: danger ? "var(--error)" : "var(--ink-soft)" }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger ? "var(--error-soft)" : "var(--hover-bg)";
        if (!danger) e.currentTarget.style.color = "var(--electric)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger ? "var(--error)" : "var(--ink-soft)";
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
