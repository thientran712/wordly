"use client";

import { X } from "lucide-react";

export default function Modal({ onClose, maxWidth = "28rem", children }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(8px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="rounded-2xl p-6 w-full max-h-[90vh] overflow-y-auto animate-slide-up relative"
        style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)", maxWidth }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 no-min-h"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            <X size={15} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
