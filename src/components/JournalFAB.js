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
          className="fixed bottom-[88px] right-4 sm:right-6 z-[100] w-72 bg-white rounded-3xl p-5 animate-slide-up"
          style={{ boxShadow: "0 20px 48px rgba(45,27,78,0.18), 0 0 0 1.5px var(--line)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <NotebookPen size={15} className="text-[--electric]" />
              <span className="font-bold text-sm text-[--ink]">Quick Journal</span>
            </div>
            <div className="flex items-center gap-2">
              {dueCount > 0 && (
                <button
                  type="button"
                  onClick={() => router.push("/journal/review")}
                  className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full text-white"
                  style={{ background: "linear-gradient(135deg,var(--electric),var(--electric-muted))" }}
                >
                  <GraduationCap size={11} />
                  Ôn {dueCount}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-xl bg-[--whisper] flex items-center justify-center text-[--ink-soft] hover:bg-[--line] transition-colors"
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
              className="w-full px-4 py-2.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-sm font-semibold focus:outline-none focus:border-[--electric] focus:bg-white transition-all"
            />
            <input
              type="text"
              value={meaning}
              onChange={e => setMeaning(e.target.value)}
              placeholder="Nghĩa tiếng Việt (tuỳ chọn)"
              autoComplete="off"
              className="w-full px-4 py-2.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-sm focus:outline-none focus:border-[--electric] focus:bg-white transition-all"
            />
            <button
              type="submit"
              disabled={isLoading || !word.trim()}
              className="w-full py-2.5 rounded-2xl text-white font-bold text-sm disabled:opacity-40 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg,var(--electric),var(--hot-pink))", boxShadow: "0 4px 16px rgba(108,92,231,0.25)" }}
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Save to Journal
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-4 sm:right-6 z-[100] w-14 h-14 rounded-full text-white flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: "linear-gradient(135deg,var(--electric),var(--hot-pink))",
          boxShadow: isOpen
            ? "0 8px 24px rgba(108,92,231,0.5)"
            : "0 8px 24px rgba(108,92,231,0.35)",
        }}
        title="Quick Journal"
      >
        {dueCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[--hot-pink] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[--cream]">
            {dueCount > 9 ? "9+" : dueCount}
          </span>
        )}
        <NotebookPen size={21} />
      </button>
    </>
  );
}
