"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Target, BookOpen, Hash, Loader2, Check, Bell, Send } from "lucide-react";
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

  // Email preferences state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("08:00");
  const [frequency, setFrequency] = useState("daily");
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const [profileRes, emailPrefRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/email-preferences"),
      ]);
      const profileData = await profileRes.json();
      const emailPrefData = await emailPrefRes.json();

      if (profileData.profile) {
        setProfile(profileData.profile);
        setEmail(profileData.email);
        setAuthProvider(profileData.auth_provider);
        setName(profileData.profile.name || "");
        setSkillLevel(profileData.profile.skill_level || "");
        setLearningGoal(profileData.profile.learning_goal || "");
        setDailyGoal(profileData.profile.daily_goal || 5);
      }

      if (emailPrefData.preferences) {
        const p = emailPrefData.preferences;
        setEmailEnabled(p.enabled ?? false);
        setSendTime(p.send_time || "08:00");
        setFrequency(p.frequency || "daily");
        setCustomDays(p.custom_days || [1, 2, 3, 4, 5]);
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
        await fetchProfile();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const msg = data.error || "Failed to save";
        console.error("[profile save] error:", data);
        setError(`Save failed: ${msg} (code: ${data.code || "unknown"})`);
      }
    } catch (e) {
      console.error("[profile save] exception:", e);
      setError(`Error: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    setIsSavingEmail(true);
    try {
      const res = await fetch("/api/email-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: emailEnabled,
          send_time: sendTime,
          frequency,
          custom_days: customDays,
        }),
      });
      if (res.ok) {
        setEmailSuccess(true);
        setTimeout(() => setEmailSuccess(false), 3000);
      } else {
        const d = await res.json();
        setError(d.error || "Failed to save email settings");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSendTest = async () => {
    setIsSendingTest(true);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        alert(`✅ ${data.message}\nTừ: "${data.word}"`);
      } else {
        setError(data.error || "Failed to send test email");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const toggleCustomDay = (day) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
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
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-[#B83426] px-5 py-4 rounded-2xl shadow-xl text-sm font-semibold">
            ⚠️ {error}
            <button type="button" onClick={() => setError(null)} className="ml-3 underline opacity-70">Dismiss</button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/")}
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
              <label className="font-bold text-sm mb-2 flex items-center gap-1.5">
                <BookOpen size={14} />
                English Level
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(LEVEL_LABELS).map(([value, label]) => {
                  const selected = skillLevel === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setSkillLevel(value)}
                      title={label}
                      className="py-2 px-2 rounded-xl border-2 font-bold text-sm cursor-pointer transition-all"
                      style={{
                        background: selected ? '#DCC9FF' : '#F8F4FF',
                        borderColor: selected ? '#6C5CE7' : '#E8DFF5',
                        color: selected ? '#6C5CE7' : '#5D4B7B',
                        transform: selected ? 'scale(1.05)' : 'scale(1)',
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Goal */}
            <div>
              <label className="font-bold text-sm mb-2 block">Learning Goal</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(GOAL_LABELS).map(([value, label]) => {
                  const selected = learningGoal === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setLearningGoal(value)}
                      className="py-2.5 px-2 rounded-xl border-2 font-semibold text-xs cursor-pointer transition-all"
                      style={{
                        background: selected ? '#B8F3D2' : '#F8F4FF',
                        borderColor: selected ? '#00C896' : '#E8DFF5',
                        color: selected ? '#00754C' : '#5D4B7B',
                        transform: selected ? 'scale(1.03)' : 'scale(1)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Daily Goal */}
            <div>
              <label className="font-bold text-sm mb-2 flex items-center gap-1.5">
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

        {/* Email Notifications */}
        <div
          className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6"
          style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}
        >
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <Bell size={20} className="text-[--electric]" />
            Email Notifications
          </h2>

          {/* Toggle */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-bold text-sm">Daily word email</p>
              <p className="text-xs text-[--ink-soft] mt-0.5">Nhận 1 từ vựng mỗi ngày qua email</p>
            </div>
            <button
              type="button"
              onClick={() => setEmailEnabled(prev => !prev)}
              className="relative w-12 h-6 rounded-full transition-all"
              style={{ background: emailEnabled ? '#6C5CE7' : '#E0E0E0' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all"
                style={{ left: emailEnabled ? '26px' : '2px' }}
              />
            </button>
          </div>

          {emailEnabled && (
            <div className="space-y-4 pt-4 border-t-2 border-[--line]">
              {/* Send time */}
              <div>
                <label className="font-bold text-sm mb-2 block">Giờ nhận email</label>
                <input
                  type="time"
                  value={sendTime}
                  onChange={e => setSendTime(e.target.value)}
                  className="px-4 py-2.5 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] transition-all font-semibold"
                />
              </div>

              {/* Frequency */}
              <div>
                <label className="font-bold text-sm mb-2 block">Tần suất</label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'daily', label: '📅 Mỗi ngày' },
                    { value: 'weekdays', label: '💼 Thứ 2–6' },
                    { value: 'custom', label: '⚙️ Tuỳ chỉnh' },
                  ].map(f => (
                    <button
                      type="button"
                      key={f.value}
                      onClick={() => setFrequency(f.value)}
                      className="px-4 py-2 rounded-xl border-2 font-semibold text-sm transition-all"
                      style={{
                        background: frequency === f.value ? '#DCC9FF' : '#F8F4FF',
                        borderColor: frequency === f.value ? '#6C5CE7' : '#E8DFF5',
                        color: frequency === f.value ? '#6C5CE7' : '#5D4B7B',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom days */}
              {frequency === 'custom' && (
                <div>
                  <label className="font-bold text-sm mb-2 block">Chọn ngày</label>
                  <div className="flex gap-2 flex-wrap">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((day, i) => (
                      <button
                        type="button"
                        key={i}
                        onClick={() => toggleCustomDay(i)}
                        className="w-10 h-10 rounded-xl border-2 font-bold text-xs transition-all"
                        style={{
                          background: customDays.includes(i) ? '#B8F3D2' : '#F8F4FF',
                          borderColor: customDays.includes(i) ? '#00C896' : '#E8DFF5',
                          color: customDays.includes(i) ? '#00754C' : '#5D4B7B',
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Test email button */}
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-[--electric] text-[--electric] font-semibold text-sm hover:bg-[--lavender] transition-all disabled:opacity-50"
              >
                {isSendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Gửi email test
              </button>
            </div>
          )}

          {/* Save email prefs button */}
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isSavingEmail}
            className="w-full mt-5 py-3 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: emailSuccess
                ? 'linear-gradient(135deg, #00C896, #B8F3D2)'
                : 'linear-gradient(135deg, #6C5CE7, #a29bfe)',
              boxShadow: '0 8px 24px rgba(108, 92, 231, 0.18)',
            }}
          >
            {isSavingEmail ? <Loader2 size={16} className="animate-spin" /> : emailSuccess ? <Check size={16} /> : <Bell size={16} />}
            {isSavingEmail ? 'Đang lưu...' : emailSuccess ? 'Đã lưu!' : 'Lưu cài đặt email'}
          </button>
        </div>

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
