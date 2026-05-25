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
        setWord("");
        setMeaning("");
        setIsOpen(false);
        onAdded?.();
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-[90]" onClick={() => setIsOpen(false)} />
      )}

      {isOpen && (
        <div
          className="fixed bottom-[88px] right-4 sm:right-6 z-[100] w-72 rounded-3xl p-5 animate-slide-up"
          style={{
            background: "#1A1A1A",
            border: "1px solid rgba(34,197,94,0.2)",
            boxShadow: "0 20px 48px rgba(0,0,0,0.6)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <NotebookPen size={15} style={{ color: "var(--electric)" }} />
              <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Quick Journal</span>
            </div>
            <div className="flex items-center gap-2">
              {dueCount > 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/journal/review")}
                  className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full text-black"
                  style={{ background: "var(--electric)" }}
                >
                  <GraduationCap size={11} />
                  Ôn {dueCount}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--ink-soft)" }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <input
              type="text"
              value={word}
              onChange={e => setWord(e.target.value)}
              placeholder="Từ mới..."
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-2.5 rounded-2xl text-sm font-semibold focus:outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                color: "var(--ink)",
              }}
              onFocus={e => { e.target.style.borderColor = "rgba(34,197,94,0.5)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
            <input
              type="text"
              value={meaning}
              onChange={e => setMeaning(e.target.value)}
              placeholder="Nghĩa tiếng Việt (tuỳ chọn)"
              autoComplete="off"
              className="w-full px-4 py-2.5 rounded-2xl text-sm focus:outline-none transition-all"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.1)",
                color: "var(--ink)",
              }}
              onFocus={e => { e.target.style.borderColor = "rgba(34,197,94,0.5)"; }}
              onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
            <button
              type="submit"
              disabled={isLoading || !word.trim()}
              className="w-full py-2.5 rounded-2xl font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
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
        </div>
      )}

      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-4 sm:right-6 z-[100] w-14 h-14 rounded-full text-black flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: "var(--electric)",
          boxShadow: isOpen
            ? "0 8px 24px rgba(34,197,94,0.6)"
            : "0 8px 24px rgba(34,197,94,0.4)",
        }}
        title="Quick Journal"
      >
        {dueCount > 0 && !isOpen && (
          <span
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-black text-[10px] font-bold flex items-center justify-center"
            style={{
              background: "#FFFFFF",
              border: "2px solid #0A0A0A",
            }}
          >
            {dueCount > 9 ? "9+" : dueCount}
          </span>
        )}
        <NotebookPen size={21} />
      </button>
    </>
  );
}
