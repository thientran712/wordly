"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { Mail, Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
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
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 text-sm text-[--ink-soft] font-semibold hover:text-[--electric] mb-6"
          >
            <ArrowLeft size={15} /> Quay lại đăng nhập
          </button>

          {sent ? (
            <div className="text-center">
              <div className="text-6xl mb-4">📬</div>
              <h1 className="text-2xl font-bold mb-2">Kiểm tra email của bạn</h1>
              <p className="text-[--ink-soft] text-sm leading-relaxed">
                Chúng tôi đã gửi liên kết đặt lại mật khẩu đến <strong>{email}</strong>. Nhấn vào liên kết trong email để đặt mật khẩu mới.
              </p>
              <p className="text-xs text-[--ink-soft] mt-4">Chưa nhận được email? Kiểm tra thư mục spam.</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-8">
                <div
                  className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl shadow-[0_12px_32px_rgba(var(--electric-rgb),0.18)]"
                  style={{ background: 'linear-gradient(135deg, var(--electric), var(--electric-muted))', transform: 'rotate(-5deg)' }}
                >
                  🔑
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Quên mật khẩu?</h1>
                <p className="text-sm text-[--ink-soft] mt-1">Nhập email của bạn và chúng tôi sẽ gửi liên kết đặt lại</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                    <Mail size={14} /> Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ban@example.com"
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
                  {isLoading ? <><Loader2 size={18} className="animate-spin" /> Đang gửi...</> : "Gửi liên kết đặt lại"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </>
  );
}
