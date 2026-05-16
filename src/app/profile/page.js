"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Target, BookOpen, Loader2, Check, Bell } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  const value = `${String(h).padStart(2, "0")}:${m}`;
  const period = h < 12 ? "SA" : "CH";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const label = `${displayH}:${m} ${period}`;
  return { value, label };
});

function TimeDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  const selected = TIME_SLOTS.find(s => s.value === value) || TIME_SLOTS[0];

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current) {
      const idx = TIME_SLOTS.findIndex(s => s.value === value);
      const item = listRef.current.children[idx];
      if (item) item.scrollIntoView({ block: "center" });
    }
  }, [open, value]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px", borderRadius: "16px", border: "2px solid",
          borderColor: open ? "#6C5CE7" : "#E8DFF5",
          background: "#F8F4FF", cursor: "pointer", fontWeight: 700,
          fontSize: "15px", color: "#2D1B4E", transition: "border-color 0.15s",
        }}
      >
        <span>🕐 {selected.label}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6C5CE7" strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "#fff", borderRadius: "16px", border: "2px solid #E8DFF5",
          boxShadow: "0 8px 24px rgba(108,92,231,0.15)", zIndex: 50,
          overflow: "hidden",
        }}>
          <div ref={listRef} style={{ maxHeight: "220px", overflowY: "auto", padding: "6px" }}>
            {TIME_SLOTS.map(slot => {
              const isSelected = slot.value === value;
              return (
                <button
                  key={slot.value}
                  type="button"
                  onClick={() => { onChange(slot.value); setOpen(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 14px",
                    borderRadius: "10px", border: "none", cursor: "pointer",
                    fontWeight: isSelected ? 700 : 500, fontSize: "14px",
                    background: isSelected ? "#EDE9FF" : "transparent",
                    color: isSelected ? "#6C5CE7" : "#2D1B4E",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F5F0FF"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  {isSelected && <span style={{ marginRight: 8 }}>✓</span>}
                  {slot.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function snapToHalfHour(time) {
  const [h, m] = time.split(":").map(Number);
  const snapped = m < 15 ? 0 : m < 45 ? 30 : 0;
  const snappedH = m >= 45 ? (h + 1) % 24 : h;
  return `${String(snappedH).padStart(2, "0")}:${snapped === 0 ? "00" : "30"}`;
}

const LEVEL_LABELS = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
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

  // Email preferences state
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [sendTime, setSendTime] = useState("08:00");
  const [frequency, setFrequency] = useState("daily");
  const [customDays, setCustomDays] = useState([1, 2, 3, 4, 5]);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

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
      }

      if (emailPrefData.preferences) {
        const p = emailPrefData.preferences;
        setEmailEnabled(p.enabled ?? false);
        setSendTime(snapToHalfHour(p.send_time || "08:00"));
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/60 hover:-translate-y-0.5 hover:shadow-sm"
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
                      className="py-2 px-2 rounded-xl border-2 font-bold text-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-sm"
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
            <div className="pt-4 border-t-2 border-[--line]">
              <p className="text-xs text-[--ink-soft]">📬 Email sẽ được gửi lúc <strong>7:00 sáng</strong> mỗi ngày.</p>
            </div>
          )}

          {/* Save email prefs button */}
          <button
            type="button"
            onClick={handleSaveEmail}
            disabled={isSavingEmail}
            className="w-full mt-5 py-3 text-white border-none rounded-2xl font-bold text-sm cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
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
          className="w-full py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
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
