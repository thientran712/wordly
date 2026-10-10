// Tab "Đã gợi ý" trong trang Lịch sử: liệt kê từ đã gửi qua email/widget,
// click vào từ mở popup tra nghĩa AI (dùng lại WordDefinitions) kèm 3 nút
// Dễ/Khó/Bỏ qua lâu hơn để tự điều chỉnh due_at.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Smartphone, Loader2, ChevronDown } from "lucide-react";
import Modal from "@/components/ui/Modal";
import WordDefinitions from "@/components/ui/WordDefinitions";
import { lookupWord, normalizeWordKey } from "@/lib/ai/dictionary-client";

const PAGE_SIZE = 20;

const STATE_LABEL = {
  new: "Mới",
  review: "Đang ôn",
  relearning: "Đang học lại",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SuggestionHistoryTab({ isLoggedIn = false }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null); // the clicked item, opens the popup

  const fetchItems = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/suggestion-log?limit=${PAGE_SIZE}&offset=0`);
      const data = await res.json();
      setItems(data.items || []);
      setHasMore(data.hasMore ?? false);
      setOffset(PAGE_SIZE);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/suggestion-log?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      setItems(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.hasMore ?? false);
      setOffset(prev => prev + PAGE_SIZE);
    } catch {
      // silently fail — existing items stay visible
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (!isLoggedIn) return null;

  if (!isLoading && items.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
        Chưa có từ nào được gợi ý qua email hoặc widget.
      </p>
    );
  }

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--electric)" }} />
        </div>
      ) : (
        items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ borderTop: "1px solid var(--divider)" }}
          >
            {item.source === "email" ? <Mail size={13} style={{ color: "var(--ink-soft)" }} /> : <Smartphone size={13} style={{ color: "var(--ink-soft)" }} />}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.word}</span>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatDate(item.shown_at)}</span>
            </div>
            {item.state && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
              >
                {STATE_LABEL[item.state] || item.state}
              </span>
            )}
          </button>
        ))
      )}

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

      {selected && (
        <SuggestionDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onRated={(update) => {
            setItems(prev => prev.map(it => it.id === selected.id ? { ...it, ...update } : it));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function SuggestionDetailModal({ item, onClose, onRated }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(null); // which button is in-flight

  useEffect(() => {
    let active = true;
    (async () => {
      const key = normalizeWordKey(item.word);
      const { detail, error, notFound } = await lookupWord(key);
      if (!active) return;
      setDetail(detail);
      setError(error || (notFound ? `Không tìm thấy "${key}" trong từ điển.` : null));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [item.word]);

  const canRate = item.entry_type !== "bank";

  const rate = async (value) => {
    setRating(value);
    try {
      const res = await fetch("/api/learning/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_type: item.entry_type, entry_id: item.entry_id, rating: value }),
      });
      const data = await res.json();
      if (res.ok) onRated(data);
    } finally {
      setRating(null);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="font-bold text-lg mb-3" style={{ color: "var(--ink)" }}>{item.word}</h3>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--electric)" }} />
        </div>
      ) : error ? (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{error}</p>
      ) : detail ? (
        <WordDefinitions detail={detail} />
      ) : null}

      {canRate && (
        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <button
            onClick={() => rate("hard")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--error-soft)", color: "var(--error)" }}
          >
            Khó
          </button>
          <button
            onClick={() => rate("easy")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--green-subtle)", color: "var(--electric)" }}
          >
            Dễ
          </button>
          <button
            onClick={() => rate("skip_longer")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            Bỏ qua lâu hơn
          </button>
        </div>
      )}
    </Modal>
  );
}
