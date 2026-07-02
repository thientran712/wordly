"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, BookMarked, Loader2 } from "lucide-react";
import BackButton from "@/components/ui/BackButton";

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
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    fetch("/api/journal").then(r => r.json())
      .then(journalData => setEntries(journalData.entries || []))
      .catch(() => {}).finally(() => setIsLoading(false));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.entry) {
        setEntries(prev => [data.entry, ...prev]);
        setContent("");
        contentRef.current?.focus();
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
          <BackButton label="Quay lại" />
          <h1 className="text-3xl font-bold tracking-tight">📓 Journal</h1>
          <div className="w-20" />
        </div>

        {/* Add form */}
        <form
          onSubmit={handleAdd}
          className="rounded-3xl p-5 sm:p-6 border-2 mb-6"
          style={{ background: "var(--card-bg)", borderColor: "var(--card-border)", boxShadow: "0 8px 24px rgba(var(--electric-rgb),0.10)" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider text-[--ink-soft] mb-3">
            ✏️ Ghi chú mới
          </p>
          <div className="flex flex-col gap-2.5">
            <textarea
              ref={contentRef}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Câu, bài học, hoặc câu hỏi bạn gặp hôm nay..."
              rows={3}
              onFocus={e => { e.target.style.boxShadow = "0 0 0 3px var(--green-subtle)"; }}
              onBlur={e => { e.target.style.boxShadow = "none"; }}
              className="w-full px-4 py-3 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-[var(--card-bg)] transition-all text-[--ink] resize-none"
            />
            <button
              type="submit"
              disabled={isAdding || !content.trim()}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border-none cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-40"
              style={{
                background: "var(--electric)",
                color: "var(--on-electric)",
                boxShadow: "0 8px 20px rgba(var(--electric-rgb),0.3)",
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
            <p className="font-semibold text-[--ink-soft]">Chưa có ghi chú nào</p>
            <p className="text-sm text-[--ink-soft] mt-1 opacity-70">Ghi lại điều đầu tiên bạn học được hôm nay</p>
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
                      className="rounded-2xl px-4 py-3.5 border-2 border-[--line] flex items-start gap-3 group"
                      style={{ background: "var(--card-bg)", boxShadow: "0 2px 8px rgba(var(--electric-rgb),0.05)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug text-[--ink] whitespace-pre-wrap">
                          {entry.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-[--ink-soft] opacity-50 tabular-nums">
                          {timeAgo(entry.created_at)}
                        </span>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="w-7 h-7 rounded-xl flex items-center justify-center text-[--ink-soft] opacity-0 group-hover:opacity-100 hover:bg-[var(--error-soft)] hover:text-[var(--error)] transition-all disabled:opacity-30"
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
            {entries.length} ghi chú
          </p>
        )}
      </main>
    </>
  );
}
