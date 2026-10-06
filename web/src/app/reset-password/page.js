"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { Lock, Loader2, Check, Eye, EyeOff } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }
    if (password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setDone(true);
      setTimeout(() => router.push("/"), 2000);
    }
    setIsLoading(false);
  };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>

      <main className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div
          className="rounded-[32px] p-8 sm:p-10 w-full max-w-md animate-fade-in"
          style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", boxShadow: '0 20px 48px rgba(0, 0, 0, 0.12)' }}
        >
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--electric), var(--electric-muted))', color: 'var(--on-electric)' }}>
                <Check size={32} />
              </div>
              <h1 className="text-2xl font-bold mb-2">Mật khẩu đã được cập nhật!</h1>
              <p className="text-[--ink-soft] text-sm">Đang chuyển hướng về ứng dụng...</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div
                  className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl shadow-[0_12px_32px_rgba(var(--electric-rgb),0.18)]"
                  style={{ background: 'linear-gradient(135deg, var(--electric), var(--electric-muted))', transform: 'rotate(-5deg)' }}
                >
                  🔐
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Mật khẩu mới</h1>
                <p className="text-sm text-[--ink-soft] mt-1">Chọn một mật khẩu mạnh cho tài khoản của bạn</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                    <Lock size={14} /> Mật khẩu mới
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      required
                      minLength={6}
                      className="w-full px-4 py-3.5 pr-12 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-[var(--card-bg)] focus:ring-4 focus:ring-green-100 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[--ink-soft] hover:text-[--electric]"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                    <Lock size={14} /> Xác nhận mật khẩu
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    required
                    className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-[var(--card-bg)] focus:ring-4 focus:ring-green-100 transition-all"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-sm text-[#B83426]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{
                    background: 'var(--electric)',
                    color: 'var(--on-electric)',
                    boxShadow: '0 12px 32px rgba(34, 197, 94, 0.25)',
                  }}
                >
                  {isLoading ? <><Loader2 size={18} className="animate-spin" /> Đang cập nhật...</> : "Đặt mật khẩu mới"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </>
  );
}
