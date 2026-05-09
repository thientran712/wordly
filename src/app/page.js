"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import StatsBar from "@/components/StatsBar";
import SettingsModal from "@/components/SettingsModal";
import { vocabulary, greetings } from "@/data/vocabulary";

const STORAGE_KEYS = {
  settings: 'wordly_settings',
  learned: 'wordly_learned',
  bookmarks: 'wordly_bookmarks',
  index: 'wordly_index'
};

const defaultSettings = {
  email: '',
  name: '',
  time: '07:00',
  frequency: 'daily',
  customDays: [],
  level: 'intermediate',
  enabled: false
};

export default function Home() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [learnedWords, setLearnedWords] = useState(new Set());
  const [bookmarkedWords, setBookmarkedWords] = useState(new Set());
  const [settings, setSettings] = useState(defaultSettings);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [greetingEmoji, setGreetingEmoji] = useState('👋');
  const [toast, setToast] = useState(null);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.settings);
      if (s) setSettings(JSON.parse(s));
      
      const l = localStorage.getItem(STORAGE_KEYS.learned);
      if (l) setLearnedWords(new Set(JSON.parse(l)));
      
      const b = localStorage.getItem(STORAGE_KEYS.bookmarks);
      if (b) setBookmarkedWords(new Set(JSON.parse(b)));
      
      const i = localStorage.getItem(STORAGE_KEYS.index);
      if (i) {
        setCurrentIndex(parseInt(JSON.parse(i)));
      } else {
        // Set initial word based on day of year
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        setCurrentIndex(dayOfYear % vocabulary.length);
      }
    } catch (e) {
      console.error('Load error:', e);
    }
    
    setGreetingEmoji(greetings[Math.floor(Math.random() * greetings.length)]);
    setMounted(true);
  }, []);

  // Persist learned words & current word
  useEffect(() => {
    if (!mounted) return;
    try {
      const updated = new Set(learnedWords);
      updated.add(currentIndex);
      setLearnedWords(updated);
      localStorage.setItem(STORAGE_KEYS.learned, JSON.stringify([...updated]));
      localStorage.setItem(STORAGE_KEYS.index, JSON.stringify(currentIndex));
    } catch (e) {}
  }, [currentIndex, mounted]);

  const nextWord = () => {
    setCurrentIndex((currentIndex + 1) % vocabulary.length);
  };

  const prevWord = () => {
    setCurrentIndex((currentIndex - 1 + vocabulary.length) % vocabulary.length);
  };

  const toggleBookmark = () => {
    const updated = new Set(bookmarkedWords);
    if (updated.has(currentIndex)) {
      updated.delete(currentIndex);
    } else {
      updated.add(currentIndex);
      showToast('💖 Đã thêm vào yêu thích!');
    }
    setBookmarkedWords(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify([...updated]));
    } catch (e) {}
  };

  const markKnown = () => {
    showToast('✓ Tuyệt vời! Tiếp tục nào!');
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

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(newSettings));
    } catch (e) {}
    showToast('✓ Đã lưu cài đặt!');
    triggerConfetti();
    setIsModalOpen(false);
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Keyboard navigation
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
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const word = vocabulary[currentIndex];
  const progressPercent = ((currentIndex + 1) / vocabulary.length) * 100;

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
          streak={Math.min(learnedWords.size, 365)}
          onOpenSettings={() => setIsModalOpen(true)}
        />

        {/* Greeting */}
        <div className="mb-6 text-center">
          <div className="text-5xl inline-block animate-bounce-soft">{greetingEmoji}</div>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold mt-2 mb-1 tracking-tight">
            Chào bạn, sẵn sàng học{" "}
            <em className="italic" style={{ background: 'linear-gradient(135deg, #FF5C8A, #FFB627)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              từ mới
            </em>
            {" "}chưa?
          </h2>
          <p className="text-[--ink-soft] text-base">{getDateString()}</p>
        </div>

        {/* Progress Pill */}
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
            <span className="text-[--grass]">{currentIndex + 1}</span> / {vocabulary.length} từ
          </div>
        </div>

        <WordCard 
          word={word}
          currentIndex={currentIndex}
          total={vocabulary.length}
          isBookmarked={bookmarkedWords.has(currentIndex)}
          onBookmark={toggleBookmark}
          onPrev={prevWord}
          onNext={nextWord}
          onKnown={markKnown}
        />

        <StatsBar 
          streak={Math.min(learnedWords.size, 365)}
          learned={learnedWords.size}
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

      {/* Toast */}
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
