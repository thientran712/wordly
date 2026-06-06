"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, GraduationCap, Loader2, X } from "lucide-react";

export default function JournalFAB({ dueCount = 0, onAdded }) {
  const [isOpen, setIsOpen] = useState(false);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!word.trim()) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: word.trim(), meaning_vi: meaning }),
      });
      if (res.ok) {
        setWord(""); setMeaning("");
        setIsOpen(false);
        onAdded?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)" }}
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Popup — bottom sheet on mobile, floating card on desktop */}
      {isOpen && (
        <>
          {/* Mobile: bottom sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[100] sm:hidden rounded-t-3xl px-5 pt-4 pb-safe animate-slide-up"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--green-subtle-border)",
              borderBottom: "none",
              boxShadow: "0 -16px 48px rgba(0,0,0,0.4)",
            }}
          >
            {/* Pull handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "var(--divider)" }} />
            <PopupContent
              word={word} setWord={setWord}
              meaning={meaning} setMeaning={setMeaning}
              isLoading={isLoading} dueCount={dueCount}
              onClose={() => setIsOpen(false)}
              onSubmit={handleSubmit}
              onReview={() => router.push("/journal/review")}
            />
          </div>

          {/* Desktop: floating card above FAB */}
          <div
            className="hidden sm:block fixed bottom-[88px] right-6 z-[100] w-76 rounded-3xl p-5 animate-slide-up"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--green-subtle-border)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.35)",
            }}
          >
            <PopupContent
              word={word} setWord={setWord}
              meaning={meaning} setMeaning={setMeaning}
              isLoading={isLoading} dueCount={dueCount}
              onClose={() => setIsOpen(false)}
              onSubmit={handleSubmit}
              onReview={() => router.push("/journal/review")}
            />
          </div>
        </>
      )}

      {/* FAB button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-5 right-4 sm:right-6 z-[100] w-14 h-14 rounded-full text-black flex items-center justify-center active:scale-95 transition-all no-min-h"
        style={{ bottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + 0.5rem))" }}
        style={{
          background: "var(--electric)",
          boxShadow: isOpen
            ? "0 8px 24px rgba(34,197,94,0.6)"
            : "0 6px 20px rgba(34,197,94,0.45)",
        }}
        title="Quick Journal"
      >
        {dueCount > 0 && !isOpen && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ background: "#FFFFFF", color: "#0A0A0A", border: "2px solid var(--card-bg)" }}
          >
            {dueCount > 9 ? "9+" : dueCount}
          </span>
        )}
        <NotebookPen size={21} />
      </button>
    </>
  );
}

function PopupContent({ word, setWord, meaning, setMeaning, isLoading, dueCount, onClose, onSubmit, onReview }) {
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <NotebookPen size={15} style={{ color: "var(--electric)" }} />
          <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Quick Journal</span>
        </div>
        <div className="flex items-center gap-2">
          {dueCount > 0 && (
            <button
              type="button"
              onClick={onReview}
              className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full text-black active:scale-95 transition-all"
              style={{ background: "var(--electric)" }}
            >
              <GraduationCap size={11} />
              Ôn {dueCount}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-95 transition-colors"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <input
          type="text"
          value={word}
          onChange={e => setWord(e.target.value)}
          placeholder="Từ mới..."
          autoFocus
          autoComplete="off"
          className="w-full px-4 py-3 rounded-2xl text-sm font-semibold focus:outline-none transition-all"
          style={{
            background: "var(--input-bg)",
            border: "1.5px solid var(--input-border)",
            color: "var(--ink)",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(34,197,94,0.5)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--input-border)"; }}
        />
        <input
          type="text"
          value={meaning}
          onChange={e => setMeaning(e.target.value)}
          placeholder="Nghĩa tiếng Việt (tuỳ chọn)"
          autoComplete="off"
          className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all"
          style={{
            background: "var(--input-bg)",
            border: "1.5px solid var(--input-border)",
            color: "var(--ink)",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(34,197,94,0.5)"; }}
          onBlur={e => { e.target.style.borderColor = "var(--input-border)"; }}
        />
        <button
          type="submit"
          disabled={isLoading || !word.trim()}
          className="w-full py-3 rounded-2xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 active:scale-95 transition-all"
          style={{
            background: "var(--electric)",
            color: "#0A0A0A",
            boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
          }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Save to Journal
        </button>
      </form>
    </>
  );
}
