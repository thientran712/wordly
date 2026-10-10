"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { History, Trash2, X, Volume2, ChevronDown, Loader2, BookmarkCheck, Undo2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import SuggestionHistoryTab from "@/components/home/SuggestionHistoryTab";

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
  const [activeTab, setActiveTab] = useState("history"); // 'history' | 'suggestions'
  const [confirmClear, setConfirmClear] = useState(false);
  // Thanh "Hoàn tác" sau khi xoá — xoá là xoá mềm, ids lấy từ API
  const [undo, setUndo] = useState(null); // { label, ids, snapshot }
  const undoTimer = useRef(null);

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

  // Còn thanh "Hoàn tác" thì vẫn hiện, kể cả khi vừa xoá sạch danh sách
  if (!isLoggedIn) return null;

  const showUndo = (label, ids, snapshot) => {
    clearTimeout(undoTimer.current);
    setUndo({ label, ids, snapshot });
    undoTimer.current = setTimeout(() => setUndo(null), 6000);
  };

  const removeWhere = (pred) =>
    setGroups(prev => prev.map(g => ({ ...g, entries: g.entries.filter(e => !pred(e)) }))
      .filter(g => g.entries.length > 0));

  const handleDelete = async (id) => {
    const snapshot = groups;
    removeWhere(e => e.id === id);
    const res = await fetch(`/api/translate-history?id=${id}`, { method: "DELETE" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data?.ids?.length) showUndo("Đã xoá 1 mục", data.ids, snapshot);
  };

  // "Xoá hết" chỉ xoá mục CHƯA lưu — từ đã lưu luôn được giữ (server cũng làm vậy)
  const handleClear = async () => {
    setConfirmClear(false);
    const snapshot = groups;
    removeWhere(e => !e.is_saved);
    const res = await fetch("/api/translate-history", { method: "DELETE" }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (data?.ids?.length) showUndo(`Đã xoá ${data.ids.length} mục`, data.ids, snapshot);
  };

  const handleUndo = async () => {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    setGroups(undo.snapshot);
    const ids = undo.ids;
    setUndo(null);
    await fetch("/api/translate-history/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => null);
  };

  const unsavedCount = groups.reduce((s, g) => s + g.entries.filter(e => !e.is_saved).length, 0);

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
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform duration-200 ml-1"
          style={{ color: "var(--ink-soft)", transform: collapsed ? "rotate(0deg)" : "rotate(180deg)" }}
        />
      </div>

      {/* Tab switcher */}
      {!collapsed && (
        <div className="flex gap-1 px-4 pt-2" style={{ borderBottom: "1px solid var(--divider)" }}>
          <button
            onClick={() => setActiveTab("history")}
            className="text-xs font-semibold px-3 py-1.5 rounded-t-lg"
            style={{
              color: activeTab === "history" ? "var(--electric)" : "var(--ink-soft)",
              borderBottom: activeTab === "history" ? "2px solid var(--electric)" : "2px solid transparent",
            }}
          >
            Lịch sử dịch
          </button>
          <button
            onClick={() => setActiveTab("suggestions")}
            className="text-xs font-semibold px-3 py-1.5 rounded-t-lg"
            style={{
              color: activeTab === "suggestions" ? "var(--electric)" : "var(--ink-soft)",
              borderBottom: activeTab === "suggestions" ? "2px solid var(--electric)" : "2px solid transparent",
            }}
          >
            Đã gợi ý
          </button>
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <>
          {activeTab === "history" && (
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

              {/* "Xoá hết" ở cuối danh sách — trước đây nằm sát mũi tên thu gọn, hay bị bấm nhầm */}
              {unsavedCount > 0 && (
                <div className="px-4 py-3 flex justify-end" style={{ borderTop: "1px solid var(--divider)" }}>
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="no-min-h flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
                    style={{ color: "var(--error)", background: "var(--error-soft)" }}
                  >
                    <Trash2 size={12} /> Xoá lịch sử chưa lưu
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "suggestions" && <SuggestionHistoryTab isLoggedIn={isLoggedIn} />}
        </>
      )}

      {undo && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 text-xs font-semibold"
          style={{ borderTop: "1px solid var(--divider)", background: "var(--hover-bg)", color: "var(--ink)" }}
        >
          <span className="flex-1">{undo.label}</span>
          <button
            onClick={handleUndo}
            className="no-min-h flex items-center gap-1 px-2.5 py-1 rounded-lg"
            style={{ color: "var(--electric)", background: "var(--green-subtle)" }}
          >
            <Undo2 size={12} /> Hoàn tác
          </button>
        </div>
      )}

      {confirmClear && (
        <Modal onClose={() => setConfirmClear(false)}>
          <h3 className="font-bold text-lg mb-2" style={{ color: "var(--ink)" }}>Xoá lịch sử dịch?</h3>
          <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
            Xoá {unsavedCount} mục chưa lưu. Các từ bạn đã bấm <b>Lưu</b> sẽ được giữ lại
            (vẫn có trong quiz, email và widget). Bạn có thể hoàn tác ngay sau khi xoá.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>Huỷ</Button>
            <Button variant="danger" onClick={handleClear}>Xoá</Button>
          </div>
        </Modal>
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
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
          >
            {direction}
          </span>
          {entry.is_saved && (
            <span
              className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
              title="Đã lưu — sẽ được nhắc ôn tập qua email"
            >
              <BookmarkCheck size={9} /> Đã lưu
            </span>
          )}
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
