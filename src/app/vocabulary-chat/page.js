"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, MessageCircle, ChevronDown, Volume2, X } from "lucide-react";
import BackButton from "@/components/ui/BackButton";

const TOPIC_ICONS = {
  business: "💼",
  communication: "🗣️",
  psychology: "🧠",
  technology: "💻",
  academic: "🎓",
  daily: "☀️",
};

function starRating(n) {
  const filled = Math.max(0, Math.min(5, n || 0));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

function dueRank(word) {
  if (!word.due_at) return 1;
  return new Date(word.due_at).getTime() <= Date.now() ? 0 : 2;
}

export default function VocabularyChatPage() {
  const router = useRouter();
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTopic, setActiveTopic] = useState(null);
  const [query, setQuery] = useState("");
  const [openFamilies, setOpenFamilies] = useState(new Set());
  const [selectedWord, setSelectedWord] = useState(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/words/by-topic");
        const data = await res.json();
        const list = data.topics || [];
        setTopics(list);
        if (list.length > 0) setActiveTopic(list[0].key);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const currentTopic = topics.find((t) => t.key === activeTopic);

  const filteredFamilies = useMemo(() => {
    if (!currentTopic) return [];
    const q = query.trim().toLowerCase();
    if (!q) return currentTopic.families;
    return currentTopic.families
      .map((f) => ({ ...f, words: f.words.filter((w) => w.word.toLowerCase().includes(q) || w.def_en?.toLowerCase().includes(q)) }))
      .filter((f) => f.words.length > 0);
  }, [currentTopic, query]);

  const toggleFamily = useCallback((name) => {
    setOpenFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const openChat = (word) => {
    const params = new URLSearchParams({ word: word.word, word_id: word.id });
    router.push(`/practice?${params}`);
  };

  const speakWord = (e, word) => {
    e.stopPropagation();
    if ("speechSynthesis" in window) {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = "en-US";
      u.rate = 0.85;
      speechSynthesis.speak(u);
    }
  };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <BackButton label="Quay lại" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            💬 Chat với Alex về từ
          </h1>
          <div className="w-20" />
        </div>

        <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
          Chọn một chủ đề, rồi chọn từ theo nhóm nghĩa (semantic family). Alex sẽ giải thích và trò chuyện để giúp bạn nhớ từ lâu hơn.
        </p>

        {isLoading ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">💬</div>
            <p style={{ color: "var(--ink-soft)" }}>Đang tải...</p>
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="font-semibold" style={{ color: "var(--ink-soft)" }}>Chưa có dữ liệu từ vựng theo chủ đề</p>
          </div>
        ) : (
          <>
            {/* Topic tabs */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {topics.map((t) => (
                <button
                  key={t.key}
                  onClick={() => { setActiveTopic(t.key); setQuery(""); setOpenFamilies(new Set()); }}
                  className="px-4 py-2 rounded-full text-sm font-bold hover:-translate-y-0.5 transition-all flex items-center gap-1.5"
                  style={{
                    background: activeTopic === t.key ? "var(--electric)" : "var(--surface-elevated)",
                    color: activeTopic === t.key ? "var(--on-electric)" : "var(--ink-soft)",
                    boxShadow: activeTopic === t.key ? "0 4px 12px rgba(var(--electric-rgb),0.3)" : "none",
                    border: activeTopic === t.key ? "none" : "1.5px solid var(--line)",
                  }}
                >
                  <span>{TOPIC_ICONS[t.key] || "📚"}</span>
                  {t.label}
                  <span className="opacity-60 text-xs">({t.families.reduce((n, f) => n + f.words.length, 0)})</span>
                </button>
              ))}
            </div>

            {/* Search within topic */}
            <div className="relative mb-5">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-soft)" }} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Tìm từ trong ${currentTopic?.label || ""}...`}
                className="w-full pl-12 pr-5 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1.5px solid var(--line)",
                  color: "var(--ink)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--electric)"; e.target.style.boxShadow = "0 0 0 3px rgba(var(--electric-rgb),0.15)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--line)"; e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-soft)" }}>✕</button>
              )}
            </div>

            {/* Semantic family accordions */}
            <div className="space-y-3">
              {filteredFamilies.length === 0 ? (
                <div className="text-center py-16">
                  <div className="text-4xl mb-3">🔍</div>
                  <p className="font-semibold" style={{ color: "var(--ink-soft)" }}>Không tìm thấy từ nào</p>
                </div>
              ) : (
                filteredFamilies.map((family) => {
                  const isOpen = openFamilies.has(family.name) || query.trim().length > 0;
                  return (
                    <div key={family.name} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)" }}>
                      <button
                        onClick={() => toggleFamily(family.name)}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base" style={{ color: "var(--ink)" }}>{family.name}</span>
                          <span className="text-xs" style={{ color: "var(--ink-soft)" }}>({family.words.length} từ)</span>
                        </div>
                        <ChevronDown
                          size={18}
                          style={{ color: "var(--ink-soft)", transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                        />
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4 flex flex-wrap gap-2">
                          {family.words.map((word) => (
                            <button
                              key={word.id}
                              onClick={() => setSelectedWord(word)}
                              className="px-3 py-2 rounded-xl text-left transition-all hover:scale-[1.02]"
                              style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--electric)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-sm" style={{ color: "var(--ink)" }}>{word.word}</span>
                                {dueRank(word) === 0 && word.user_state && <span className="text-[9px]" title="Cần ôn">🔴</span>}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px]" style={{ color: "var(--sunshine-text)" }}>{starRating(word.frequency)}</span>
                                {word.level && (
                                  <span className="text-[9px] font-bold" style={{ color: "var(--electric)" }}>{word.level}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {selectedWord && (
          <WordDetailModal word={selectedWord} onClose={() => setSelectedWord(null)} onChat={() => openChat(selectedWord)} onSpeak={speakWord} />
        )}
      </main>
    </>
  );
}

function WordDetailModal({ word, onClose, onChat, onSpeak }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "var(--overlay-bg)", backdropFilter: "blur(12px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-[32px] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto animate-slide-up relative"
        style={{ background: "var(--surface-elevated)", border: "1.5px solid var(--line)", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}
      >
        <button onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl flex items-center justify-center hover:rotate-90 transition-all"
          style={{ border: "1.5px solid var(--line)", background: "var(--surface)", color: "var(--ink-soft)" }}
        ><X size={16} /></button>

        <div className="text-center mb-6">
          <h1 className="font-black gradient-text-word mb-2" style={{ fontSize: "clamp(36px,7vw,56px)" }}>
            {word.word}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-2 mb-2">
            {word.phonetic && !word.phonetic.endsWith(".mp3") && (
              <span className="italic" style={{ color: "var(--ink-soft)" }}>{word.phonetic}</span>
            )}
            {word.pos && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
                {word.pos}
              </span>
            )}
            {word.level && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase" style={{ background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--electric-border)" }}>
                {word.level}
              </span>
            )}
            <button onClick={(e) => onSpeak(e, word.word)}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 transition-all"
              style={{ background: "linear-gradient(135deg,var(--electric),var(--electric-muted))", color: "var(--on-electric)" }}>
              <Volume2 size={16} />
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--sunshine-text)" }}>{starRating(word.frequency)}</p>
        </div>

        <div className="space-y-3">
          {word.def_en && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--electric)" }}>📖 Definition</div>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{word.def_en}</p>
            </div>
          )}

          {word.ex_en && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ocean)" }}>💬 Example</div>
              <p className="text-sm italic" style={{ color: "var(--ink-soft)" }}>&ldquo;{word.ex_en}&rdquo;</p>
            </div>
          )}

          {word.collocations?.length > 0 && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--grass-text)" }}>🔗 Collocations</div>
              <div className="flex flex-wrap gap-2">
                {word.collocations.map((c, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "var(--grass-soft)", color: "var(--grass-text)", border: "1px solid var(--grass-border)" }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(word.register || word.usage_notes) && (
            <div className="p-4 rounded-2xl" style={{ background: "var(--surface)", border: "1.5px solid var(--line)" }}>
              <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--ink-soft)" }}>📝 Usage</div>
              {word.register && (
                <p className="text-sm" style={{ color: "var(--ink)" }}>Register: <span className="font-semibold capitalize">{word.register}</span></p>
              )}
              {word.usage_notes && (
                <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>{word.usage_notes}</p>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onChat}
          className="w-full mt-5 py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
          style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 4px 20px rgba(var(--electric-rgb),0.3)" }}
        >
          <MessageCircle size={16} /> Chat với Alex về từ này
        </button>
      </div>
    </div>
  );
}
