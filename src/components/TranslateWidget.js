"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Languages, ArrowLeftRight, Volume2, X, Plus, Loader2, Check, BookOpen } from "lucide-react";

function speak(text, lang = "en-US") {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const match = voices.find(v => v.lang.startsWith(lang.split("-")[0]));
  if (match) utter.voice = match;
  window.speechSynthesis.speak(utter);
}

const isSingleEnWord = (text) =>
  text.trim().split(/\s+/).length === 1 && /^[a-zA-Z]+$/.test(text.trim());

// Simple in-memory translation cache
const translateCache = new Map();

export default function TranslateWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [translated, setTranslated] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [direction, setDirection] = useState("EN→VI");
  const [wordInfo, setWordInfo] = useState(null);
  const [added, setAdded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const debounceRef = useRef(null);
  const suggestRef = useRef(null);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  // Fetch suggestions as user types (EN mode, single-word prefix)
  const fetchSuggestions = useCallback(async (text) => {
    if (!isSingleEnWord(text) || text.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionLoading(true);
    try {
      const res = await fetch(`/api/words/suggest?q=${encodeURIComponent(text)}`);
      const data = await res.json();
      setSuggestions(data.suggestions || []);
      setShowSuggestions((data.suggestions || []).length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setSuggestionLoading(false);
    }
  }, []);

  // Core translate + lookup (parallel)
  const translate = useCallback(async (text, dir) => {
    if (!text.trim()) {
      setTranslated("");
      setWordInfo(null);
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const cacheKey = `${dir}::${text.trim().toLowerCase()}`;
    if (translateCache.has(cacheKey)) {
      const cached = translateCache.get(cacheKey);
      setTranslated(cached.translated);
      setWordInfo(cached.wordInfo);
      setAdded(false);
      return;
    }

    setIsLoading(true);
    try {
      const [src, tgt] = dir === "EN→VI" ? ["EN", "VI"] : ["VI", "EN"];
      const isEnSingleWord = dir === "EN→VI" && isSingleEnWord(text);

      // Run translate + word lookup in parallel
      const [transRes, lookupRes] = await Promise.all([
        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, source: src, target: tgt }),
        }),
        isEnSingleWord
          ? fetch(`/api/words/lookup?word=${encodeURIComponent(text.trim().toLowerCase())}`)
          : Promise.resolve(null),
      ]);

      const transData = await transRes.json();
      const wordData = lookupRes ? await lookupRes.json() : null;

      const result = {
        translated: transData.translated || "",
        wordInfo: wordData?.word || null,
      };

      if (result.translated) {
        translateCache.set(cacheKey, result);
        // Keep cache small
        if (translateCache.size > 60) {
          const firstKey = translateCache.keys().next().value;
          translateCache.delete(firstKey);
        }
      }

      setTranslated(result.translated);
      setWordInfo(result.wordInfo);
      setAdded(false);
    } catch {
      setTranslated("Lỗi dịch — thử lại sau");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounce: suggestions at 150ms, translation at 280ms
  useEffect(() => {
    if (direction !== "EN→VI" || !isSingleEnWord(input)) {
      setSuggestions([]);
      setShowSuggestions(false);
    }

    if (suggestRef.current) clearTimeout(suggestRef.current);
    if (direction === "EN→VI" && input.trim().length >= 2) {
      suggestRef.current = setTimeout(() => fetchSuggestions(input), 150);
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => translate(input, direction), 280);

    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(suggestRef.current);
    };
  }, [input, direction, translate, fetchSuggestions]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 80);
  }, [isOpen]);

  // Pick a suggestion: immediately show its data + close dropdown
  const pickSuggestion = (suggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    setInput(suggestion.word);
    setWordInfo(suggestion);
    setAdded(false);
    // Still trigger full translate for the meaning
    if (debounceRef.current) clearTimeout(debounceRef.current);
    translate(suggestion.word, direction);
  };

  const flipDirection = () => {
    const next = direction === "EN→VI" ? "VI→EN" : "EN→VI";
    setDirection(next);
    setSuggestions([]);
    setShowSuggestions(false);
    if (translated) {
      setInput(translated);
      setTranslated(input);
      setWordInfo(null);
    }
  };

  const handleAddToStudy = async () => {
    if (!wordInfo) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/progress/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: wordInfo.id, rating: 3 }),
      });
      if (res.ok) setAdded(true);
    } catch {
      // silently fail
    } finally {
      setIsAdding(false);
    }
  };

  const clear = () => {
    setInput("");
    setTranslated("");
    setWordInfo(null);
    setAdded(false);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const [srcLabel, tgtLabel] = direction === "EN→VI" ? ["English", "Tiếng Việt"] : ["Tiếng Việt", "English"];

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-24 right-4 sm:right-6 z-[100] w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{
          background: isOpen ? "var(--electric)" : "var(--card-bg)",
          border: "2px solid var(--electric)",
          boxShadow: isOpen
            ? "0 8px 24px rgba(34,197,94,0.5)"
            : "0 4px 16px rgba(34,197,94,0.25)",
          color: isOpen ? "#0A0A0A" : "var(--electric)",
        }}
        title="Dịch nhanh"
      >
        <Languages size={22} />
      </button>

      {/* Panel */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => { setIsOpen(false); setShowSuggestions(false); }} />
          <div
            ref={panelRef}
            className="fixed bottom-[168px] right-4 sm:right-6 z-[120] w-[340px] sm:w-[380px] rounded-3xl overflow-visible animate-slide-up"
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--green-subtle-border)",
              boxShadow: "0 24px 56px rgba(0,0,0,0.4)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b rounded-t-3xl"
              style={{ borderColor: "var(--divider)", background: "var(--card-bg)" }}
            >
              <div className="flex items-center gap-2">
                <Languages size={16} style={{ color: "var(--electric)" }} />
                <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>Dịch nhanh</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={flipDirection}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold hover:-translate-y-0.5 transition-all"
                  style={{
                    background: "var(--green-subtle)",
                    border: "1px solid var(--green-subtle-border)",
                    color: "var(--electric)",
                  }}
                >
                  <span>{direction.split("→")[0]}</span>
                  <ArrowLeftRight size={11} />
                  <span>{direction.split("→")[1]}</span>
                </button>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors"
                  style={{ color: "var(--ink-soft)", background: "var(--hover-bg)" }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Body — no overflow clip so suggestions dropdown can escape */}
            <div>
              {/* Input */}
              <div className="p-4 pb-2">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                    {srcLabel}
                  </p>
                  {suggestionLoading && (
                    <Loader2 size={10} className="animate-spin" style={{ color: "var(--electric)" }} />
                  )}
                </div>

                {/* Input wrapper */}
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => { setInput(e.target.value); setShowSuggestions(true); }}
                    onFocus={e => {
                      e.target.style.borderColor = "rgba(34,197,94,0.5)";
                      if (suggestions.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={e => {
                      e.target.style.borderColor = "var(--input-border)";
                      setTimeout(() => setShowSuggestions(false), 200);
                    }}
                    placeholder={direction === "EN→VI" ? "Enter English text..." : "Nhập tiếng Việt..."}
                    rows={2}
                    className="w-full resize-none rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all"
                    style={{
                      background: "var(--input-bg)",
                      border: "1.5px solid var(--input-border)",
                      color: "var(--ink)",
                      lineHeight: 1.6,
                    }}
                  />
                  {input && (
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={clear}
                      className="absolute top-2 right-2 w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                {/* Suggestions — rendered inline below input, no overflow clipping */}
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    className="mt-1 rounded-2xl overflow-hidden animate-fade-in"
                    style={{
                      background: "var(--card-bg)",
                      border: "1.5px solid var(--green-subtle-border)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
                    }}
                  >
                    {suggestions.map((s, i) => (
                      <button
                        key={s.id}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => pickSuggestion(s)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{
                          borderBottom: i < suggestions.length - 1 ? "1px solid var(--divider)" : "none",
                          background: "transparent",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--hover-bg)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>{s.word}</span>
                            {s.phonetic && (
                              <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>/{s.phonetic}/</span>
                            )}
                            {s.level && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                                style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
                              >
                                {s.level}
                              </span>
                            )}
                          </div>
                          {s.meaning_vi && (
                            <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--ink-soft)" }}>
                              {s.meaning_vi}
                            </p>
                          )}
                        </div>
                        <Volume2
                          size={13}
                          style={{ color: "var(--electric)", flexShrink: 0, opacity: 0.7 }}
                          onClick={e => { e.stopPropagation(); speak(s.word); }}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {input && direction === "EN→VI" && (
                  <button
                    onClick={() => speak(input, "en-US")}
                    className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <Volume2 size={11} /> Phát âm
                  </button>
                )}
              </div>

              {/* Output */}
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                    {tgtLabel}
                  </p>
                  {isLoading && <Loader2 size={12} className="animate-spin" style={{ color: "var(--electric)" }} />}
                </div>

                <div
                  className="rounded-2xl px-4 py-3 min-h-[56px]"
                  style={{
                    background: "var(--green-subtle)",
                    border: "1px solid var(--green-subtle-border)",
                  }}
                >
                  {translated ? (
                    <>
                      <p className="text-sm font-semibold leading-relaxed" style={{ color: "var(--ink)" }}>
                        {translated}
                      </p>
                      {direction === "VI→EN" && (
                        <button
                          onClick={() => speak(translated, "en-US")}
                          className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold"
                          style={{ color: "var(--electric)" }}
                        >
                          <Volume2 size={11} /> Phát âm
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm" style={{ color: "var(--ink-ghost)" }}>
                      {input ? "..." : "Bản dịch sẽ hiện ở đây"}
                    </p>
                  )}
                </div>

                {/* Word info from DB */}
                {wordInfo && translated && (
                  <div
                    className="mt-2.5 rounded-2xl px-4 py-3 space-y-1.5 animate-fade-in"
                    style={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-base" style={{ color: "var(--ink)" }}>{wordInfo.word}</span>
                        {wordInfo.phonetic && (
                          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>/{wordInfo.phonetic}/</span>
                        )}
                        {wordInfo.level && (
                          <span
                            className="px-1.5 py-0.5 rounded-lg text-[10px] font-bold"
                            style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
                          >
                            {wordInfo.level}
                          </span>
                        )}
                      </div>
                      <button onClick={() => speak(wordInfo.word, "en-US")} style={{ color: "var(--electric)" }}>
                        <Volume2 size={14} />
                      </button>
                    </div>
                    {wordInfo.definition && (
                      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        {wordInfo.definition}
                      </p>
                    )}
                    {wordInfo.example && (
                      <p className="text-xs italic leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                        "{wordInfo.example}"
                      </p>
                    )}
                    <button
                      onClick={handleAddToStudy}
                      disabled={isAdding || added}
                      className="w-full mt-1 py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 hover:-translate-y-0.5 transition-all disabled:opacity-60"
                      style={{
                        background: added ? "var(--green-subtle)" : "var(--electric)",
                        color: added ? "var(--electric)" : "#0A0A0A",
                        border: added ? "1px solid var(--green-subtle-border)" : "none",
                      }}
                    >
                      {isAdding ? <Loader2 size={12} className="animate-spin" /> :
                       added ? <><Check size={12} /> Đã thêm vào ôn tập!</> :
                       <><Plus size={12} /> Thêm vào ôn tập</>}
                    </button>
                  </div>
                )}

                {/* Single word not in DB */}
                {!wordInfo && translated && input && isSingleEnWord(input) && direction === "EN→VI" && (
                  <p className="mt-2 text-[11px] text-center" style={{ color: "var(--ink-ghost)" }}>
                    <BookOpen size={11} style={{ display: "inline", marginRight: 4 }} />
                    Từ này chưa có trong thư viện
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
