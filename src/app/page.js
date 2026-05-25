"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import JournalFAB from "@/components/JournalFAB";
import { createClient } from "@/lib/supabase-client";

export default function Home() {
  const router = useRouter();
  const [currentWord, setCurrentWord] = useState(null);
  const [currentProgress, setCurrentProgress] = useState(null);
  const [currentSource, setCurrentSource] = useState("new");
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState(new Set());
  const [toast, setToast] = useState(null);
  const [userName, setUserName] = useState("");
  const [streak, setStreak] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [skillLevel, setSkillLevel] = useState("B1");
  const [learningGoal, setLearningGoal] = useState("daily");
  const [journalDueCount, setJournalDueCount] = useState(0);
  const [isWordExiting, setIsWordExiting] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const [profileResult, progressData, streakData, reviewData] = await Promise.all([
          user
            ? supabase.from("profiles").select("name, skill_level, learning_goal").eq("id", user.id).single()
            : Promise.resolve({ data: null }),
          fetch("/api/progress").then(r => r.json()).catch(() => ({})),
          fetch("/api/stats/streak").then(r => r.json()).catch(() => ({})),
          fetch("/api/journal/review").then(r => r.json()).catch(() => ({})),
          fetchNextWord(),
        ]);
        if (reviewData?.due_count) setJournalDueCount(reviewData.due_count);

        if (user && profileResult?.data) {
          const p = profileResult.data;
          setUserName(p.name || user.email?.split("@")[0] || "");
          if (p.skill_level) setSkillLevel(p.skill_level);
          if (p.learning_goal) setLearningGoal(p.learning_goal);
        }


        if (streakData) {
          setStreak(streakData.streak || 0);
          setTotalDays(streakData.total_days || 0);
        }

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

      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setIsLoading(false);
      }
    }
    init();
  }, []);

  const fetchNextWord = async (excludeId = null, withAnimation = false) => {
    if (withAnimation) setIsWordExiting(true);
    try {
      const url = excludeId
        ? `/api/words/next?exclude=${excludeId}`
        : "/api/words/next";
      const fetchPromise = fetch(url).then(r => r.json());
      const data = withAnimation
        ? await Promise.all([fetchPromise, new Promise(r => setTimeout(r, 220))]).then(([d]) => d)
        : await fetchPromise;

      if (data.word) {
        setCurrentWord(data.word);
        setCurrentProgress(data.progress);
        setCurrentSource(data.source);
      }
    } catch (e) {
      console.error("Fetch next word error:", e);
    } finally {
      if (withAnimation) setIsWordExiting(false);
    }
  };

  const handleRate = async (rating) => {
    if (!currentWord) return;
    
    try {
      const res = await fetch("/api/progress/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word_id: currentWord.id, rating }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        if (rating === 0) {
          showToast("🙈 Đã ẩn — sẽ không nhắc lại từ này");
          setTimeout(() => fetchNextWord(currentWord.id, true), 350);
          return;
        }

        const messages = {
          1: "🔄 We'll review this soon",
          2: "💪 Keep practicing!",
          3: `✓ See you in ${data.progress?.next_review_in_days || 3} days`,
          4: `🚀 Mastered! Next in ${data.progress?.next_review_in_days || 7} days`,
        };
        showToast(messages[rating]);

        if (rating >= 3) {
          setLearnedCount(prev => prev + 1);
          triggerConfetti();
        }

        setReviewCount(prev => prev + 1);
        setTimeout(() => fetchNextWord(currentWord.id, true), 350);
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const handler = (e) => {
      const ratingMap = { '1': 1, '2': 2, '3': 3, '4': 4 };
      if (ratingMap[e.key] && currentWord) {
        e.preventDefault();
        handleRate(ratingMap[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentWord]);

  if (isLoading || !currentWord) {
    return (
      <>
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
          <div className="blob blob-4"></div>
        </div>
        <main className="relative z-10">
          <div className="h-14 backdrop-blur-xl border-b mb-5 animate-pulse" style={{ background: "rgba(11,11,22,0.9)", borderColor: "var(--line)" }} />
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 animate-pulse">
            <div className="h-3 rounded-full w-20 mb-8" style={{ background: "var(--surface-elevated)" }} />
            <div className="h-16 rounded-2xl w-64 mb-4" style={{ background: "var(--surface-elevated)" }} />
            <div className="space-y-2.5">
              <div className="h-3 rounded-full w-full" style={{ background: "var(--surface)" }} />
              <div className="h-3 rounded-full w-4/5" style={{ background: "var(--surface)" }} />
              <div className="h-3 rounded-full w-3/5" style={{ background: "var(--surface)" }} />
            </div>
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

      <main className="relative z-10">
        <Header streak={streak} totalDays={totalDays} userName={userName} reviewCount={reviewCount} />
        <WordCard
          word={currentWord}
          progress={currentProgress}
          source={currentSource}
          currentIndex={reviewCount}
          isBookmarked={isCurrentBookmarked}
          onBookmark={toggleBookmark}
          onRate={handleRate}
          skillLevel={skillLevel}
          learningGoal={learningGoal}
          isExiting={isWordExiting}
        />
      </main>

      <JournalFAB
        dueCount={journalDueCount}
        onAdded={() => {
          setJournalDueCount(c => c + 1);
          showToast("📝 Đã lưu vào Journal");
        }}
      />

      {toast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-full font-semibold text-xs sm:text-sm z-[200] flex items-center gap-2 animate-fade-in max-w-[90vw] text-center border" style={{ background: "var(--surface-elevated)", borderColor: "var(--grass-border)", color: "var(--grass-text)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {toast}
        </div>
      )}
    </>
  );
}
