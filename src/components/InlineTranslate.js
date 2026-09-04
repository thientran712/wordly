"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Volume2, X, Loader2, Search, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { lookupWord, normalizeWordKey } from "@/lib/dictionary-client";

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
    // Fallback to browser TTS
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.85;
    window.speechSynthesis.speak(utter);
  }
}

const translateCache = new Map();
const dictCache = new Map();

const POS_LABEL = {
  noun: "Danh từ", verb: "Động từ", adjective: "Tính từ",
  adverb: "Trạng từ", pronoun: "Đại từ", preposition: "Giới từ",
  conjunction: "Liên từ", interjection: "Thán từ", exclamation: "Thán từ",
};
const POS_COLOR = {
  noun:      { bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)",  text: "#60A5FA" },
  verb:      { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)", text: "#A78BFA" },
  adjective: { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  text: "#FBBF24" },
  adverb:    { bg: "rgba(232,121,249,0.12)", border: "rgba(232,121,249,0.3)", text: "#E879F9" },
  default:   { bg: "var(--hover-bg)",         border: "var(--divider)",         text: "var(--ink-soft)" },
};
const posStyle = (pos) => POS_COLOR[pos] || POS_COLOR.default;

export default function InlineTranslate({ onTranslated, initialPick, isLoggedIn = false }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [translated, setTranslated] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [direction, setDirection] = useState("EN→VI");

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggLoading, setSuggLoading] = useState(false);

  const [wordDetail, setWordDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [detailWord, setDetailWord] = useState("");
  const [saved, setSaved] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [saveToast, setSaveToast] = useState(null); // { word, isFirstTime } | null
  const saveToastTimerRef = useRef(null);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [emailInviteBusy, setEmailInviteBusy] = useState(false);
  const [emailEnabledToast, setEmailEnabledToast] = useState(false);

  const debounceRef = useRef(null);
  const suggestRef = useRef(null);
  const inputRef = useRef(null);
  const suppressSuggestRef = useRef(false);
  const translateReqRef = useRef(0);
  const autoLogRef = useRef(null);
  const autoLogSentRef = useRef(new Set()); // "direction::text" keys already auto-logged this session, avoid duplicate rows while translated text is stable

  const CHAR_LIMIT = 10000;
  const isOverLimit = input.length > CHAR_LIMIT;

  // Auto-resize textarea to fit content
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const isEN = direction === "EN→VI";

  // Auto-resize whenever input changes
  useEffect(() => { autoResize(); }, [input, autoResize]);

  // ── Load entry picked from history ──
  useEffect(() => {
    if (!initialPick) return;
    suppressSuggestRef.current = true;
    setDirection(initialPick.direction);
    setInput(initialPick.text);
    setTranslated(initialPick.translated);
    setWordDetail(null);
    setSuggestions([]); setShowSuggestions(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // scroll to translator
    inputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    inputRef.current?.focus();
  }, [initialPick]);

  // ── Datamuse — exact match always first ──
  const fetchSuggestions = useCallback(async (text) => {
    if (suppressSuggestRef.current) return;
    const word = text.trim();
    if (!word || word.length < 2 || !isEN) {
      setSuggestions([]); setShowSuggestions(false); return;
    }
    setSuggLoading(true);
    try {
      const res = await fetch(
        `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}*&max=8`,
        { cache: "force-cache" }
      );
      const data = await res.json();
      let words = (data || []).map(d => d.word);
      const exact = word.toLowerCase();
      if (!words[0] || words[0].toLowerCase() !== exact) {
        words = [exact, ...words.filter(w => w.toLowerCase() !== exact)].slice(0, 8);
      }
      setSuggestions(words);
      setShowSuggestions(words.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggLoading(false);
    }
  }, [isEN]);

  // ── DeepL ──
  const translate = useCallback(async (text, dir) => {
    const reqId = ++translateReqRef.current;
    if (!text.trim()) { setTranslated(""); return; }
    const key = `${dir}::${text.trim()}`;
    if (translateCache.has(key)) {
      const cached = translateCache.get(key);
      if (reqId === translateReqRef.current) setTranslated(cached);
      return;
    }
    setIsTranslating(true);
    try {
      const [src, tgt] = dir === "EN→VI" ? ["EN", "VI"] : ["VI", "EN"];
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: src, target: tgt }),
      });
      const data = await res.json();
      const result = data.translated || "";
      if (result) {
        translateCache.set(key, result);
        if (translateCache.size > 100) translateCache.delete(translateCache.keys().next().value);
        trackEvent("translate", { direction: dir });
      }
      // Bail on writing the result if a newer translate() call has started —
      // otherwise a slow stale response can overwrite a faster, newer result.
      // isTranslating always clears below regardless of reqId, so a stale
      // request finishing late can never leave the UI stuck on "Đang dịch...".
      if (reqId === translateReqRef.current) {
        setTranslated(result);
        setSaved(false); // reset saved state on new translation
      }
    } catch {
      if (reqId === translateReqRef.current) setTranslated("Lỗi — thử lại sau");
    } finally {
      setIsTranslating(false);
    }
  }, []);

  // ── AI dictionary (cached server-side in word_dictionary_cache) ──
  // Trước đây mọi thất bại đều thành setWordDetail(null), và khối nghĩa từ
  // chỉ hiện khi (detailLoading || wordDetail) — nên khi API lỗi cả khối
  // BIẾN MẤT: người dùng bấm vào từ và không thấy gì xảy ra, không biết là
  // lỗi hay từ đó không có nghĩa. Chính vì vô hình mà sự cố Groq ngừng model
  // không ai báo. Giờ tách rõ: lỗi thì hiện thông báo + nút thử lại.
  const loadWordDetail = useCallback(async (word) => {
    const key = normalizeWordKey(word);
    if (!key) return;

    setDetailWord(key);
    setDetailError(null);

    if (dictCache.has(key)) { setWordDetail(dictCache.get(key)); return; }

    setDetailLoading(true);
    const { detail, error, notFound } = await lookupWord(key);

    if (detail) {
      dictCache.set(key, detail);
      if (dictCache.size > 50) dictCache.delete(dictCache.keys().next().value);
    }
    setWordDetail(detail);
    setDetailError(error || (notFound ? `Không tìm thấy "${key}" trong từ điển.` : null));
    setDetailLoading(false);
  }, []);

  // Suggestions debounce
  useEffect(() => {
    if (suggestRef.current) clearTimeout(suggestRef.current);
    if (isEN && input.trim().length >= 2) {
      suggestRef.current = setTimeout(() => fetchSuggestions(input), 150);
    } else {
      setSuggestions([]); setShowSuggestions(false);
    }
    return () => clearTimeout(suggestRef.current);
  }, [input, isEN, fetchSuggestions]);

  // Translation debounce — skip if over limit
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isOverLimit) {
      debounceRef.current = setTimeout(() => translate(input, direction), 280);
    }
    return () => clearTimeout(debounceRef.current);
  }, [input, direction, translate, isOverLimit]);

  // Auto-log to history 10s after the user stops changing the input — separate,
  // longer debounce than the translate one above so casual typing/edits don't
  // spam rows. Every stable translation gets its own row (is_saved: false);
  // the "Lưu" button later marks the matching row is_saved: true. Doesn't
  // require picking a suggestion or single-word input — any translated text.
  useEffect(() => {
    if (autoLogRef.current) clearTimeout(autoLogRef.current);
    if (!isLoggedIn || !input.trim() || !translated || isOverLimit) return;

    const sourceText = input.trim();
    const key = `${direction}::${sourceText}`;
    autoLogRef.current = setTimeout(() => {
      if (autoLogSentRef.current.has(key)) return;
      autoLogSentRef.current.add(key);
      fetch("/api/translate-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_text: sourceText, translated_text: translated, direction, is_saved: false }),
      }).catch(() => autoLogSentRef.current.delete(key));
    }, 10000);

    return () => clearTimeout(autoLogRef.current);
  }, [input, translated, direction, isLoggedIn, isOverLimit]);

  const isSingleWord = (text) => /^\s*[a-zA-Z'-]+\s*$/.test(text);

  const pickSuggestion = (word) => {
    suppressSuggestRef.current = true;
    setShowSuggestions(false);
    setSuggestions([]);
    setWordDetail(null);
    setSaved(false);
    setInput(word); // triggers useEffect → translate via debounce
    if (isEN && isSingleWord(word)) loadWordDetail(word);
    inputRef.current?.focus();
  };

  const flipDirection = () => {
    const next = direction === "EN→VI" ? "VI→EN" : "EN→VI";
    setDirection(next);
    setSuggestions([]); setShowSuggestions(false);
    setWordDetail(null);
    suppressSuggestRef.current = false;
    if (translated) { setInput(translated); setTranslated(input); }
  };

  const clear = () => {
    suppressSuggestRef.current = false;
    setInput(""); setTranslated(""); setWordDetail(null);
    setSuggestions([]); setShowSuggestions(false);
    setSaved(false);
    inputRef.current?.focus();
  };

  const handleSave = async () => {
    if (!input.trim() || !translated || saved || !isLoggedIn) return;
    setSaved(true);
    const word = input.trim();
    try {
      const res = await fetch("/api/translate-history", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_text: word, translated_text: translated, direction }),
      });
      if (!res.ok) throw new Error("save failed");
      trackEvent("save_word", { direction });
      showSaveToast(word);
      onTranslated?.();
    } catch {
      setSaved(false);
    }
  };

  const showSaveToast = (word) => {
    if (saveToastTimerRef.current) clearTimeout(saveToastTimerRef.current);
    let isFirstTime = false;
    try {
      isFirstTime = !localStorage.getItem("wordly-seen-save-explainer");
      if (isFirstTime) localStorage.setItem("wordly-seen-save-explainer", "1");
    } catch { /* localStorage unavailable — just skip the first-time variant */ }
    setSaveToast({ word, isFirstTime });
    saveToastTimerRef.current = setTimeout(() => {
      setSaveToast(null);
      // Right after the first-ever save toast finishes, invite the user to
      // turn on email reminders — shown at most once ever, regardless of
      // whether they accept, decline, or ignore it.
      if (isFirstTime) {
        try {
          if (!localStorage.getItem("wordly-seen-email-invite")) {
            localStorage.setItem("wordly-seen-email-invite", "1");
            setShowEmailInvite(true);
          }
        } catch { /* localStorage unavailable — skip the invite */ }
      }
    }, isFirstTime ? 6000 : 2500);
  };

  const handleEnableEmailReminders = async () => {
    setEmailInviteBusy(true);
    try {
      const prefRes = await fetch("/api/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true, frequency: "daily", custom_days: [] }),
      });
      if (!prefRes.ok) throw new Error("Failed to enable email preferences");
      await fetch("/api/email-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ send_time: "08:00" }),
      });
      trackEvent("email_invite_accepted");
      setShowEmailInvite(false);
      setEmailEnabledToast(true);
      setTimeout(() => setEmailEnabledToast(false), 3000);
    } catch {
      setEmailInviteBusy(false); // leave the banner open so the user can retry
      return;
    }
    setEmailInviteBusy(false);
  };

  const dismissEmailInvite = () => {
    trackEvent("email_invite_dismissed");
    setShowEmailInvite(false);
  };

  const handleAskAI = () => {
    const word = input.trim();
    if (!word) return;
    router.push(`/practice?${new URLSearchParams({ word })}`);
  };

  const handleInputChange = (e) => {
    suppressSuggestRef.current = false;
    setWordDetail(null);
    setSaved(false);
    setInput(e.target.value);
    setShowSuggestions(true);
  };

  const [srcLang, tgtLang] = isEN ? ["English", "Tiếng Việt"] : ["Tiếng Việt", "English"];

  const dismissKeyboard = () => inputRef.current?.blur();

  return (
    <div className="w-full">

      {/* ── Mobile keyboard toolbar — fixed above keyboard when focused ── */}
      {isFocused && (
        <div
          className="sm:hidden fixed left-0 right-0 z-[200] flex items-center justify-between px-4 py-2 border-t"
          style={{
            bottom: 0,
            background: "var(--card-bg)",
            borderColor: "var(--divider)",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.15)",
          }}
        >
          <span className="text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
            {isTranslating ? "Đang dịch..." : translated ? "✓ Đã dịch" : isEN ? "Nhập từ hoặc câu..." : "Nhập tiếng Việt..."}
          </span>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={dismissKeyboard}
            className="no-min-h px-4 py-1.5 rounded-xl text-sm font-bold active:scale-95 transition-all"
            style={{ background: "var(--electric)", color: "var(--on-electric)" }}
          >
            Xong
          </button>
        </div>
      )}

      {/* ── Language bar ── */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b"
        style={{ borderColor: "var(--divider)" }}
      >
        <span className="font-bold text-sm flex-1 text-center" style={{ color: "var(--ink)" }}>
          {srcLang}
        </span>
        <button
          onClick={flipDirection}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all flex-shrink-0"
          style={{
            background: "var(--green-subtle)",
            border: "1.5px solid var(--green-subtle-border)",
            color: "var(--electric)",
          }}
        >
          <ArrowLeftRight size={15} />
        </button>
        <span className="font-bold text-sm flex-1 text-center" style={{ color: "var(--electric)" }}>
          {tgtLang}
        </span>
      </div>

      {/* ── Body: stacked on mobile, side-by-side on sm+ ── */}
      <div className="flex flex-col sm:flex-row">

        {/* Input panel */}
        <div
          className="relative flex flex-col flex-1 border-b sm:border-b-0 sm:border-r"
          style={{ borderColor: "var(--divider)" }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onFocus={() => {
              setIsFocused(true);
              if (suggestions.length > 0 && !suppressSuggestRef.current) setShowSuggestions(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              setTimeout(() => setShowSuggestions(false), 180);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && window.innerWidth < 640) {
                e.preventDefault();
                inputRef.current?.blur();
              }
            }}
            placeholder={isEN ? "Enter text or a word..." : "Nhập văn bản..."}
            enterKeyHint="done"
            className="w-full resize-none text-base focus:outline-none px-4 pt-3 pb-2"
            style={{
              background: "transparent",
              color: isOverLimit ? "var(--error)" : "var(--ink)",
              lineHeight: 1.7,
              minHeight: 96,
              height: "auto",
              overflow: "hidden",
              border: "none",
            }}
          />
          {/* Char counter — only show when nearing limit */}
          {input.length > CHAR_LIMIT * 0.8 && (
            <div className="px-4 pb-1 text-right">
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: isOverLimit ? "var(--error)" : "var(--ink-ghost)" }}>
                {input.length.toLocaleString()} / {CHAR_LIMIT.toLocaleString()}
              </span>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2 px-4 pb-3">
            {/* Phát âm input — US/UK accent buttons for English, single button for Vietnamese */}
            {input && (isEN ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => speak(input, "en-US")}
                  className="no-min-h px-2 h-8 flex items-center gap-1 rounded-xl text-[11px] font-bold active:scale-95 transition-all"
                  style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                  title="Phát âm giọng Mỹ"
                >
                  <Volume2 size={13} /> US
                </button>
                <button
                  onClick={() => speak(input, "en-GB")}
                  className="no-min-h px-2 h-8 flex items-center gap-1 rounded-xl text-[11px] font-bold active:scale-95 transition-all"
                  style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                  title="Phát âm giọng Anh"
                >
                  <Volume2 size={13} /> UK
                </button>
              </div>
            ) : (
              <button
                onClick={() => speak(input, "vi-VN")}
                className="no-min-h w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-all"
                style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                title="Phát âm"
              >
                <Volume2 size={15} />
              </button>
            ))}
            {/* Save button — always on left/input side */}
            {translated && (
              <button
                onClick={handleSave}
                disabled={saved}
                className="no-min-h px-2 h-8 rounded-xl text-[11px] font-bold active:scale-95 transition-all"
                style={{
                  background: saved ? "var(--green-subtle)" : "var(--hover-bg)",
                  color: saved ? "var(--electric)" : "var(--ink-soft)",
                  border: saved ? "1px solid var(--green-subtle-border)" : "1px solid transparent",
                }}
                title={saved ? "Đã lưu — sẽ được nhắc ôn tập qua email" : "Lưu để được nhắc ôn tập qua email"}
              >
                {saved ? "Đã lưu" : "Lưu"}
              </button>
            )}
            {/* Ask AI — explain this word in a chat with Alex */}
            {translated && isEN && isSingleWord(input) && (
              <button
                onClick={handleAskAI}
                className="no-min-h flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-bold active:scale-95 transition-all"
                style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
                title="Hỏi AI giải thích từ này"
              >
                <Sparkles size={13} /> Hỏi AI
              </button>
            )}
            {suggLoading && (
              <Loader2 size={11} className="animate-spin" style={{ color: "var(--electric)" }} />
            )}
            {input && (
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={clear}
                className="no-min-h ml-auto p-2 rounded-xl active:scale-95 transition-colors"
                style={{ color: "var(--ink-soft)", background: "var(--hover-bg)" }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Suggestions dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 z-30 overflow-hidden rounded-b-2xl"
              style={{
                top: "100%",
                background: "var(--card-bg)",
                border: "1px solid var(--green-subtle-border)",
                borderTop: "none",
                boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
              }}
            >
              {suggestions.map((word, i) => {
                const isExact = word === input.trim().toLowerCase();
                return (
                  <div
                    key={word}
                    role="button"
                    tabIndex={0}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => pickSuggestion(word)}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") pickSuggestion(word); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium active:scale-[0.98] transition-all cursor-pointer"
                    style={{
                      borderTop: i > 0 ? "1px solid var(--divider)" : "none",
                      background: "transparent",
                      color: isExact ? "var(--electric)" : "var(--ink)",
                      minHeight: 44,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Search size={12} style={{ color: isExact ? "var(--electric)" : "var(--ink-ghost)", flexShrink: 0 }} />
                    <span className="flex-1">{word}</span>
                    {isExact && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "var(--green-subtle)", color: "var(--electric)" }}
                      >
                        Xem nghĩa chi tiết
                      </span>
                    )}
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={e => { e.stopPropagation(); speak(word); }}
                      className="p-1.5 rounded-lg opacity-40 hover:opacity-100 active:scale-90 transition-all no-min-h"
                      style={{ color: "var(--electric)" }}
                    >
                      <Volume2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Word definitions — desktop only here (mobile renders below output panel) */}
          {(detailLoading || wordDetail || detailError) && (
            <div className="hidden sm:block border-t px-4 py-3" style={{ borderColor: "var(--divider)" }}>
              {detailLoading ? (
                <div className="flex items-center gap-2" style={{ color: "var(--electric)" }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">Đang tra từ điển...</span>
                </div>
              ) : detailError ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>{detailError}</p>
                  <button
                    onClick={() => { dictCache.delete(detailWord); loadWordDetail(detailWord); }}
                    className="text-xs font-bold underline"
                    style={{ color: "var(--electric)" }}
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <WordDefinitions detail={wordDetail} onAskAI={handleAskAI} />
              )}
            </div>
          )}
        </div>

        {/* Translation output panel */}
        <div
          className="flex flex-col gap-3 p-4"
          style={{ background: "var(--whisper)", minWidth: 0, flex: 1, minHeight: 96 }}
        >
          {isOverLimit ? (
            <p className="text-sm font-semibold" style={{ color: "var(--error)", lineHeight: 1.7 }}>
              ⚠️ Văn bản quá dài — tối đa {CHAR_LIMIT.toLocaleString()} ký tự.
            </p>
          ) : isTranslating ? (
            <div className="flex items-center gap-2 pt-1" style={{ color: "var(--electric)" }}>
              <Loader2 size={14} className="animate-spin" />
              <span className="text-sm">Đang dịch...</span>
            </div>
          ) : translated ? (
            <p className="text-base font-semibold" style={{ color: "var(--ink)", lineHeight: 1.7 }}>
              {translated}
            </p>
          ) : (
            <p className="text-sm pt-1 select-none" style={{ color: "var(--ink-ghost)" }}>
              {input ? "..." : "Bản dịch sẽ hiện ở đây"}
            </p>
          )}
        </div>

        {/* Word definitions — mobile only, appears after translation output */}
        {(detailLoading || wordDetail || detailError) && (
          <div className="sm:hidden border-t px-4 py-3" style={{ borderColor: "var(--divider)" }}>
            {detailLoading ? (
              <div className="flex items-center gap-2" style={{ color: "var(--electric)" }}>
                <Loader2 size={13} className="animate-spin" />
                <span className="text-xs">Đang tra từ điển...</span>
              </div>
            ) : detailError ? (
                <div>
                  <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>{detailError}</p>
                  <button
                    onClick={() => { dictCache.delete(detailWord); loadWordDetail(detailWord); }}
                    className="text-xs font-bold underline"
                    style={{ color: "var(--electric)" }}
                  >
                    Thử lại
                  </button>
                </div>
            ) : (
              <WordDefinitions detail={wordDetail} />
            )}
          </div>
        )}

      </div>

      {/* ── Save toast — confirms the word was saved and explains the email tie-in ── */}
      {saveToast && (
        <div
          className="fixed left-1/2 z-[300] -translate-x-1/2 flex items-start gap-2.5 px-4 py-3 rounded-2xl animate-fade-in"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            maxWidth: "min(90vw, 380px)",
            background: "var(--card-bg)",
            border: "1px solid var(--green-subtle-border)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              ✓ Đã lưu &ldquo;{saveToast.word}&rdquo;
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
              {saveToast.isFirstTime
                ? "Từ đã lưu sẽ được gửi nhắc ôn tập qua email theo lịch trình học của bạn."
                : "Sẽ được nhắc ôn tập qua email."}
            </p>
          </div>
          <button
            onClick={() => setSaveToast(null)}
            className="no-min-h p-1 rounded-lg flex-shrink-0"
            style={{ color: "var(--ink-ghost)" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Email invite banner — shown at most once ever, right after the first "Lưu" ── */}
      {showEmailInvite && (
        <div
          className="fixed left-1/2 z-[300] -translate-x-1/2 flex flex-col gap-2.5 px-4 py-3.5 rounded-2xl animate-fade-in"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            maxWidth: "min(90vw, 380px)",
            background: "var(--card-bg)",
            border: "1px solid var(--green-subtle-border)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                📬 Nhận nhắc ôn tập mỗi ngày qua email?
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                Mặc định 8:00 sáng — có thể đổi giờ sau trong Cài đặt Email.
              </p>
            </div>
            <button
              onClick={dismissEmailInvite}
              className="no-min-h p-1 rounded-lg flex-shrink-0"
              style={{ color: "var(--ink-ghost)" }}
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={dismissEmailInvite}
              disabled={emailInviteBusy}
              className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
              style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
            >
              Không, cảm ơn
            </button>
            <button
              onClick={handleEnableEmailReminders}
              disabled={emailInviteBusy}
              className="flex-1 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ background: "var(--electric)", color: "var(--on-electric)" }}
            >
              {emailInviteBusy ? <Loader2 size={13} className="animate-spin" /> : "Bật ngay →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmation toast after enabling email reminders from the invite ── */}
      {emailEnabledToast && (
        <div
          className="fixed left-1/2 z-[300] -translate-x-1/2 px-4 py-3 rounded-2xl animate-fade-in"
          style={{
            bottom: "max(1.5rem, env(safe-area-inset-bottom))",
            maxWidth: "min(90vw, 380px)",
            background: "var(--card-bg)",
            border: "1px solid var(--green-subtle-border)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            ✓ Đã bật nhắc email lúc 8:00
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Đổi giờ trong Cài đặt Email bất cứ lúc nào.
          </p>
        </div>
      )}
    </div>
  );
}

function WordDefinitions({ detail, onAskAI }) {
  const { phoneticUs, phoneticUk, meanings, hasMoreMeanings } = detail;
  return (
    <div className="flex flex-col gap-3">
      {(phoneticUs || phoneticUk) && (
        <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "var(--ink-soft)" }}>
          {phoneticUs && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>US</span>{phoneticUs}</span>}
          {phoneticUk && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>UK</span>{phoneticUk}</span>}
        </div>
      )}
      {meanings.map((m, mi) => {
        const s = posStyle(m.pos);
        return (
          <div key={mi} className="flex flex-col gap-1.5">
            <span
              className="self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
            >
              {POS_LABEL[m.pos] || m.pos}
            </span>
            <ol className="flex flex-col gap-2 pl-1">
              {m.defs.map((d, di) => (
                <li key={di} className="flex flex-col gap-0.5">
                  <span className="text-xs leading-relaxed" style={{ color: "var(--ink)" }}>
                    <span className="font-semibold mr-1" style={{ color: "var(--ink-soft)" }}>{di + 1}.</span>
                    {d.def}
                    {d.def_vi && <span style={{ color: "var(--electric)" }}> — {d.def_vi}</span>}
                  </span>
                  {d.example && (
                    <span
                      className="text-[11px] italic pl-3 leading-relaxed"
                      style={{ color: "var(--ink-ghost)", borderLeft: "2px solid var(--green-subtle-border)" }}
                    >
                      &ldquo;{d.example}&rdquo;
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {meanings.length === 0 && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Không tìm thấy định nghĩa chi tiết.
        </p>
      )}
      {hasMoreMeanings && (
        <button
          onClick={onAskAI}
          className="self-start text-[11px] font-semibold hover:underline"
          style={{ color: "var(--electric)" }}
        >
          Từ này còn nhiều nghĩa khác — Nhấn Hỏi AI để biết thêm →
        </button>
      )}
    </div>
  );
}
