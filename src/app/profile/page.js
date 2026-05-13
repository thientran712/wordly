"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Target, BookOpen, Hash, Loader2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

const LEVEL_LABELS = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

const GOAL_LABELS = {
  daily: '💬 Daily Life',
  toeic: '📊 TOEIC',
  ielts: '🎓 IELTS',
  business: '💼 Business',
  travel: '✈️ Travel',
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [authProvider, setAuthProvider] = useState("email");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  
  // Form state
  const [name, setName] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [dailyGoal, setDailyGoal] = useState(5);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      
      if (data.profile) {
        setProfile(data.profile);
        setEmail(data.email);
        setAuthProvider(data.auth_provider);
        setName(data.profile.name || "");
        setSkillLevel(data.profile.skill_level || "");
        setLearningGoal(data.profile.learning_goal || "");
        setDailyGoal(data.profile.daily_goal || 5);
      }
    } catch (e) {
      console.error("Fetch profile error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);
    
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          skill_level: skillLevel,
          learning_goal: learningGoal,
          daily_goal: parseInt(dailyGoal),
        }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || "Failed to save");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm("We'll send a password reset link to your email. Continue?")) return;
    
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) {
      setError(error.message);
    } else {
      alert("✉️ Check your email for the reset link!");
    }
  };

  if (isLoading) {
    return (
      <>
        <div className="bg-blobs">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
        </div>
        <main className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4 animate-bounce-soft">👤</div>
            <p className="text-xl font-semibold gradient-text-purple-pink">Loading profile...</p>
          </div>
        </main>
      </>
    );
  }

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
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/learn")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/50 transition-all"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            👤 Your Profile
          </h1>
          <div className="w-20"></div>
        </div>

        {/* Account Info */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <Mail size={20} className="text-[--electric]" />
            Account
          </h2>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[--ink-soft] uppercase tracking-wider">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-semibold">{email}</p>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                  style={{ 
                    background: authProvider === 'google' ? '#E8F4FE' : '#F0EDFC',
                    color: authProvider === 'google' ? '#1A73E8' : '#5B3FBC',
                  }}
                >
                  {authProvider}
                </span>
              </div>
            </div>
            
            {authProvider === 'email' && (
              <button
                onClick={handleResetPassword}
                className="text-sm text-[--electric] font-semibold hover:underline"
              >
                Change password →
              </button>
            )}
          </div>
        </div>

        {/* Personal Info */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <User size={20} className="text-[--hot-pink]" />
            Personal Info
          </h2>
          
          <div>
            <label className="font-bold text-sm mb-2 block">Your name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </div>
        </div>

        {/* Learning Preferences */}
        <div 
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <Target size={20} className="text-[--grass]" />
            Learning Preferences
          </h2>
          
          <div className="space-y-4">
            {/* Skill Level */}
            <div>
              <label className="font-bold text-sm mb-2 block flex items-center gap-1.5">
                <BookOpen size={14} />
                English Level
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSkillLevel(value)}
                    className={`py-2 px-2 rounded-xl border-2 font-bold text-sm cursor-pointer transition-all ${
                      skillLevel === value 
                        ? 'bg-[--lavender] border-[--electric] text-[--electric]'
                        : 'bg-[--whisper] border-[--line] text-[--ink-soft] hover:border-[--electric]'
                    }`}
                    title={label}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {/* Goal */}
            <div>
              <label className="font-bold text-sm mb-2 block">Learning Goal</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(GOAL_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setLearningGoal(value)}
                    className={`py-2.5 px-2 rounded-xl border-2 font-semibold text-xs cursor-pointer transition-all ${
                      learningGoal === value 
                        ? 'bg-[--mint] border-[--grass] text-[--grass]'
                        : 'bg-[--whisper] border-[--line] text-[--ink-soft] hover:border-[--grass]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Goal */}
            <div>
              <label className="font-bold text-sm mb-2 block flex items-center gap-1.5">
                <Hash size={14} />
                Daily Words Goal: <span className="text-[--hot-pink]">{dailyGoal} words/day</span>
              </label>
              <input
                type="range"
                min="1"
                max="30"
                value={dailyGoal}
                onChange={(e) => setDailyGoal(e.target.value)}
                className="w-full h-2 bg-[--whisper] rounded-full appearance-none cursor-pointer accent-[--hot-pink]"
              />
              <div className="flex justify-between text-xs text-[--ink-soft] mt-1">
                <span>1</span>
                <span>15</span>
                <span>30</span>
              </div>
            </div>
          </div>
        </div>

        {/* Error/Success */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-sm text-[#B83426]">
            ⚠️ {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ 
            background: success 
              ? 'linear-gradient(135deg, #00C896, #B8F3D2)'
              : 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
            boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)'
          }}
        >
          {isSaving ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Saving...
            </>
          ) : success ? (
            <>
              <Check size={18} />
              Saved!
            </>
          ) : (
            "💾 Save Changes"
          )}
        </button>
      </main>
    </>
  );
}
