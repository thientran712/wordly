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

export default function Home() {
  const [currentWord, setCurrentWord] = useState(null);
  const [currentProgress, setCurrentProgress] = useState(null);
  const [currentSource, setCurrentSource] = useState("new");
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState(new Set());
  const [settings, setSettings] = useState(defaultSettings);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [greetingEmoji, setGreetingEmoji] = useState('👋');
  const [toast, setToast] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("");
  const [streak, setStreak] = useState(0);
  const [reviewCount, setReviewCount] = useState(0); // Today's reviews

  // Initial fetch
  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name, current_streak")
            .eq("id", user.id)
            .single();
          setUserName(profile?.name || user.email?.split("@")[0] || "");
          setStreak(profile?.current_streak || 0);
        }

        // Fetch progress data
        const progressRes = await fetch("/api/progress");
        const progressData = await progressRes.json();
        
        if (progressData.progress) {
          const bookmarkIds = new Set();
          let learned = 0;
          progressData.progress.forEach(p => {
            if (p.is_bookmarked) bookmarkIds.add(p.word_id);
            if (p.state !== 'new') learned++;
          });
          setBookmarkedWordIds(bookmarkIds);
          setLearnedCount(learned);
        }

        // Fetch email preferences
        const prefsRes = await fetch("/api/email-preferences");
        const prefsData = await prefsRes.json();
        
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

        // Fetch first word
        await fetchNextWord();
        
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

  // Fetch next word using FSRS smart selection
  const fetchNextWord = async (excludeId = null) => {
    try {
      const url = excludeId 
        ? `/api/words/next?exclude=${excludeId}`
        : "/api/words/next";
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.word) {
        setCurrentWord(data.word);
        setCurrentProgress(data.progress);
        setCurrentSource(data.source);
      }
    } catch (e) {
      console.error("Fetch next word error:", e);
    }
  };

  // Handle rating
  const handleRate = async (rating) => {
    if (!currentWord) return;
    
    try {
      const res = await fetch("/api/progress/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          word_id: currentWord.id, 
          rating 
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Show toast với feedback
        const messages = {
          1: "🔄 We'll review this soon",
          2: "💪 Keep practicing!",
          3: `✓ See you in ${data.progress.next_review_in_days || 3} days`,
          4: `🚀 Mastered! Next review in ${data.progress.next_review_in_days || 7} days`,
        };
        showToast(messages[rating]);
        
        // Update learned count
        if (rating >= 3) {
          setLearnedCount(prev => prev + 1);
          triggerConfetti();
        }
        
        setReviewCount(prev => prev + 1);
        
        // Fetch next word
        setTimeout(() => {
          fetchNextWord(currentWord.id);
        }, 800);
      }
    } catch (e) {
      console.error("Rate error:", e);
      showToast('⚠️ Error saving rating');
    }
  };

  const toggleBookmark = async () => {
    if (!currentWord) return;
    
    const newBookmarkState = !bookmarkedWordIds.has(currentWord.id);
    const updated = new Set(bookmarkedWordIds);
    if (newBookmarkState) {
      updated.add(currentWord.id);
      showToast('💖 Added to favorites!');
    } else {
      updated.delete(currentWord.id);
    }
    setBookmarkedWordIds(updated);

    try {
      await fetch("/api/progress/bookmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          word_id: currentWord.id, 
          is_bookmarked: newBookmarkState 
        }),
      });
    } catch (e) {
      console.error("Bookmark error:", e);
    }
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

  // Keyboard shortcuts for rating
  useEffect(() => {
    const handler = (e) => {
      if (isModalOpen) return;
      const ratingMap = { '1': 1, '2': 2, '3': 3, '4': 4 };
      if (ratingMap[e.key] && currentWord) {
        e.preventDefault();
        handleRate(ratingMap[e.key]);
      }
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

  if (isLoading || !currentWord) {
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
              Loading your next word...
            </p>
          </div>
        </main>
      </>
    );
  }

  const isCurrentBookmarked = bookmarkedWordIds.has(currentWord.id);

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
          streak={streak}
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
          <div className="font-bold text-xs sm:text-sm whitespace-nowrap">
            <span className="text-[--grass]">{reviewCount}</span> reviewed today
          </div>
          <span className="text-[--line]">·</span>
          <div className="font-bold text-xs sm:text-sm whitespace-nowrap">
            <span className="text-[--electric]">{learnedCount}</span> learned total
          </div>
        </div>

        <WordCard 
          word={currentWord}
          progress={currentProgress}
          source={currentSource}
          currentIndex={reviewCount}
          isBookmarked={isCurrentBookmarked}
          onBookmark={toggleBookmark}
          onRate={handleRate}
        />

        <StatsBar 
          streak={streak}
          learned={learnedCount}
          todayNum={reviewCount}
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
