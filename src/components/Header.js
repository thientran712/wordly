"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  LogOut, UserCog, Mail, Sun, Moon, User, LogIn,
  NotebookPen, Plus, Loader2, X, Mic, MessageCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";

export default function Header({ userName, isGuest = false, onJournalAdded }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
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

  const openJournal = () => {
    setIsMenuOpen(false);
    setIsJournalOpen(true);
  };

  return (
    <>
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
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--electric)" }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 4C2 3.44772 2.44772 3 3 3H4.5C5.05228 3 5.5 3.44772 5.5 4V9C5.5 10.1046 6.39543 11 7.5 11C8.60457 11 9.5 10.1046 9.5 9V4C9.5 3.44772 9.94772 3 10.5 3H12C12.5523 3 13 3.44772 13 4V9C13 11.7614 10.7614 14 8 14C7.14 14 6.33 13.78 5.63 13.39" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="font-bold text-xl tracking-tight" style={{ color: "var(--ink)" }}>
              Wordly
            </span>
          </button>

          {/* Right: theme + avatar/login */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
              style={{ background: "var(--hover-bg)", border: "1px solid var(--card-border)", color: "var(--ink-soft)" }}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {isGuest ? (
              <button
                onClick={() => router.push("/login")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all active:scale-95 no-min-h"
                style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 2px 8px rgba(var(--electric-rgb),0.3)" }}
              >
                <LogIn size={13} />
                <span>Đăng nhập</span>
              </button>
            ) : (
              <div className="relative">
                <button
                  onClick={() => setIsMenuOpen(o => !o)}
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-all"
                  style={{
                    background: "var(--electric)",
                    color: "var(--on-electric)",
                    boxShadow: isMenuOpen ? "0 4px 16px rgba(var(--electric-rgb),0.5)" : "0 2px 8px rgba(var(--electric-rgb),0.3)",
                  }}
                >
                  <User size={15} />
                </button>

                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" style={{ background: "transparent" }} onClick={() => setIsMenuOpen(false)} onTouchStart={() => setIsMenuOpen(false)} />
                    <div
                      className="absolute right-0 top-11 z-50 rounded-2xl py-1.5 min-w-[210px] animate-fade-in"
                      style={{
                        background: "var(--card-bg)",
                        border: "1px solid var(--card-border)",
                        boxShadow: "0 20px 56px rgba(0,0,0,0.4)",
                      }}
                    >
                      {/* User info */}
                      {userName && (
                        <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--divider)" }}>
                          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--ink-soft)" }}>Xin chào</p>
                          <p className="font-bold text-sm truncate" style={{ color: "var(--ink)" }}>{userName}</p>
                        </div>
                      )}

                      {/* Navigation */}
                      <MenuItem
                        icon={NotebookPen}
                        label="Journal"
                        onClick={() => { setIsMenuOpen(false); router.push("/journal"); }}
                      />
                      <MenuItem
                        icon={Plus}
                        label="Thêm nhanh"
                        onClick={openJournal}
                      />
                      <MenuItem
                        icon={Mic}
                        label="Luyện nói với Alex"
                        onClick={() => { setIsMenuOpen(false); router.push("/practice"); }}
                      />
                      <MenuItem
                        icon={MessageCircle}
                        label="Chat theo từ vựng"
                        onClick={() => { setIsMenuOpen(false); router.push("/vocabulary-chat"); }}
                      />

                      <div className="h-px my-1" style={{ background: "var(--divider)" }} />

                      {/* Settings */}
                      <MenuItem icon={UserCog} label="Hồ sơ" onClick={() => { setIsMenuOpen(false); router.push("/profile"); }} />
                      <MenuItem icon={Mail} label="Cài đặt Email" onClick={() => { setIsMenuOpen(false); router.push("/profile/email"); }} />

                      <div className="h-px my-1" style={{ background: "var(--divider)" }} />

                      <MenuItem icon={LogOut} label="Đăng xuất" onClick={handleLogout} danger />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Journal sheet — triggered from profile menu */}
      {!isGuest && (
        <JournalSheet
          isOpen={isJournalOpen}
          onClose={() => setIsJournalOpen(false)}
          onAdded={onJournalAdded}
        />
      )}
    </>
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
      <span className="flex-1">{label}</span>
    </button>
  );
}

function JournalSheet({ isOpen, onClose, onAdded }) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (res.ok) {
        setContent("");
        onClose();
        onAdded?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[90]"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />

      {/* Sheet — bottom on mobile, centered on desktop */}
      <div
        className="fixed z-[100] animate-slide-up
          bottom-0 left-0 right-0 rounded-t-3xl px-5 pt-4
          sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
          sm:w-full sm:max-w-sm sm:rounded-3xl sm:p-6"
        style={{
          paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
          background: "var(--card-bg)",
          border: "1px solid var(--green-subtle-border)",
          boxShadow: "0 -16px 48px rgba(0,0,0,0.3)",
        }}
      >
        {/* Pull handle (mobile only) */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: "var(--divider)" }} />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <NotebookPen size={15} style={{ color: "var(--electric)" }} />
            <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Ghi chú nhanh</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
              style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Câu, bài học, hoặc câu hỏi bạn gặp hôm nay..."
            autoFocus
            rows={3}
            className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all resize-none"
            style={{ background: "var(--input-bg)", border: "1.5px solid var(--input-border)", color: "var(--ink)" }}
            onFocus={e => { e.target.style.borderColor = "var(--electric)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--input-border)"; }}
          />
          <button
            type="submit"
            disabled={isLoading || !content.trim()}
            className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 4px 16px rgba(var(--electric-rgb),0.3)" }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Lưu vào Journal
          </button>
        </form>
      </div>
    </>
  );
}
