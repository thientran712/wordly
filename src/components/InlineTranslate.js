"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeftRight, Volume2, X, Loader2, Search, BookmarkPlus, BookmarkCheck } from "lucide-react";

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
  verb:      { bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.3)",   text: "#22C55E" },
  adjective: { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  text: "#FBBF24" },
  adverb:    { bg: "rgba(232,121,249,0.12)", border: "rgba(232,121,249,0.3)", text: "#E879F9" },
  default:   { bg: "var(--hover-bg)",         border: "var(--divider)",         text: "var(--ink-soft)" },
};
const posStyle = (pos) => POS_COLOR[pos] || POS_COLOR.default;

export default function InlineTranslate({ onTranslated, initialPick, isLoggedIn = false }) {
  const [input, setInput] = useState("");
  const [translated, setTranslated] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [direction, setDirection] = useState("EN→VI");

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggLoading, setSuggLoading] = useState(false);

  const [wordDetail, setWordDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const debounceRef = useRef(null);
  const suggestRef = useRef(null);
  const inputRef = useRef(null);
  const suppressSuggestRef = useRef(false);

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
    if (!text.trim()) { setTranslated(""); return; }
    const key = `${dir}::${text.trim()}`;
    if (translateCache.has(key)) {
      const cached = translateCache.get(key);
      setTranslated(cached);
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
      }
      setTranslated(result);
      setSaved(false); // reset saved state on new translation
    } catch {
      setTranslated("Lỗi — thử lại sau");
    } finally {
      setIsTranslating(false);
    }
  }, []);

  // ── Free Dictionary API ──
  const loadWordDetail = useCallback(async (word) => {
    const key = word.toLowerCase();
    if (dictCache.has(key)) { setWordDetail(dictCache.get(key)); return; }
    setDetailLoading(true);
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`);
      if (!res.ok) { setWordDetail(null); return; }
      const data = await res.json();
      const entry = Array.isArray(data) ? data[0] : null;
      if (!entry) { setWordDetail(null); return; }
      const phonetic = entry.phonetic || entry.phonetics?.find(p => p.text)?.text || "";
      const meanings = (entry.meanings || []).map(m => ({
        pos: m.partOfSpeech,
        defs: m.definitions.slice(0, 3).map(d => ({ def: d.definition, example: d.example || "" })),
      }));
      const detail = { word, phonetic, meanings };
      dictCache.set(key, detail);
      if (dictCache.size > 50) dictCache.delete(dictCache.keys().next().value);
      setWordDetail(detail);
    } catch {
      setWordDetail(null);
    } finally {
      setDetailLoading(false);
    }
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
    onTranslated?.();
    fetch("/api/translate-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_text: input.trim(), translated_text: translated, direction }),
    }).catch(() => null);
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
            style={{ background: "var(--electric)", color: "#0A0A0A" }}
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
              color: isOverLimit ? "#F87171" : "var(--ink)",
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
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: isOverLimit ? "#F87171" : "var(--ink-ghost)" }}>
                {input.length.toLocaleString()} / {CHAR_LIMIT.toLocaleString()}
              </span>
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2 px-4 pb-3">
            {/* Phát âm input */}
            {input && (
              <button
                onClick={() => speak(input, isEN ? "en-US" : "vi-VN")}
                className="no-min-h w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-all"
                style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
                title="Phát âm"
              >
                <Volume2 size={15} />
              </button>
            )}
            {/* Save button — always on left/input side */}
            {translated && (
              <button
                onClick={handleSave}
                disabled={saved}
                className="no-min-h w-8 h-8 flex items-center justify-center rounded-xl active:scale-95 transition-all"
                style={{
                  background: saved ? "var(--green-subtle)" : "var(--hover-bg)",
                  color: saved ? "var(--electric)" : "var(--ink-soft)",
                  border: saved ? "1px solid var(--green-subtle-border)" : "1px solid transparent",
                }}
                title={saved ? "Đã lưu" : "Lưu vào lịch sử"}
              >
                {saved ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}
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
          {(detailLoading || wordDetail) && (
            <div className="hidden sm:block border-t px-4 py-3" style={{ borderColor: "var(--divider)" }}>
              {detailLoading ? (
                <div className="flex items-center gap-2" style={{ color: "var(--electric)" }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">Đang tra từ điển...</span>
                </div>
              ) : (
                <WordDefinitions detail={wordDetail} />
              )}
            </div>
          )}
        </div>

        {/* Translation output panel */}
        <div
          className="flex flex-col gap-3 p-4"
          style={{ background: "var(--green-subtle)", minWidth: 0, flex: 1, minHeight: 96 }}
        >
          {isOverLimit ? (
            <p className="text-sm font-semibold" style={{ color: "#F87171", lineHeight: 1.7 }}>
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
        {(detailLoading || wordDetail) && (
          <div className="sm:hidden border-t px-4 py-3" style={{ borderColor: "var(--divider)" }}>
            {detailLoading ? (
              <div className="flex items-center gap-2" style={{ color: "var(--electric)" }}>
                <Loader2 size={13} className="animate-spin" />
                <span className="text-xs">Đang tra từ điển...</span>
              </div>
            ) : (
              <WordDefinitions detail={wordDetail} />
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function WordDefinitions({ detail }) {
  const { phonetic, meanings } = detail;
  return (
    <div className="flex flex-col gap-3">
      {phonetic && (
        <span className="text-xs font-mono" style={{ color: "var(--ink-soft)" }}>{phonetic}</span>
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
                  </span>
                  {d.example && (
                    <span
                      className="text-[11px] italic pl-3 leading-relaxed"
                      style={{ color: "var(--ink-ghost)", borderLeft: "2px solid var(--green-subtle-border)" }}
                    >
                      "{d.example}"
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
    </div>
  );
}
