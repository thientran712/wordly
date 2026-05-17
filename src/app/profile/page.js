"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Target, BookOpen, Loader2, Check, KeyRound, Eye, EyeOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

const LEVEL_LABELS = {
  A1: 'Beginner',
  A2: 'Elementary',
  B1: 'Intermediate',
  B2: 'Upper-Intermediate',
  C1: 'Advanced',
  C2: 'Proficient',
};

function ChangePasswordModal({ onClose }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    if (newPassword !== confirm) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(onClose, 1800);
    }
    setIsLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: "rgba(45,27,78,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-3xl p-7 w-full max-w-sm animate-fade-in"
        style={{ boxShadow: "0 24px 64px rgba(45,27,78,0.22)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-bold flex items-center gap-2">
            <KeyRound size={18} className="text-[--electric]" />
            Đổi mật khẩu
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-[--ink-soft] hover:bg-[--whisper] hover:text-[--ink]"
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div
              className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-white"
              style={{ background: "linear-gradient(135deg, #00C896, #B8F3D2)" }}
            >
              <Check size={28} />
            </div>
            <p className="font-bold text-[--grass]">Mật khẩu đã được cập nhật!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-bold text-sm mb-2 block">Mật khẩu mới</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  required
                  autoFocus
                  className="w-full px-4 py-3 pr-11 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[--ink-soft] hover:text-[--electric] p-1"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="font-bold text-sm mb-2 block">Xác nhận mật khẩu</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Nhập lại mật khẩu"
                required
                className="w-full px-4 py-3 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
              />
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-sm text-[#B83426]">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border-2 border-[--line] font-semibold text-sm text-[--ink-soft] hover:bg-[--whisper]"
              >
                Huỷ
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 text-white border-none rounded-2xl font-bold text-sm cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #6C5CE7, #a29bfe)",
                  boxShadow: "0 8px 20px rgba(108,92,231,0.2)",
                }}
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {isLoading ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [authProvider, setAuthProvider] = useState("email");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [name, setName] = useState("");
  const [skillLevel, setSkillLevel] = useState("");

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
        body: JSON.stringify({ name, skill_level: skillLevel }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        await fetchProfile();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(`Save failed: ${data.error || "unknown error"}`);
      }
    } catch (e) {
      setError(`Error: ${e.message}`);
    } finally {
      setIsSaving(false);
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

      {showPasswordModal && (
        <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />
      )}

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {error && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-[#B83426] px-5 py-4 rounded-2xl shadow-xl text-sm font-semibold">
            ⚠️ {error}
            <button type="button" onClick={() => setError(null)} className="ml-3 underline opacity-70">Dismiss</button>
          </div>
        )}

        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[--ink-soft] hover:bg-white/60 hover:-translate-y-0.5 hover:shadow-sm"
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Back</span>
          </button>
          <h1 className="font-serif text-3xl font-bold tracking-tight">👤 Profile</h1>
          <div className="w-20"></div>
        </div>

        {/* Account */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6" style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <Mail size={20} className="text-[--electric]" />
            Account
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-[--ink-soft] uppercase tracking-wider">Email</label>
              <div className="flex items-center gap-2 mt-1">
                <p className="font-semibold">{email}</p>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
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
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border-2 font-semibold text-sm hover:-translate-y-0.5 hover:shadow-sm transition-all"
                style={{
                  borderColor: '#E8DFF5',
                  background: '#F8F4FF',
                  color: '#6C5CE7',
                }}
              >
                <KeyRound size={15} />
                Đổi mật khẩu
              </button>
            )}
          </div>
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6" style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}>
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
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-white mb-6" style={{ boxShadow: '0 8px 24px rgba(108, 92, 231, 0.08)' }}>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2">
            <Target size={20} className="text-[--grass]" />
            Learning Preferences
          </h2>
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

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            background: success
              ? 'linear-gradient(135deg, #00C896, #B8F3D2)'
              : 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
            boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)',
          }}
        >
          {isSaving ? (
            <><Loader2 size={18} className="animate-spin" /> Saving...</>
          ) : success ? (
            <><Check size={18} /> Saved!</>
          ) : (
            "💾 Save Changes"
          )}
        </button>
      </main>
    </>
  );
}
