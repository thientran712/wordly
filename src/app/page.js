"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import InlineTranslate from "@/components/InlineTranslate";
import TranslateHistory from "@/components/TranslateHistory";
import GuestBanner from "@/components/GuestBanner";
import { createClient } from "@/lib/supabase-client";
import { Volume2, RotateCcw, Frown, Smile, Zap, Bookmark, BookmarkCheck, ChevronDown } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Again", icon: RotateCcw, color: "#F87171",        bg: "rgba(248,113,113,0.08)",  border: "rgba(248,113,113,0.25)" },
  { rating: 2, label: "Hard",  icon: Frown,     color: "var(--ink-soft)", bg: "var(--hover-bg)",         border: "var(--input-border)" },
  { rating: 3, label: "Good",  icon: Smile,     color: "var(--electric)", bg: "var(--green-subtle)",     border: "var(--green-subtle-border)" },
  { rating: 4, label: "Easy",  icon: Zap,       color: "#0A0A0A",         bg: "var(--electric)",         border: "var(--electric)" },
];

function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "en-US"; utter.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find(v => v.lang.startsWith("en") && !v.name.includes("Google")) || voices.find(v => v.lang.startsWith("en"));
  if (v) utter.voice = v;
  window.speechSynthesis.speak(utter);
}

export default function Home() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = guest
  const [currentWord, setCurrentWord] = useState(null);
  const [currentSource, setCurrentSource] = useState("new");
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [userName, setUserName] = useState("");
  const [journalDueCount, setJournalDueCount] = useState(0);
  const [isWordExiting, setIsWordExiting] = useState(false);
  const [wordExpanded, setWordExpanded] = useState(false);
  const [historyToken, setHistoryToken] = useState(0); // bump to refresh history

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        // Unblock the page as soon as we know guest vs logged-in — the translate
        // widget + history can render immediately. Word card fills in async below.
        setUser(authUser || null);

        if (authUser) {
          // Fire all in parallel; each updates its own piece of UI when it lands,
          // so a slow query never blocks the rest of the page.
          supabase.from("profiles").select("name").eq("id", authUser.id).single()
            .then(({ data }) => {
              if (data) setUserName(data.name || authUser.email?.split("@")[0] || "");
            }).catch(() => {});

          fetch("/api/progress").then(r => r.json()).then(progressData => {
            if (progressData.progress) {
              const bookmarkIds = new Set();
              progressData.progress.forEach(p => { if (p.is_bookmarked) bookmarkIds.add(p.word_id); });
              setBookmarkedWordIds(bookmarkIds);
            }
          }).catch(() => {});

          fetch("/api/journal/review").then(r => r.json()).then(reviewData => {
            if (reviewData?.due_count) setJournalDueCount(reviewData.due_count);
          }).catch(() => {});

          fetchNextWord();
        }
      } catch (e) { console.error("Init error:", e); }
    }
    init();
  }, []);

  const fetchNextWord = async (excludeId = null, withAnimation = false) => {
    if (withAnimation) setIsWordExiting(true);
    try {
      const url = excludeId ? `/api/words/next?exclude=${excludeId}` : "/api/words/next";
      const fetchPromise = fetch(url).then(r => r.json());
      const data = withAnimation
        ? await Promise.all([fetchPromise, new Promise(r => setTimeout(r, 200))]).then(([d]) => d)
        : await fetchPromise;
      if (data.word) { setCurrentWord(data.word); setCurrentSource(data.source); setWordExpanded(false); }
    } catch (e) { console.error("Fetch word error:", e); }
    finally { if (withAnimation) setIsWordExiting(false); }
  };

  const handleRate = async (rating) => {
    if (!currentWord) return;
    try {
      const res = await fetch("/api/progress/rate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: currentWord.id, rating }),
      });
      const data = await res.json();
      if (data.success) {
        const msgs = {
          1: "🔄 Sẽ ôn lại sớm", 2: "💪 Cố lên!",
          3: `✓ Gặp lại sau ${data.progress?.next_review_in_days || 3} ngày`,
          4: `🚀 Xuất sắc! Gặp lại sau ${data.progress?.next_review_in_days || 7} ngày`,
        };
        showToast(msgs[rating]);
        if (rating >= 3) triggerConfetti();
        setTimeout(() => fetchNextWord(currentWord.id, true), 300);
      }
    } catch (e) { console.error("Rate error:", e); }
  };

  const toggleBookmark = async () => {
    if (!currentWord) return;
    const next = !bookmarkedWordIds.has(currentWord.id);
    const updated = new Set(bookmarkedWordIds);
    next ? updated.add(currentWord.id) : updated.delete(currentWord.id);
    setBookmarkedWordIds(updated);
    if (next) showToast("💖 Đã bookmark");
    try {
      await fetch("/api/progress/bookmark", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: currentWord.id, is_bookmarked: next }),
      });
    } catch (e) { console.error("Bookmark error:", e); }
  };

  const triggerConfetti = () => {
    const colors = ["#22C55E", "#4ADE80", "#86EFAC", "#16A34A", "#FBBF24", "#60A5FA"];
    for (let i = 0; i < 28; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "%";
      c.style.top = "30%";
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      c.style.animationDelay = Math.random() * 0.3 + "s";
      c.style.animationDuration = (1 + Math.random()) + "s";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const handler = (e) => {
      const map = { "1": 1, "2": 2, "3": 3, "4": 4 };
      if (map[e.key] && currentWord && !e.target.closest("textarea, input")) {
        e.preventDefault(); handleRate(map[e.key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentWord]);

  const isBookmarked = currentWord && bookmarkedWordIds.has(currentWord.id);
  const isGuest = user === null;

  // Handle picking an entry from history → fill translate
  const [translatePick, setTranslatePick] = useState(null);

  // Only block the whole page until we know guest vs logged-in. Everything else
  // (word card, bookmarks, due count) streams in afterwards.
  if (user === undefined) {
    return (
      <>
        <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /></div>
        <main className="relative z-10">
          <div className="h-14 animate-pulse" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--divider)" }} />
          <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3 animate-pulse">
            <div className="h-16 rounded-2xl" style={{ background: "var(--card-bg)" }} />
            <div className="h-56 rounded-2xl" style={{ background: "var(--card-bg)" }} />
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <div className="bg-blobs"><div className="blob blob-1" /><div className="blob blob-2" /><div className="blob blob-3" /><div className="blob blob-4" /></div>

      <main className="relative z-10">
        <Header
          userName={userName}
          isGuest={isGuest}
          dueCount={journalDueCount}
          onJournalAdded={() => { setJournalDueCount(c => c + 1); showToast("📝 Đã lưu vào Journal"); }}
        />

        <div className="max-w-2xl mx-auto px-3 sm:px-5 pb-12 space-y-3 pt-1">

          {/* ── Guest banner ── */}
          {isGuest && <GuestBanner />}

          {/* ── Word card skeleton while the first word loads ── */}
          {!isGuest && !currentWord && (
            <div className="h-12 rounded-2xl animate-pulse" style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)" }} />
          )}

          {/* ── Word of the Day strip (logged-in only) ── */}
          {!isGuest && currentWord && (
            <div
              className={`rounded-2xl overflow-hidden ${isWordExiting ? "word-exit" : ""}`}
              style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}
            >
              <div
                role="button"
                tabIndex={0}
                className="w-full flex items-center gap-2 px-3 py-3 sm:px-4 text-left cursor-pointer"
                onClick={() => setWordExpanded(v => !v)}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setWordExpanded(v => !v); }}
                style={{ background: "transparent" }}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full flex-shrink-0 leading-none"
                  style={{
                    background: currentSource === "review" ? "rgba(251,191,36,0.12)" : "var(--green-subtle)",
                    color: currentSource === "review" ? "#FBBF24" : "var(--electric)",
                    border: `1px solid ${currentSource === "review" ? "rgba(251,191,36,0.25)" : "var(--green-subtle-border)"}`,
                  }}
                >
                  {currentSource === "review" ? "Ôn tập" : currentSource === "email_today" ? "Email" : "Mới"}
                </span>

                <span className="font-black text-base sm:text-lg gradient-text-word leading-none flex-shrink-0">
                  {currentWord.word}
                </span>

                {currentWord.phonetic && (
                  <span className="text-xs hidden sm:inline flex-shrink-0" style={{ color: "var(--ink-soft)" }}>
                    /{currentWord.phonetic}/
                  </span>
                )}

                {currentWord.level && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 hidden sm:inline" style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}>
                    {currentWord.level}
                  </span>
                )}

                <span className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0 text-right" style={{ color: "var(--ink-soft)" }}>
                  {currentWord.meaning_vi}
                </span>

                <div className="flex items-center gap-1 flex-shrink-0 ml-1" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => speak(currentWord.word)}
                    className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                    style={{ background: "var(--green-subtle)", color: "var(--electric)" }}
                  >
                    <Volume2 size={14} />
                  </button>
                  <button
                    onClick={toggleBookmark}
                    className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95"
                    style={{ color: isBookmarked ? "#FBBF24" : "var(--ink-soft)", background: "var(--hover-bg)" }}
                  >
                    {isBookmarked ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                </div>

                <ChevronDown
                  size={14}
                  className="flex-shrink-0 transition-transform duration-200"
                  style={{ color: "var(--ink-soft)", transform: wordExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </div>

              {wordExpanded && (
                <div className="border-t px-3 sm:px-4 py-3 animate-fade-in" style={{ borderColor: "var(--divider)" }}>
                  {currentWord.definition && (
                    <p className="text-sm mb-3 leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                      {currentWord.definition}
                    </p>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {RATINGS.map(({ rating, label, icon: Icon, color, bg, border }) => (
                      <button
                        key={rating}
                        onClick={() => { setWordExpanded(false); handleRate(rating); }}
                        className="flex flex-col items-center gap-1 py-2.5 rounded-xl font-bold text-xs active:scale-95"
                        style={{ background: bg, border: `1.5px solid ${border}`, color }}
                      >
                        <Icon size={14} />
                        <span className="text-[11px]">{label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setWordExpanded(false); fetchNextWord(currentWord.id, true); }}
                    className="w-full mt-2 py-2 rounded-xl text-xs font-semibold active:scale-95"
                    style={{ color: "var(--ink-soft)", background: "var(--hover-bg)" }}
                  >
                    Bỏ qua →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Translate ── */}
          <div
            className="rounded-2xl overflow-visible"
            style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 4px 24px rgba(0,0,0,0.12)" }}
          >
            <InlineTranslate
              initialPick={translatePick}
              onTranslated={() => setHistoryToken(t => t + 1)}
              isLoggedIn={!isGuest}
            />
          </div>

          {/* ── Translation history ── */}
          <TranslateHistory
            refreshToken={historyToken}
            onPick={(entry) => {
              setTranslatePick(entry);
            }}
          />

        </div>
      </main>

      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full font-semibold text-sm z-[200] animate-fade-in border whitespace-nowrap"
          style={{ background: "var(--surface-elevated)", borderColor: "var(--green-subtle-border)", color: "var(--electric)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
