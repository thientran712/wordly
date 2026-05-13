"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Volume2, BookOpen, Sparkles, Bookmark } from "lucide-react";

const LEVELS = ['all', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FILTERS = [
  { value: 'all', label: 'All', icon: '📚' },
  { value: 'bookmarked', label: 'Favorites', icon: '💖' },
  { value: 'learned', label: 'Learned', icon: '✅' },
  { value: 'new', label: 'New', icon: '✨' },
];

export default function WordsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [level, setLevel] = useState("all");
  const [words, setWords] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchWords(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, filter, level]);

  const fetchWords = useCallback(async (pageNum = 1) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        filter,
        level,
        page: pageNum.toString(),
      });
      
      const res = await fetch(`/api/words/search?${params}`);
      const data = await res.json();
      
      if (data.words) {
        if (pageNum === 1) {
          setWords(data.words);
        } else {
          setWords(prev => [...prev, ...data.words]);
        }
        setTotal(data.total);
        setHasMore(data.has_more);
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setIsLoading(false);
    }
  }, [query, filter, level]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchWords(nextPage);
  };

  const speakWord = (e, word) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
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

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/learn")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/50 transition-all"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight">
            📚 Browse Words
          </h1>
          <div className="w-20"></div>
        </div>

        {/* Search box */}
        <div className="relative mb-6">
          <Search 
            size={20} 
            className="absolute left-5 top-1/2 -translate-y-1/2 text-[--ink-soft]" 
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words... (e.g. 'res' to find resilient, restore...)"
            className="w-full pl-14 pr-6 py-4 bg-white border-2 border-white rounded-3xl text-base font-medium focus:outline-none focus:border-[--electric] focus:ring-4 focus:ring-purple-100 transition-all"
            style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[--ink-soft] hover:text-[--hot-pink]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="space-y-3 mb-6">
          {/* Status filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap cursor-pointer transition-all ${
                  filter === f.value 
                    ? 'bg-[--hot-pink] text-white shadow-[0_4px_12px_rgba(255,92,138,0.25)]'
                    : 'bg-white text-[--ink-soft] border-2 border-[--line] hover:border-[--hot-pink]'
                }`}
              >
                <span className="mr-1">{f.icon}</span>
                {f.label}
              </button>
            ))}
          </div>

          {/* Level filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {LEVELS.map(lv => (
              <button
                key={lv}
                onClick={() => setLevel(lv)}
                className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap cursor-pointer transition-all ${
                  level === lv 
                    ? 'bg-[--electric] text-white shadow-[0_4px_12px_rgba(108,92,231,0.25)]'
                    : 'bg-white text-[--ink-soft] border-2 border-[--line] hover:border-[--electric]'
                }`}
              >
                {lv === 'all' ? 'All levels' : lv}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        {!isLoading && (
          <p className="text-sm text-[--ink-soft] mb-4">
            Found <span className="font-bold text-[--ink]">{total}</span> word{total !== 1 ? 's' : ''}
            {query && <> matching "<span className="font-bold">{query}</span>"</>}
          </p>
        )}

        {/* Word grid */}
        {isLoading && words.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3 animate-bounce-soft">🔍</div>
            <p className="text-[--ink-soft]">Searching...</p>
          </div>
        ) : words.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-3">🤷</div>
            <p className="text-[--ink-soft]">No words found. Try a different search!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {words.map(word => (
                <WordItem 
                  key={word.id} 
                  word={word}
                  onClick={() => setSelectedWord(word)}
                  onSpeak={speakWord}
                />
              ))}
            </div>
            
            {hasMore && (
              <div className="text-center">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-3 bg-white border-2 border-[--electric] text-[--electric] rounded-full font-bold text-sm cursor-pointer transition-all hover:bg-[--lavender] disabled:opacity-50"
                >
                  {isLoading ? 'Loading...' : 'Load more words'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Word detail modal */}
        {selectedWord && (
          <WordDetailModal 
            word={selectedWord} 
            onClose={() => setSelectedWord(null)} 
          />
        )}
      </main>
    </>
  );
}

