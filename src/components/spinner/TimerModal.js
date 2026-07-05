"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Pause, RotateCcw, Mic, ChevronDown } from "lucide-react";
import VocabSuggestions from "./VocabSuggestions";

const CIRCUMFERENCE = 2 * Math.PI * 120; // r=120

function fmt(s) {
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, "0");
  return `${m}:${ss}`;
}

// Ported from TimerModal.astro. Opened imperatively via the `open` prop
// (parent flips it true on "Start Timer" click) rather than a global custom
// event, since this is now a proper React component instead of an Astro island.
export default function TimerModal({ open, onClose, defaultSeconds = 60, topicLabel, vocabWords, vocabLoading, frameworks, recommendedFrameworkId }) {
  const [totalSecs, setTotalSecs] = useState(defaultSeconds);
  const [remaining, setRemaining] = useState(defaultSeconds);
  const [running, setRunning] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [openFramework, setOpenFramework] = useState(null);
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
    if (open) {
      reset();
      setOpenFramework(recommendedFrameworkId || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recommendedFrameworkId]);

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

  const hasExtras = (vocabLoading || vocabWords?.length > 0) || frameworks?.length > 0;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(10px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative w-full flex flex-col md:flex-row animate-slide-up overflow-hidden"
        style={{
          maxWidth: hasExtras ? 900 : 560,
          maxHeight: "90vh",
          borderRadius: 40,
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.4)",
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

        {/* Left column — timer itself. Fixed, never scrolls: this is the part
            the user needs visible at a glance while speaking. On mobile (no
            row split) this is just the top of a single scrollable column. */}
        <div
          className="relative flex flex-col items-center flex-shrink-0 px-6 pt-8 pb-6 sm:px-10 sm:pt-10 sm:pb-8 overflow-y-auto"
          style={{ width: hasExtras ? undefined : "100%", maxWidth: hasExtras ? 420 : undefined, maxHeight: "90vh" }}
        >
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

          {/* Full question text, no line clamp — the main spin screen no longer
              repeats it, so it must never be cut off here. */}
          <p
            className="text-center font-bold leading-snug mb-4 sm:mb-6 px-2"
            style={{ color: "var(--ink)", fontSize: "1.125rem", maxWidth: 400 }}
          >
            {topicLabel || "—"}
          </p>

          {/* Ring — sized so the tabular-nums time label always fits comfortably
              inside it at every breakpoint (previous 4rem digits on a 180px ring
              overflowed past the stroke on mobile). */}
          <div className="relative flex items-center justify-center mb-4 sm:mb-6 w-[200px] h-[200px] sm:w-[260px] sm:h-[260px]">
            <svg viewBox="0 0 260 260" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(-90deg)" }}>
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
              <div className="font-black tabular-nums text-[2rem] sm:text-[2.75rem]" style={{ color: "var(--ink)", letterSpacing: "-1px", lineHeight: 1 }}>
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

          {/* Controls — smaller buttons/gap on mobile to fit the narrower card, full
              size at sm: and up. No trailing spacer: it used to add a div the same
              width as the reset button to "balance" it visually, but that pushed
              the whole row's center off the card's actual center (confirmed on
              device) — centering just the two real buttons via justify-center on
              the parent is what actually keeps them centered. */}
          <div className="flex items-center justify-center gap-4 sm:gap-6">
            <button
              onClick={reset}
              className="rounded-full flex items-center justify-center transition-all active:scale-90 w-14 h-14 sm:w-16 sm:h-16"
              style={{ background: "var(--hover-bg)", color: "var(--ink)" }}
            >
              <RotateCcw size={20} className="sm:hidden" />
              <RotateCcw size={22} className="hidden sm:block" />
            </button>
            <button
              onClick={() => (running ? pause() : start())}
              className="rounded-full flex items-center justify-center transition-all active:scale-90 hover:scale-105 w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]"
              style={{
                background: running
                  ? "linear-gradient(135deg, var(--electric-muted), var(--electric))"
                  : "linear-gradient(135deg, var(--electric), var(--electric-muted))",
                color: "var(--on-electric)",
                boxShadow: "0 8px 28px rgba(var(--electric-rgb),0.45)",
              }}
            >
              {running ? (
                <>
                  <Pause size={26} className="sm:hidden" />
                  <Pause size={30} className="hidden sm:block" />
                </>
              ) : (
                <>
                  <Play size={26} style={{ marginLeft: 3 }} className="sm:hidden" />
                  <Play size={30} style={{ marginLeft: 3 }} className="hidden sm:block" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right column — vocab + frameworks, scrolls independently of the
            timer so the timer never moves out of view while scanning these.
            On mobile there's no row split, so this just continues below as
            part of the same vertical flow (its own overflow-y-auto is a
            no-op there since the outer column already scrolls). */}
        {hasExtras && (
          <div
            className="flex-1 min-w-0 flex flex-col gap-2.5 px-6 pb-6 sm:px-8 sm:pb-8 md:pt-10 overflow-y-auto"
            style={{ borderLeft: "1px solid var(--card-border)" }}
          >
            {(vocabLoading || vocabWords?.length > 0) && (
              <VocabSuggestions words={vocabWords} loading={vocabLoading} compact />
            )}

            {frameworks?.length > 0 && frameworks.map((fw) => {
              const isOpen = openFramework === fw.id;
              const isRecommended = recommendedFrameworkId === fw.id;
              return (
                <div
                  key={fw.id}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    background: "var(--surface)",
                    border: isRecommended ? "1.5px solid var(--electric)" : "1.5px solid var(--line)",
                    boxShadow: isRecommended ? "0 4px 20px rgba(var(--electric-rgb),0.2)" : "none",
                  }}
                >
                  <button
                    onClick={() => setOpenFramework(isOpen ? null : fw.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 relative"
                  >
                    <span className="font-bold text-base" style={{ color: isRecommended ? "var(--electric)" : "var(--ink)" }}>
                      {fw.label}
                    </span>
                    {isRecommended && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--green-subtle)", color: "var(--electric)" }}>
                        GỢI Ý
                      </span>
                    )}
                    <ChevronDown
                      size={16}
                      className="absolute right-4"
                      style={{ color: "var(--ink-soft)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3.5 flex flex-col gap-1.5">
                      {fw.steps.map((s, i) => (
                        <p key={i} className="text-xs leading-relaxed text-left" style={{ color: "var(--ink-soft)" }}>• {s}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
