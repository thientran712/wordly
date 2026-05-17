"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, BookMarked, Loader2, GraduationCap } from "lucide-react";

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return "vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function groupByDate(entries) {
  const groups = {};
  for (const entry of entries) {
    const date = new Date(entry.created_at);
    const key = date.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return Object.entries(groups);
}

export default function JournalPage() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dueCount, setDueCount] = useState(0);
  const [word, setWord] = useState("");
  const [meaningVi, setMeaningVi] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const wordRef = useRef(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/journal").then(r => r.json()),
      fetch("/api/journal/review").then(r => r.json()),
    ]).then(([journalData, reviewData]) => {
      setEntries(journalData.entries || []);
      setDueCount(reviewData.due_count || 0);
    }).catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!word.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, meaning_vi: meaningVi }),
      });
      const data = await res.json();
      if (data.entry) {
        setEntries(prev => [data.entry, ...prev]);
        setWord("");
        setMeaningVi("");
        wordRef.current?.focus();
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      setEntries(prev => prev.filter(e => e.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const groups = groupByDate(entries);

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
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/60 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-3xl font-bold tracking-tight">📓 Journal</h1>
          <button
            onClick={() => router.push("/journal/review")}
            disabled={dueCount === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl font-bold text-sm text-white disabled:opacity-40 hover:-translate-y-0.5 hover:opacity-90 transition-all"
            style={{ background: "linear-gradient(135deg, #6C5CE7, #a29bfe)", boxShadow: "0 6px 16px rgba(108,92,231,0.25)" }}
          >
            <GraduationCap size={15} />
            Ôn tập
            {dueCount > 0 && (
              <span className="bg-white/30 rounded-full px-1.5 text-xs">{dueCount}</span>
            )}
          </button>
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-white mb-6"
          style={{ boxShadow: "0 8px 24px rgba(108,92,231,0.10)" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[--ink-soft] mb-3">
            ✏️ Ghi từ mới
          </p>
          <div className="flex flex-col gap-2.5">
            <input
              ref={wordRef}
              type="text"
              value={word}
              onChange={e => setWord(e.target.value)}
              placeholder="Từ vựng (VD: resilient)"
              autoComplete="off"
              className="w-full px-4 py-3 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all font-semibold text-[--ink]"
            />
            <input
              type="text"
              value={meaningVi}
              onChange={e => setMeaningVi(e.target.value)}
              placeholder="Nghĩa tiếng Việt (VD: kiên cường, bền bỉ)"
              autoComplete="off"
              className="w-full px-4 py-3 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all text-[--ink]"
            />
            <button
              type="submit"
              disabled={isAdding || !word.trim()}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm text-white border-none cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-40"
              style={{
                background: "linear-gradient(135deg, #6C5CE7, #a29bfe)",
                boxShadow: "0 8px 20px rgba(108,92,231,0.2)",
              }}
            >
              {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {isAdding ? "Đang lưu..." : "Thêm vào journal"}
            </button>
          </div>
        </form>

        {/* Entries */}
        {isLoading ? (
          <div className="text-center py-16">
            <Loader2 size={28} className="animate-spin mx-auto text-[--electric] mb-3" />
            <p className="text-sm text-[--ink-soft]">Đang tải...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <BookMarked size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-semibold text-[--ink-soft]">Chưa có từ nào</p>
            <p className="text-sm text-[--ink-soft] mt-1 opacity-70">Ghi lại từ đầu tiên bạn bắt gặp hôm nay</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map(([dateLabel, dayEntries]) => (
              <div key={dateLabel}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[--ink-soft] opacity-50 mb-2 px-1">
                  {dateLabel}
                </p>
                <div className="space-y-2">
                  {dayEntries.map(entry => (
                    <div
                      key={entry.id}
                      className="bg-white rounded-2xl px-4 py-3.5 border-2 border-[--line] flex items-center gap-3 group"
                      style={{ boxShadow: "0 2px 8px rgba(108,92,231,0.05)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-serif font-bold text-lg leading-tight text-[--ink]">
                          {entry.word}
                        </p>
                        {entry.meaning_vi && (
                          <p className="text-sm text-[--ink-soft] mt-0.5 truncate">
                            🇻🇳 {entry.meaning_vi}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[--ink-soft] opacity-50 tabular-nums">
                          {timeAgo(entry.created_at)}
                        </span>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-[--ink-soft] opacity-0 group-hover:opacity-100 hover:bg-[#FFE8E8] hover:text-[#B83426] transition-all disabled:opacity-30"
                        >
                          {deletingId === entry.id
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {entries.length > 0 && (
          <p className="text-center text-xs text-[--ink-soft] opacity-40 mt-8">
            {entries.length} từ đã ghi
          </p>
        )}
      </main>
    </>
  );
}
