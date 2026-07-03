"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Mic } from "lucide-react";

const CIRCUMFERENCE = 2 * Math.PI * 120; // r=120

function fmt(s) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

// Ported from TimerModal.astro. Opened imperatively via the `open` prop
// (parent flips it true on "Start Timer" click) rather than a global custom
// event, since this is now a proper React component instead of an Astro island.
export default function TimerModal({ open, onClose, defaultSeconds = 60, topicLabel }) {
  const [totalSecs, setTotalSecs] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const intervalRef = useRef(null);

  const pause = useCallback(() => {
    setRunning(false);
    clearInterval(intervalRef.current);
  }, []);

  const reset = useCallback(() => {
    pause();
    setJustFinished(false);
    setTotalSecs(defaultSeconds);
    setRemaining(defaultSeconds);
  }, [pause, defaultSeconds]);

  // Reset whenever the modal (re)opens with a new topic/question/word.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const start = () => {
    if (remaining <= 0) return;
    setJustFinished(false);
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          setJustFinished(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
  };

  const adjust = (delta) => {
    setTotalSecs((prev) => {
      const next = Math.max(30, Math.min(300, prev + delta));
      setRemaining((r) => (delta < 0 ? Math.min(r, next) : (running ? r : next)));
      return next;
    });
  };

  const handleClose = () => {
    pause();
    onClose?.();
  };

  if (!open) return null;

  const pct = totalSecs > 0 ? remaining / totalSecs : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);
  const ringColor = justFinished ? "var(--duo-orange)" : running ? "var(--electric)" : "var(--electric)";

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative w-full flex flex-col items-center animate-slide-up overflow-hidden"
        style={{
          maxWidth: 480,
          borderRadius: 40,
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
          padding: "2.5rem 2.5rem 2rem",
        }}
      >
        {/* Decorative glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: -120, left: "50%", transform: "translateX(-50%)",
            width: 400, height: 400, borderRadius: "50%",
            background: running
              ? "radial-gradient(circle, rgba(var(--electric-rgb),0.18), transparent 70%)"
              : "radial-gradient(circle, rgba(var(--electric-rgb),0.08), transparent 70%)",
            transition: "background 0.4s ease",
          }}
        />

        <button
          onClick={handleClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 z-10"
          style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
        >
          <X size={18} />
        </button>

        {/* Status pill */}
        <div
          className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full mb-4"
          style={{
            background: running ? "var(--green-subtle)" : "var(--hover-bg)",
            border: running ? "1px solid var(--green-subtle-border)" : "1px solid transparent",
          }}
        >
          {running && <Mic size={12} style={{ color: "var(--electric)" }} className="animate-pulse" />}
          <span className="text-[11px] font-bold tracking-wide uppercase" style={{ color: running ? "var(--electric)" : "var(--ink-soft)" }}>
            {justFinished ? "Hết giờ!" : running ? "Đang luyện nói" : "Sẵn sàng"}
          </span>
        </div>

        {/* Topic */}
        <p className="text-center font-bold leading-snug mb-6 px-2" style={{ color: "var(--ink)", fontSize: "1.375rem", maxWidth: 400 }}>
          {topicLabel || "—"}
        </p>

        {/* Ring */}
        <div className="relative flex items-center justify-center mb-6" style={{ width: 280, height: 280 }}>
          <svg viewBox="0 0 260 260" className="absolute inset-0" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="130" cy="130" r="120" fill="none" stroke="var(--line)" strokeWidth="14" />
            <circle
              cx="130" cy="130" r="120" fill="none"
              stroke={ringColor} strokeWidth="14" strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
            />
          </svg>
          <div className="flex flex-col items-center">
            <div className="font-black tabular-nums" style={{ color: "var(--ink)", fontSize: "4rem", letterSpacing: "-3px", lineHeight: 1 }}>
              {fmt(remaining)}
            </div>
            <span className="text-xs font-semibold mt-1" style={{ color: "var(--ink-ghost)" }}>
              / {fmt(totalSecs)}
            </span>
          </div>
        </div>

        {/* +/- adjust */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => adjust(-30)}
            disabled={running}
            className="px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ border: "1.5px solid var(--line)", color: "var(--ink)", background: "var(--surface)" }}
          >
            − 0:30
          </button>
          <button
            onClick={() => adjust(30)}
            disabled={running}
            className="px-6 py-2.5 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ border: "1.5px solid var(--line)", color: "var(--ink)", background: "var(--surface)" }}
          >
            + 0:30
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <button
            onClick={reset}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90"
            style={{ background: "var(--hover-bg)", color: "var(--ink)" }}
          >
            <RotateCcw size={22} />
          </button>
          <button
            onClick={() => (running ? pause() : start())}
            className="rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105"
            style={{
              width: 84, height: 84,
              background: running
                ? "linear-gradient(135deg, var(--electric-muted), var(--electric))"
                : "linear-gradient(135deg, var(--electric), var(--electric-muted))",
              color: "var(--on-electric)",
              boxShadow: "0 8px 28px rgba(var(--electric-rgb),0.45)",
            }}
          >
            {running ? <Pause size={30} /> : <Play size={30} style={{ marginLeft: 3 }} />}
          </button>
          <div className="w-16" />
        </div>
      </div>
    </div>
  );
}
