"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Trash2, X, Volume2, ChevronDown, Loader2 } from "lucide-react";

async function speak(text, lang = "en-US") {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (!res.ok) throw new Error("TTS API failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play();
  } catch {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  }
}

function groupByDate(history) {
  const map = new Map();
  for (const entry of history) {
    const day = (entry.saved_at || entry.date || "").slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(entry);
  }
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return Array.from(map.entries()).map(([day, entries]) => ({
    day,
    dateLabel: day === today ? "Hôm nay" : day === yesterday ? "Hôm qua" : formatDate(day),
    entries,
  }));
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "numeric" });
}

const PAGE_SIZE = 20;

export default function TranslateHistory({ refreshToken, onPick, isLoggedIn = false }) {
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/translate-history?limit=${PAGE_SIZE}&offset=0`);
      const data = await res.json();
      setGroups(groupByDate(data.history || []));
      setHasMore(data.hasMore ?? false);
      setOffset(PAGE_SIZE);
    } catch {
      setGroups([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/translate-history?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      setGroups(prev => {
        // Merge new entries into existing groups by date
        const merged = [...prev];
        for (const entry of (data.history || [])) {
          const day = (entry.saved_at || "").slice(0, 10);
          const existing = merged.find(g => g.day === day);
          if (existing) {
            existing.entries.push(entry);
          } else {
            const today = new Date().toISOString().slice(0, 10);
            const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
            merged.push({
              day,
              dateLabel: day === today ? "Hôm nay" : day === yesterday ? "Hôm qua" : formatDate(day),
              entries: [entry],
            });
          }
        }
        return merged;
      });
      setHasMore(data.hasMore ?? false);
      setOffset(prev => prev + PAGE_SIZE);
    } catch {
      // silently fail — existing entries stay visible
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => { fetchHistory(); }, [fetchHistory, refreshToken]);

  if (!isLoggedIn || (groups.length === 0 && !isLoading)) return null;

  const handleDelete = async (id) => {
    setGroups(prev => {
      const next = prev.map(g => ({ ...g, entries: g.entries.filter(e => e.id !== id) }))
        .filter(g => g.entries.length > 0);
      return next;
    });
    fetch(`/api/translate-history?id=${id}`, { method: "DELETE" }).catch(() => null);
  };

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    setGroups([]);
    setConfirmClear(false);
    fetch("/api/translate-history", { method: "DELETE" }).catch(() => null);
  };

  const totalCount = groups.reduce((s, g) => s + g.entries.length, 0);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
        onClick={() => setCollapsed(v => !v)}
        style={{ borderBottom: collapsed ? "none" : "1px solid var(--divider)" }}
      >
        <History size={14} style={{ color: "var(--electric)" }} />
        <span className="font-bold text-sm flex-1" style={{ color: "var(--ink)" }}>
          Lịch sử dịch
        </span>
        {isLoading ? (
          <Loader2 size={12} className="animate-spin" style={{ color: "var(--electric)" }} />
        ) : (
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
          >
            {totalCount}
          </span>
        )}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); handleClear(); }}
          className="no-min-h flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg active:scale-95 transition-all ml-1"
          style={{ color: confirmClear ? "var(--error)" : "var(--ink-soft)", background: confirmClear ? "var(--error-soft)" : "var(--hover-bg)" }}
        >
          <Trash2 size={11} />
          {confirmClear ? "Chắc chắn?" : "Xoá hết"}
        </button>
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform duration-200 ml-1"
          style={{ color: "var(--ink-soft)", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </div>

      {/* Body */}
      {!collapsed && (
        <div>
          {groups.map(({ day, dateLabel, entries }) => (
            <div key={day}>
              <div
                className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider sticky top-0"
                style={{ background: "var(--card-bg)", color: "var(--ink-soft)", zIndex: 1 }}
              >
                {dateLabel}
              </div>
              {entries.map(entry => (
                <HistoryEntry
                  key={entry.id}
                  entry={entry}
                  onDelete={() => handleDelete(entry.id)}
                  onPick={onPick}
                />
              ))}
            </div>
          ))}

          {hasMore && (
            <div className="px-4 py-3 flex justify-center">
              <button
                onClick={loadMore}
                disabled={isLoadingMore}
                className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                style={{ background: "var(--hover-bg)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
              >
                {isLoadingMore
                  ? <><Loader2 size={12} className="animate-spin" /> Đang tải...</>
                  : <><ChevronDown size={12} /> Tải thêm</>}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry, onDelete, onPick }) {
  const text = entry.source_text || entry.text || "";
  const translated = entry.translated_text || entry.translated || "";
  const direction = entry.direction || "EN→VI";
  const isEN = direction === "EN→VI";
  const srcLang = isEN ? "en-US" : "vi-VN";

  return (
    <div
      className="group flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer"
      style={{ borderTop: "1px solid var(--divider)" }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      onClick={() => onPick?.({ text, translated, direction })}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {text}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
          >
            {direction}
          </span>
        </div>
        <span className="text-xs leading-snug" style={{ color: "var(--ink-soft)" }}>
          {translated}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); speak(text, srcLang); }}
          className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all"
          style={{ background: "var(--hover-bg)", color: "var(--electric)" }}
        >
          <Volume2 size={12} />
        </button>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="no-min-h w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all"
          style={{ background: "var(--hover-bg)", color: "var(--error)" }}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
