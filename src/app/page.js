"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import StatsBar from "@/components/StatsBar";
import SettingsModal from "@/components/SettingsModal";
import { greetings } from "@/data/vocabulary";
import { createClient } from "@/lib/supabase-client";

const defaultSettings = {
  email: '', name: '', time: '07:00:00',
  frequency: 'daily', customDays: [],
  level: 'intermediate', enabled: false
};

function transformWord(dbWord) {
  return {
    id: dbWord.id,
    word: dbWord.word,
    phonetic: dbWord.phonetic,
    pos: dbWord.pos,
    level: dbWord.level,
    defEn: dbWord.def_en,
    exEn: dbWord.ex_en,
    syn: dbWord.synonyms || []
  };
}

export default function Home() {
  const [vocabulary, setVocabulary] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [learnedWordIds, setLearnedWordIds] = useState(new Set());
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState(new Set());
  const [settings, setSettings] = useState(defaultSettings);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [greetingEmoji, setGreetingEmoji] = useState('👋');
  const [toast, setToast] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();
          setUserName(profile?.name || user.email?.split("@")[0] || "");
        }

        const [wordsRes, progressRes, prefsRes] = await Promise.all([
          fetch("/api/words"),
          fetch("/api/progress"),
          fetch("/api/email-preferences"),
        ]);

        const wordsData = await wordsRes.json();
        const progressData = await progressRes.json();
        const prefsData = await prefsRes.json();

        if (wordsData.words) {
          setVocabulary(wordsData.words.map(transformWord));
        }

        if (progressData.progress) {
          const learnedIds = new Set();
          const bookmarkIds = new Set();
          progressData.progress.forEach(p => {
            if (p.review_count > 0) learnedIds.add(p.word_id);
            if (p.is_bookmarked) bookmarkIds.add(p.word_id);
          });
          setLearnedWordIds(learnedIds);
          setBookmarkedWordIds(bookmarkIds);
        }

        if (prefsData.preferences) {
          const p = prefsData.preferences;
          setSettings({
            email: user?.email || '',
            name: '',
            time: p.send_time || '07:00:00',
            frequency: p.frequency || 'daily',
            customDays: p.custom_days || [],
            level: 'intermediate',
            enabled: p.enabled || false,
          });
        }
      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setIsLoading(false);
        setMounted(true);
      }
    }
    init();
    setGreetingEmoji(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);

  useEffect(() => {
    if (vocabulary.length > 0) {
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
      setCurrentIndex(dayOfYear % vocabulary.length);
    }
  }, [vocabulary]);

  useEffect(() => {
    if (!mounted || vocabulary.length === 0) return;
    const word = vocabulary[currentIndex];
    if (!word) return;
    
    if (!learnedWordIds.has(word.id)) {
      fetch("/api/progress/mark-learned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: word.id }),
      }).then(() => {
        setLearnedWordIds(prev => new Set(prev).add(word.id));
      }).catch(e => console.error("Mark learned error:", e));
    }
  }, [currentIndex, mounted, vocabulary]);

  const nextWord = () => {
    if (vocabulary.length === 0) return;
    setCurrentIndex((currentIndex + 1) % vocabulary.length);
  };

  const prevWord = () => {
    if (vocabulary.length === 0) return;
    setCurrentIndex((currentIndex - 1 + vocabulary.length) % vocabulary.length);
  };

  const toggleBookmark = async () => {
    const word = vocabulary[currentIndex];
    if (!word) return;
    
    const newBookmarkState = !bookmarkedWordIds.has(word.id);
    const updated = new Set(bookmarkedWordIds);
    if (newBookmarkState) {
      updated.add(word.id);
      showToast('💖 Added to favorites!');
    } else {
      updated.delete(word.id);
    }
    setBookmarkedWordIds(updated);

    try {
      await fetch("/api/progress/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          word_id: word.id, 
          is_bookmarked: newBookmarkState 
        }),
      });
    } catch (e) {
      console.error("Bookmark error:", e);
    }
  };

  const markKnown = () => {
    showToast('✓ Great job! Keep going!');
    triggerConfetti();
    setTimeout(nextWord, 600);
  };

  const triggerConfetti = () => {
    const colors = ['#FF5C8A', '#6C5CE7', '#FFB627', '#00C896', '#00B4D8', '#FF6B47'];
    for (let i = 0; i < 30; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.top = '40%';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
      c.style.animationDelay = Math.random() * 0.3 + 's';
      c.style.animationDuration = (1 + Math.random()) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  };

  const handleSaveSettings = async (newSettings) => {
    setSettings(newSettings);
    
    try {
      await fetch("/api/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: newSettings.enabled,
          send_time: newSettings.time,
          frequency: newSettings.frequency,
          custom_days: newSettings.customDays,
        }),
      });
      showToast('✓ Settings saved!');
      triggerConfetti();
      setIsModalOpen(false);
    } catch (e) {
      console.error("Save settings error:", e);
      showToast('⚠️ Save error');
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handler = (e) => {
      if (isModalOpen) return;
      if (e.key === 'ArrowRight') nextWord();
      if (e.key === 'ArrowLeft') prevWord();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const getDateString = () => {
    if (!mounted) return '';
    return new Date().toLocaleDateString('vi-VN', { 
      weekday: 'long', day: 'numeric', month: 'long' 
    });
  };

  if (isLoading || vocabulary.length === 0) {
    return (
      <>
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
        </div>
        <main className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce-soft">🌈</div>
            <p className="text-xl font-semibold gradient-text-purple-pink">
              Loading vocabulary...
            </p>
          </div>
        </main>
      </>
    );
  }

  const word = vocabulary[currentIndex];
  const progressPercent = ((currentIndex + 1) / vocabulary.length) * 100;
  const isCurrentBookmarked = word ? bookmarkedWordIds.has(word.id) : false;

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        <Header 
          streak={Math.min(learnedWordIds.size, 365)}
          userName={userName}
          onOpenSettings={() => setIsModalOpen(true)}
        />

        <div className="mb-6 text-center">
          <div className="text-5xl inline-block animate-bounce-soft">{greetingEmoji}</div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold mt-2 mb-1 tracking-tight">
            {userName ? `Hi ${userName}, ` : "Hi there, "}ready to learn{" "}
            <em className="italic" style={{ background: 'linear-gradient(135deg, #FF5C8A, #FFB627)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              new words
            </em>
            ?
          </h2>
          <p className="text-[--ink-soft] text-base">{getDateString()}</p>
        </div>

        <div className="bg-white rounded-full px-4 sm:px-6 py-3.5 flex items-center gap-3 sm:gap-4 mx-auto w-fit shadow-[0_8px_24px_rgba(108,92,231,0.08)] border-2 border-[--line] mb-8">
          <span className="text-lg">📚</span>
          <div className="w-32 sm:w-52 h-2 bg-[--whisper] rounded-full overflow-hidden relative shimmer-effect">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ 
                width: `${progressPercent}%`,
                background: 'linear-gradient(90deg, #B8F3D2, #00B4D8)'
              }}
            ></div>
          </div>
          <div className="font-bold text-xs sm:text-sm whitespace-nowrap">
            <span className="text-[--grass]">{currentIndex + 1}</span> / {vocabulary.length} words
          </div>
        </div>

        <WordCard 
          word={word}
          currentIndex={currentIndex}
          total={vocabulary.length}
          isBookmarked={isCurrentBookmarked}
          onBookmark={toggleBookmark}
          onPrev={prevWord}
          onNext={nextWord}
          onKnown={markKnown}
        />

        <StatsBar 
          streak={Math.min(learnedWordIds.size, 365)}
          learned={learnedWordIds.size}
          todayNum={currentIndex + 1}
          emailEnabled={settings.enabled}
        />
      </main>

      <SettingsModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      {toast && (
        <div 
          className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white px-6 py-3.5 rounded-full font-semibold text-sm z-[200] shadow-[0_20px_48px_rgba(45,27,78,0.12)] border-2 border-[--mint] text-[--grass] flex items-center gap-2 animate-fade-in"
        >
          {toast}
        </div>
      )}
    </>
  );
}
