"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Frown, Smile, Zap } from "lucide-react";

const RATINGS = [
  { rating: 1, label: "Không nhớ", icon: RotateCcw, color: "#E5405E", bg: "#FFF0F3", border: "#FFCCD6" },
  { rating: 2, label: "Khó",       icon: Frown,     color: "#E06030", bg: "#FFF3EE", border: "#FECDB8" },
  { rating: 3, label: "Nhớ",       icon: Smile,     color: "#059669", bg: "#F0FDF8", border: "#A7F3D0" },
  { rating: 4, label: "Dễ",        icon: Zap,       color: "#6C5CE7", bg: "#F5F3FF", border: "#C4B5FD" },
];

export default function JournalReviewPage() {
  const router = useRouter();
  const [entry, setEntry] = useState(null);
  const [dueCount, setDueCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRating, setIsRating] = useState(false);
  const [toast, setToast] = useState(null);
  const [done, setDone] = useState(false);

  const fetchNext = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/journal/review");
      const data = await res.json();
      setDueCount(data.due_count || 0);
      if (data.entry) {
        setEntry(data.entry);
        setDone(false);
      } else {
        setEntry(null);
        setDone(true);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchNext(); }, [fetchNext]);

  const handleRate = async (rating) => {
    if (isRating || !entry) return;
    setIsRating(true);
    try {
      const res = await fetch("/api/journal/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id, rating }),
      });
      const data = await res.json();
      if (data.success) {
        const messages = {
          1: "🔄 Sẽ nhắc lại sớm",
          2: "💪 Cần luyện thêm",
          3: `✓ Gặp lại sau ${data.scheduled_days} ngày`,
          4: `🚀 Thuộc rồi! Gặp lại sau ${data.scheduled_days} ngày`,
        };
        setToast(messages[rating]);
        setTimeout(() => setToast(null), 2000);
        setTimeout(() => fetchNext(), 600);
      }
    } finally {
      setIsRating(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (!entry) return;
      const map = { "1": 1, "2": 2, "3": 3, "4": 4 };
      if (map[e.key]) { e.preventDefault(); handleRate(map[e.key]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entry, isRating]);

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1" /><div className="blob blob-2" />
        <div className="blob blob-3" /><div className="blob blob-4" />
      </div>

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/journal")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-[var(--hover-bg)] hover:-translate-y-0.5 hover:shadow-sm"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Journal</span>
          </button>
          <h1 className="font-serif text-2xl font-bold tracking-tight">📖 Ôn tập</h1>
          <div className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: "#F0EDFC", color: "#6C5CE7" }}>
            {dueCount} ghi chú
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 rounded-full border-4 border-[--electric] border-t-transparent animate-spin" />
          </div>
        ) : done ? (
          /* All done */
          <div className="rounded-3xl p-10 text-center border-2"
            style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", boxShadow: "0 8px 32px rgba(108,92,231,0.10)" }}>
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="font-serif text-2xl font-bold mb-2">Xong rồi!</h2>
            <p className="text-[--ink-soft] text-sm mb-6">Không còn ghi chú nào cần ôn hôm nay.</p>
            <button
              onClick={() => router.push("/journal")}
              className="px-6 py-3 rounded-2xl font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #6C5CE7, #a29bfe)", boxShadow: "0 8px 20px rgba(108,92,231,0.2)" }}
            >
              Về Journal
            </button>
          </div>
        ) : (
          /* Note card */
          <div className="animate-fade-in">
            <div
              className="rounded-3xl border-2 mb-4 overflow-hidden"
              style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", boxShadow: "0 8px 32px rgba(45,27,78,0.08)", minHeight: "180px" }}
            >
              <div className="px-8 py-10 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[--ink-soft] opacity-50 mb-4">
                  {entry.state === "new" ? "✨ Ghi chú mới" : `🔄 Ôn lần ${entry.review_count}`}
                </p>
                <p className="text-xl font-semibold leading-relaxed text-[--ink] whitespace-pre-wrap">
                  {entry.content}
                </p>
              </div>
            </div>

            <p className="text-center text-xs text-[--ink-soft] opacity-60 mb-3">
              Bạn còn nhớ / hiểu rõ điều này không?
            </p>

            {/* Rating buttons */}
            <div className="grid grid-cols-4 gap-2 animate-fade-in">
              {RATINGS.map((r, i) => (
                <button
                  key={r.rating}
                  onClick={() => handleRate(r.rating)}
                  disabled={isRating}
                  className="py-4 rounded-2xl border-2 font-bold text-xs flex flex-col items-center gap-1.5 cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 hover:shadow-md transition-all"
                  style={{ background: r.bg, borderColor: r.border, color: r.color }}
                >
                  <r.icon size={16} />
                  <span>{r.label}</span>
                  <span className="opacity-40 font-normal text-[10px]">[{i + 1}]</span>
                </button>
              ))}
            </div>

            <p className="text-center text-[10px] text-[--ink-soft] opacity-30 mt-4">
              Phím 1–4 để đánh giá
            </p>
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-full font-semibold text-sm z-[200] shadow-[0_20px_48px_rgba(45,27,78,0.12)] border-2 border-[--mint] text-[--grass] animate-fade-in" style={{ background: "var(--card-bg)" }}>
          {toast}
        </div>
      )}
    </>
  );
}
