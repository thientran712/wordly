"use client";

import { useState, useEffect } from "react";
import { History, Trash2, X, Volume2, ArrowLeftRight, ChevronDown } from "lucide-react";
import { getHistory, deleteFromHistory, clearHistory, groupByDate } from "@/lib/translate-history";

function speak(text, lang = "en-US") {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  window.speechSynthesis.speak(utter);
}

export default function TranslateHistory({ refreshToken, onPick }) {
  const [groups, setGroups] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setGroups(groupByDate(getHistory()));
  }, [refreshToken]);

  if (groups.length === 0) return null;

  const handleDelete = (id) => {
    deleteFromHistory(id);
    setGroups(groupByDate(getHistory()));
  };

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    clearHistory();
    setGroups([]);
    setConfirmClear(false);
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
        <span
          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
        >
          {totalCount}
        </span>
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
        <div className="divide-y" style={{ borderColor: "var(--divider)" }}>
          {groups.map(({ day, dateLabel, entries }) => (
            <div key={day}>
              {/* Date header */}
              <div
                className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider sticky top-0"
                style={{ background: "var(--card-bg)", color: "var(--ink-soft)", zIndex: 1 }}
              >
                {dateLabel}
              </div>

              {/* Entries */}
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
        </div>
      )}
    </div>
  );
}

function HistoryEntry({ entry, onDelete, onPick }) {
  const isEN = entry.direction === "EN→VI";
  const srcLang = isEN ? "en-US" : "vi-VN";
  const tgtLang = isEN ? "vi-VN" : "en-US";

  return (
    <div
      className="group flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer"
      style={{ borderTop: "1px solid var(--divider)" }}
      onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
      onClick={() => onPick?.(entry)}
    >
      {/* Text block */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {entry.text}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
            style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
          >
            {entry.direction}
          </span>
        </div>
        <span className="text-xs leading-snug" style={{ color: "var(--ink-soft)" }}>
          {entry.translated}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={e => { e.stopPropagation(); speak(entry.text, srcLang); }}
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
