"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import WordCard from "@/components/WordCard";
import { greetings } from "@/data/vocabulary";
import { createClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, GraduationCap, Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const [currentWord, setCurrentWord] = useState(null);
  const [currentProgress, setCurrentProgress] = useState(null);
  const [currentSource, setCurrentSource] = useState("new");
  const [isLoading, setIsLoading] = useState(true);
  const [learnedCount, setLearnedCount] = useState(0);
  const [bookmarkedWordIds, setBookmarkedWordIds] = useState(new Set());
  const [greetingEmoji, setGreetingEmoji] = useState('👋');
  const [toast, setToast] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [userName, setUserName] = useState("");
  const [streak, setStreak] = useState(0);
  const [totalDays, setTotalDays] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [skillLevel, setSkillLevel] = useState("B1");
  const [learningGoal, setLearningGoal] = useState("daily");

  // Journal quick-add
  const [journalWord, setJournalWord] = useState("");
  const [journalMeaning, setJournalMeaning] = useState("");
  const [journalExpanded, setJournalExpanded] = useState(false);
  const [isAddingJournal, setIsAddingJournal] = useState(false);
  const [journalDueCount, setJournalDueCount] = useState(0);
  const journalWordRef = useRef(null);
  const journalFormRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (journalFormRef.current && !journalFormRef.current.contains(e.target)) {
        setJournalExpanded(false);
        setJournalWord("");
        setJournalMeaning("");
      }
    }
    if (journalExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [journalExpanded]);

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
        setMounted(true);
      }
    }
    init();
    setGreetingEmoji(greetings[Math.floor(Math.random() * greetings.length)]);
  }, []);

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
          setTimeout(() => fetchNextWord(currentWord.id), 800);
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
        setTimeout(() => fetchNextWord(currentWord.id), 800);
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

  const handleAddJournal = async (e) => {
    e.preventDefault();
    if (!journalWord.trim()) return;
    setIsAddingJournal(true);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: journalWord, meaning_vi: journalMeaning }),
      });
      if (res.ok) {
        setJournalWord("");
        setJournalMeaning("");
        setJournalExpanded(false);
        setJournalDueCount(c => c + 1);
        showToast(`📝 Đã lưu "${journalWord.trim()}"`);
      }
    } finally {
      setIsAddingJournal(false);
    }
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

  const getDateString = () => {
    if (!mounted) return '';
    return new Date().toLocaleDateString('en-US', { 
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
            <div className="text-5xl sm:text-6xl mb-4 animate-bounce-soft">🌈</div>
            <p className="text-base sm:text-xl font-semibold gradient-text-purple-pink">
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

      <main className="relative z-10 w-full max-w-2xl sm:max-w-3xl lg:max-w-5xl mx-auto px-4 sm:px-8 py-4 sm:py-6 pb-10">
        <Header
          streak={streak}
          totalDays={totalDays}
          userName={userName}
        />

        <div className="flex items-center gap-2 mb-3 px-1">
          <span className="text-lg">{greetingEmoji}</span>
          <div>
            <span className="font-bold text-sm sm:text-base">
              {userName ? `Hi ${userName}` : "Hi there"}
            </span>
            <span className="text-[--ink-soft] text-xs ml-2">{getDateString()}</span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs font-semibold text-[--ink-soft]">
            <span><b className="text-[--grass]">{reviewCount}</b> hôm nay</span>
            <span><b className="text-[--electric]">{learnedCount}</b> tổng</span>
          </div>
        </div>

        {/* Journal quick-add bar */}
        <form
          ref={journalFormRef}
          onSubmit={handleAddJournal}
          className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[--line] px-3 py-2 mb-3 flex flex-col gap-2"
          style={{ boxShadow: "0 2px 12px rgba(108,92,231,0.06)" }}
        >
          <div className="flex items-center gap-2">
            <NotebookPen size={14} className="text-[--electric] flex-shrink-0" />
            <input
              ref={journalWordRef}
              type="text"
              value={journalWord}
              onChange={e => setJournalWord(e.target.value)}
              onFocus={() => setJournalExpanded(true)}
              placeholder="Ghi từ mới vào journal..."
              autoComplete="off"
              className="flex-1 text-sm font-semibold bg-transparent outline-none placeholder:text-[--ink-soft] placeholder:font-normal text-[--ink]"
            />
            {journalExpanded ? (
              <button
                type="submit"
                disabled={isAddingJournal || !journalWord.trim()}
                className="w-7 h-7 rounded-xl flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,var(--electric),var(--electric-muted))" }}
              >
                {isAddingJournal ? <Loader2 size={12} className="animate-spin" /> : <Plus size={13} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push("/journal/review")}
                disabled={journalDueCount === 0}
                className="flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-xs flex-shrink-0 disabled:opacity-40 hover:-translate-y-0.5 transition-all"
                style={{ background: "linear-gradient(135deg,var(--electric),var(--electric-muted))", color: "white" }}
              >
                <GraduationCap size={12} />
                Ôn {journalDueCount > 0 && <span>{journalDueCount}</span>}
              </button>
            )}
          </div>

          {journalExpanded && (
            <div className="flex items-center gap-2 animate-fade-in">
              <div className="w-3.5 flex-shrink-0" />
              <input
                type="text"
                value={journalMeaning}
                onChange={e => setJournalMeaning(e.target.value)}
                placeholder="Nghĩa tiếng Việt (tuỳ chọn)"
                autoComplete="off"
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-[--ink-soft] text-[--ink]"
              />
              <button
                type="button"
                onClick={() => { setJournalExpanded(false); setJournalWord(""); setJournalMeaning(""); }}
                className="text-xs text-[--ink-soft] hover:text-[--ink] flex-shrink-0"
              >
                Huỷ
              </button>
            </div>
          )}
        </form>

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
        />

      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-full font-semibold text-xs sm:text-sm z-[200] shadow-[0_20px_48px_rgba(45,27,78,0.12)] border-2 border-[--mint] text-[--grass] flex items-center gap-2 animate-fade-in max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </>
  );
}
