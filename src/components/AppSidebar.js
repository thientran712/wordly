"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Mic, MessageCircle, NotebookPen, UserCog,
  Sun, Moon, LogOut, LogIn, Mail, Plus, Loader2, X, Menu,
} from "lucide-react";
import { createClient } from "@/lib/supabase-client";

const NAV_ITEMS = [
  { href: "/", label: "Trang chủ", icon: Home },
  { href: "/vocabulary-chat", label: "Học từ mới", icon: MessageCircle },
  { href: "/practice", label: "Chat với Alex", icon: Mic },
  { href: "/journal", label: "Nhật ký", icon: NotebookPen },
  { href: "/profile", label: "Hồ sơ", icon: UserCog },
];

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [isGuest, setIsGuest] = useState(false);
  const [userName, setUserName] = useState("");
  const [theme, setTheme] = useState("dark");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("wordly-theme") || "dark";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => {
        if (!r.ok) { setIsGuest(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setUserName(data.profile?.name || data.email?.split("@")[0] || "");
      })
      .catch(() => setIsGuest(true));
  }, []);

  // Skip auth pages entirely — no sidebar on login/signup/forgot/reset
  const isAuthPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname);
  // On /practice, collapse to a slim rail so it doesn't fight the page's own session sidebar
  const isPractice = pathname.startsWith("/practice");

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

  if (isAuthPage) return null;

  return (
    <>
      {/* Mobile hamburger trigger — hidden on /practice, which has its own header + session sidebar */}
      {!isPractice && (
        <button
          onClick={() => setMobileOpen(true)}
          className="no-min-h fixed top-3 left-3 z-40 w-9 h-9 rounded-xl flex items-center justify-center md:hidden"
          style={{ background: "var(--card-bg)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
        >
          <Menu size={16} />
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-50 md:z-30 flex flex-col flex-shrink-0 transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        style={{
          width: isPractice ? 60 : 240,
          background: "var(--card-bg)",
          borderRight: "1px solid var(--divider)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 flex-shrink-0">
          <button
            onClick={() => { router.push("/"); setMobileOpen(false); }}
            className="flex items-center gap-2 min-w-0"
          >
            <div className="w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden">
              <img src="/favicon.png" alt="Wordly" className="w-full h-full object-cover scale-125" />
            </div>
            {!isPractice && (
              <span className="font-black text-xl tracking-tight truncate" style={{ color: "var(--electric)" }}>Wordly</span>
            )}
          </button>
          <button onClick={() => setMobileOpen(false)} className="no-min-h ml-auto w-7 h-7 rounded-lg flex items-center justify-center md:hidden" style={{ color: "var(--ink-soft)" }}>
            <X size={14} />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/profile"
              ? pathname === "/profile"
              : item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => { router.push(item.href); setMobileOpen(false); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                title={item.label}
                style={{
                  background: active ? "var(--green-subtle)" : "transparent",
                  color: active ? "var(--electric)" : "var(--ink-soft)",
                  border: active ? "1.5px solid var(--green-subtle-border)" : "1.5px solid transparent",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} className="flex-shrink-0" />
                {!isPractice && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}

          {!isPractice && (
            <button
              onClick={() => setIsJournalOpen(true)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ color: "var(--ink-soft)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <Plus size={20} className="flex-shrink-0" />
              <span className="truncate">Thêm nhanh</span>
            </button>
          )}
        </nav>

        {/* Bottom: theme toggle + account */}
        <div className="flex-shrink-0 px-2 py-2 border-t" style={{ borderColor: "var(--divider)" }}>
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ color: "var(--ink-soft)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {theme === "dark" ? <Sun size={20} className="flex-shrink-0" /> : <Moon size={20} className="flex-shrink-0" />}
            {!isPractice && <span className="truncate">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          </button>

          {isGuest ? (
            <button
              onClick={() => router.push("/login")}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={{ color: "var(--electric)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <LogIn size={20} className="flex-shrink-0" />
              {!isPractice && <span className="truncate">Đăng nhập</span>}
            </button>
          ) : (
            <>
              {!isPractice && userName && (
                <div className="px-3 py-1.5 text-[11px] truncate" style={{ color: "var(--ink-ghost)" }}>{userName}</div>
              )}
              <button
                onClick={() => router.push("/profile/email")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: pathname === "/profile/email" ? "var(--green-subtle)" : "transparent",
                  color: pathname === "/profile/email" ? "var(--electric)" : "var(--ink-soft)",
                }}
                onMouseEnter={(e) => { if (pathname !== "/profile/email") e.currentTarget.style.background = "var(--hover-bg)"; }}
                onMouseLeave={(e) => { if (pathname !== "/profile/email") e.currentTarget.style.background = "transparent"; }}
              >
                <Mail size={20} className="flex-shrink-0" strokeWidth={pathname === "/profile/email" ? 2.5 : 2} />
                {!isPractice && <span className="truncate">Cài đặt Email</span>}
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{ color: "var(--error)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--error-soft)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut size={20} className="flex-shrink-0" />
                {!isPractice && <span className="truncate">Đăng xuất</span>}
              </button>
            </>
          )}
        </div>
      </aside>

      {!isGuest && (
        <JournalSheet isOpen={isJournalOpen} onClose={() => setIsJournalOpen(false)} />
      )}
    </>
  );
}

function JournalSheet({ isOpen, onClose }) {
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
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(3px)" }}
        onClick={onClose}
      />
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
        <div className="w-10 h-1 rounded-full mx-auto mb-4 sm:hidden" style={{ background: "var(--divider)" }} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <NotebookPen size={15} style={{ color: "var(--electric)" }} />
            <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Ghi chú nhanh</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="no-min-h w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Câu, bài học, hoặc câu hỏi bạn gặp hôm nay..."
            autoFocus
            rows={3}
            className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all resize-none"
            style={{ background: "var(--input-bg)", border: "1.5px solid var(--input-border)", color: "var(--ink)" }}
            onFocus={(e) => { e.target.style.borderColor = "var(--electric)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--input-border)"; }}
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