function WordItem({ word, onClick, onSpeak }) {
  const stateConfig = {
    new: { bg: '#FFF', border: '#E8DFF5', emoji: '' },
    learning: { bg: '#FFF1F8', border: '#FFD0E2', emoji: '🌱' },
    review: { bg: '#F0EDFC', border: '#DCC9FF', emoji: '🌿' },
    relearning: { bg: '#FFE9A8', border: '#FFD75A', emoji: '🔁' },
  };
  
  const state = stateConfig[word.user_state] || stateConfig.new;
  
  return (
    <button
      onClick={onClick}
      className="text-left p-4 rounded-2xl border-2 cursor-pointer transition-all hover:scale-[1.02] hover:-translate-y-0.5"
      style={{
        background: state.bg,
        borderColor: state.border,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif font-bold text-lg truncate">{word.word}</h3>
          {word.phonetic && (
            <p className="text-xs text-[--ink-soft] italic truncate">{word.phonetic}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {word.is_bookmarked && <span className="text-base">💖</span>}
          <button
            onClick={(e) => onSpeak(e, word.word)}
            className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white text-[--electric]"
            title="Pronounce"
          >
            <Volume2 size={14} />
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-1.5 flex-wrap">
        {word.level && (
          <span 
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
            style={{ background: '#DCC9FF', color: '#5B3FBC' }}
          >
            {word.level}
          </span>
        )}
        <span 
          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
          style={{ background: '#B8F3D2', color: '#00754C' }}
        >
          {word.pos}
        </span>
        {state.emoji && (
          <span className="text-xs">{state.emoji}</span>
        )}
      </div>
    </button>
  );
}

function WordDetailModal({ word, onClose }) {
  const speakWord = () => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(word.word);
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
    }
  };
  
  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(45, 27, 78, 0.4)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div 
        className="bg-white rounded-[32px] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-up"
        style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.18)' }}
      >
        <button onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-xl border-2 border-[--line] bg-white cursor-pointer flex items-center justify-center hover:bg-[--pink] hover:rotate-90 transition-all text-[--ink-soft]"
        >
          ✕
        </button>
        
        <div className="text-center mb-6">
          <h1 className="font-serif font-black tracking-tight gradient-text-word mb-3"
            style={{ fontSize: 'clamp(48px, 8vw, 80px)' }}
          >
            {word.word}
          </h1>
          
          <div className="inline-flex flex-wrap items-center justify-center gap-3">
            {word.phonetic && (
              <span className="font-serif italic text-lg text-[--ink-soft]">{word.phonetic}</span>
            )}
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
              style={{ background: '#B8F3D2', color: '#00754C' }}
            >
              {word.pos}
            </span>
            {word.level && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase"
                style={{ background: '#DCC9FF', color: '#5B3FBC' }}
              >
                {word.level}
              </span>
            )}
            <button
              onClick={speakWord}
              className="w-12 h-12 rounded-full text-white cursor-pointer hover:scale-110 transition-all flex items-center justify-center"
              style={{ 
                background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)',
                boxShadow: '0 8px 20px rgba(108, 92, 231, 0.35)'
              }}
            >
              <Volume2 size={20} />
            </button>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="p-5 rounded-2xl border-2"
            style={{ background: 'linear-gradient(135deg, #FFF1F8, #FFE8F0)', borderColor: '#FFD0E2' }}
          >
            <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[--hot-pink]">
              📖 Definition
            </div>
            <p className="text-base font-medium">{word.def_en}</p>
          </div>
          
          {word.ex_en && (
            <div className="p-5 rounded-2xl border-2"
              style={{ background: 'linear-gradient(135deg, #F0F9FF, #E8F4FE)', borderColor: '#C9E5FB' }}
            >
              <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[--ocean]">
                💬 Example
              </div>
              <p className="text-base italic">"{word.ex_en}"</p>
            </div>
          )}
          
          {word.synonyms && word.synonyms.length > 0 && (
            <div className="p-5 rounded-2xl border-2"
              style={{ background: 'linear-gradient(135deg, #F0FFF4, #E0FBE8)', borderColor: '#B8E8C9' }}
            >
              <div className="text-xs font-bold uppercase tracking-widest mb-2 text-[--grass]">
                ✨ Synonyms
              </div>
              <div className="flex flex-wrap gap-2">
                {word.synonyms.map((s, i) => (
                  <span key={i}
                    className="px-3 py-1.5 bg-white border-2 rounded-full font-semibold text-sm text-[--grass]"
                    style={{ borderColor: '#B8E8C9' }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
