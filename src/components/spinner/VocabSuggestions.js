"use client";

import { Volume2, Sparkles } from "lucide-react";

// Same server-side Google Cloud TTS used across the app (see
// vocabulary-chat/page.js) — falls back to browser speechSynthesis on failure.
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

// Small reusable card for the 2 AI-suggested vocabulary words tied to a
// landed question — shared between the main mode card and TimerModal.
// Renders nothing once loading finishes with no words (AI call failed or
// returned malformed output) — this is a bonus feature, so failure should be
// invisible rather than an error banner blocking the core spin/speak flow.
export default function VocabSuggestions({ words, loading, compact = false }) {
  if (!loading && (!words || words.length === 0)) return null;

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles size={14} style={{ color: "var(--electric)" }} />
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
          Gợi ý từ vựng
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-1.5 animate-pulse">
              <div className="h-4 w-24 rounded" style={{ background: "var(--hover-bg)" }} />
              <div className="h-3 w-full rounded" style={{ background: "var(--hover-bg)" }} />
              {!compact && <div className="h-3 w-3/4 rounded" style={{ background: "var(--hover-bg)" }} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {words.map((w, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm" style={{ color: "var(--electric)" }}>{w.word}</span>
                {w.ipa && <span className="text-xs italic" style={{ color: "var(--ink-ghost)" }}>{w.ipa}</span>}
                <button
                  onClick={() => speak(w.word)}
                  className="w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                  style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                  title="Phát âm"
                >
                  <Volume2 size={11} />
                </button>
                {w.meaning_vi && (
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>— {w.meaning_vi}</span>
                )}
              </div>
              {w.example && (
                <p className="text-xs italic" style={{ color: "var(--ink-ghost)" }}>&ldquo;{w.example}&rdquo;</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
