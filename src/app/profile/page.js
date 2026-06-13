"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Mail, Target, BookOpen, Loader2, Check, KeyRound, Eye, EyeOff, X } from "lucide-react";
import { createClient } from "@/lib/supabase-client";

const LEVEL_LABELS = {
  A1: "Mới bắt đầu", A2: "Sơ cấp", B1: "Trung cấp",
  B2: "Trung cao cấp", C1: "Cao cấp", C2: "Thành thạo",
};

const GOAL_LABELS = {
  daily: "💬 Giao tiếp hàng ngày", toeic: "📊 TOEIC", ielts: "🎓 IELTS",
  business: "💼 Kinh doanh", travel: "✈️ Du lịch",
};

const cardStyle = {
  background: "var(--card-bg)",
  border: "1px solid var(--card-border)",
  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
};

const inputStyle = {
  background: "var(--input-bg)",
  border: "1.5px solid var(--input-border)",
  color: "var(--ink)",
};
const inputFocus = (e) => { e.target.style.borderColor = "rgba(34,197,94,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(34,197,94,0.1)"; };
const inputBlur  = (e) => { e.target.style.borderColor = "var(--input-border)"; e.target.style.boxShadow = "none"; };

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
    if (newPassword.length < 6) { setError("Mật khẩu phải có ít nhất 6 ký tự"); return; }
    if (newPassword !== confirm) { setError("Mật khẩu xác nhận không khớp"); return; }
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) setError(error.message);
    else { setSuccess(true); setTimeout(onClose, 1800); }
    setIsLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-3xl p-7 w-full max-w-sm animate-fade-in"
        style={{ background: "var(--card-bg)", border: "1px solid var(--green-subtle-border)", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-xl font-bold flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <KeyRound size={18} style={{ color: "var(--electric)" }} />
            Đổi mật khẩu
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
            style={{ color: "var(--ink-soft)" }}
          >
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-4">
            <div
              className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
              style={{ background: "var(--electric)" }}
            >
              <Check size={28} color="#0A0A0A" />
            </div>
            <p className="font-bold" style={{ color: "var(--electric)" }}>Mật khẩu đã được cập nhật!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Mật khẩu mới</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự" required autoFocus
                  className="w-full px-4 py-3 pr-11 rounded-2xl text-sm focus:outline-none transition-all"
                  style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
                />
                <button
                  type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:opacity-80 transition-opacity"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <div>
              <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Xác nhận mật khẩu</label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Nhập lại mật khẩu" required
                className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all"
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            </div>
            {error && (
              <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#F87171" }}>
                {error}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button" onClick={onClose}
                className="flex-1 py-3 rounded-2xl font-semibold text-sm hover:bg-white/5 transition-colors"
                style={{ border: "1.5px solid rgba(255,255,255,0.1)", color: "var(--ink-soft)" }}
              >
                Huỷ
              </button>
              <button
                type="submit" disabled={isLoading}
                className="flex-1 py-3 rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
                style={{ background: "var(--electric)", color: "#0A0A0A", boxShadow: "0 4px 16px rgba(34,197,94,0.3)" }}
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
  const [email, setEmail] = useState("");
  const [authProvider, setAuthProvider] = useState("email");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [name, setName] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [learningGoal, setLearningGoal] = useState("");

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.profile) {
        setEmail(data.email);
        setAuthProvider(data.auth_provider);
        setName(data.profile.name || "");
        setSkillLevel(data.profile.skill_level || "B1");
        setLearningGoal(data.profile.learning_goal || "daily");
      }
    } catch (e) {
      console.error("Fetch profile error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, skill_level: skillLevel, learning_goal: learningGoal }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
        await fetchProfile();
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(`Lưu thất bại: ${data.error || "lỗi không xác định"}`);
      }
    } catch (e) {
      setError(`Lỗi: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div><div className="blob blob-2"></div>
        <div className="blob blob-3"></div><div className="blob blob-4"></div>
      </div>

      {showPasswordModal && <ChangePasswordModal onClose={() => setShowPasswordModal(false)} />}

      <main className="relative z-10 max-w-xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-16">
        {error && (
          <div
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-[90vw] max-w-xl px-5 py-4 rounded-2xl shadow-xl text-sm font-semibold"
            style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#F87171" }}
          >
            ⚠️ {error}
            <button type="button" onClick={() => setError(null)} className="ml-3 underline opacity-70">Đóng</button>
          </div>
        )}

        {/* Page header */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full hover:-translate-y-0.5 transition-all"
            style={{ color: "var(--ink-soft)", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={18} />
            <span className="font-semibold">Quay lại</span>
          </button>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>👤 Hồ sơ</h1>
          <div className="w-20" />
        </div>

        {/* Account card */}
        <div className="rounded-3xl p-6 sm:p-8 mb-5" style={cardStyle}>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <Mail size={20} style={{ color: "var(--electric)" }} />
            Tài khoản
          </h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--ink-soft)" }}>Email</label>
              <div className="flex items-center gap-2 min-h-[24px]">
                {isLoading ? (
                  <div className="h-5 w-48 rounded-lg animate-pulse" style={{ background: "var(--hover-bg)" }} />
                ) : (
                  <>
                    <p className="font-semibold" style={{ color: "var(--ink)" }}>{email}</p>
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      style={{ background: "rgba(34,197,94,0.1)", color: "var(--electric)", border: "1px solid rgba(34,197,94,0.25)" }}
                    >
                      {authProvider}
                    </span>
                  </>
                )}
              </div>
            </div>
            {!isLoading && authProvider === "email" && (
              <button
                type="button"
                onClick={() => setShowPasswordModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-sm hover:-translate-y-0.5 transition-all"
                style={{ background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.2)", color: "var(--electric)" }}
              >
                <KeyRound size={15} />
                Đổi mật khẩu
              </button>
            )}
          </div>
        </div>

        {/* Personal info card */}
        <div className="rounded-3xl p-6 sm:p-8 mb-5" style={cardStyle}>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <User size={20} style={{ color: "var(--electric)" }} />
            Thông tin cá nhân
          </h2>
          <div>
            <label className="font-bold text-sm mb-2 block" style={{ color: "var(--ink)" }}>Tên của bạn</label>
            {isLoading ? (
              <div className="h-12 rounded-2xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
            ) : (
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm focus:outline-none transition-all"
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
              />
            )}
          </div>
        </div>

        {/* Learning preferences card */}
        <div className="rounded-3xl p-6 sm:p-8 mb-6" style={cardStyle}>
          <h2 className="font-serif text-xl font-bold mb-4 flex items-center gap-2" style={{ color: "var(--ink)" }}>
            <Target size={20} style={{ color: "var(--electric)" }} />
            Tùy chọn học tập
          </h2>
          <div>
            <label className="font-bold text-sm mb-3 flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
              <BookOpen size={14} style={{ color: "var(--electric)" }} />
              Trình độ tiếng Anh
            </label>
            {isLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-9 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {Object.entries(LEVEL_LABELS).map(([value, label]) => {
                  const selected = skillLevel === value;
                  return (
                    <button
                      type="button" key={value}
                      onClick={() => setSkillLevel(value)}
                      title={label}
                      className="py-2 px-2 rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all"
                      style={{
                        background: selected ? "var(--electric)" : "var(--hover-bg)",
                        border: selected ? "none" : "1.5px solid var(--input-border)",
                        color: selected ? "#0A0A0A" : "var(--ink-soft)",
                        transform: selected ? "scale(1.05)" : "scale(1)",
                        boxShadow: selected ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-5">
            <label className="font-bold text-sm mb-3 flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
              <Target size={14} style={{ color: "var(--electric)" }} />
              Mục tiêu học tập
            </label>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-9 rounded-xl animate-pulse" style={{ background: "var(--hover-bg)" }} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(GOAL_LABELS).map(([value, label]) => {
                  const selected = learningGoal === value;
                  return (
                    <button
                      type="button" key={value}
                      onClick={() => setLearningGoal(value)}
                      className="py-2 px-2 rounded-xl font-bold text-sm hover:-translate-y-0.5 transition-all"
                      style={{
                        background: selected ? "var(--electric)" : "var(--hover-bg)",
                        border: selected ? "none" : "1.5px solid var(--input-border)",
                        color: selected ? "#0A0A0A" : "var(--ink-soft)",
                        transform: selected ? "scale(1.05)" : "scale(1)",
                        boxShadow: selected ? "0 4px 12px rgba(34,197,94,0.3)" : "none",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave} disabled={isSaving || isLoading}
          className="w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
          style={{
            background: success ? "rgba(34,197,94,0.15)" : "var(--electric)",
            color: success ? "var(--electric)" : "#0A0A0A",
            border: success ? "1.5px solid rgba(34,197,94,0.4)" : "none",
            boxShadow: success ? "none" : "0 8px 24px rgba(34,197,94,0.3)",
          }}
        >
          {isSaving ? <><Loader2 size={18} className="animate-spin" /> Đang lưu...</> :
           success ? <><Check size={18} /> Đã lưu!</> :
           "💾 Lưu thay đổi"}
        </button>
      </main>
    </>
  );
}
