"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { Mail, Lock, User, Loader2 } from "lucide-react";

const inputStyle = {
  background: "var(--input-bg)",
  border: "1.5px solid var(--input-border)",
  color: "var(--ink)",
};
const inputFocus = (e) => { e.target.style.borderColor = "rgba(var(--electric-rgb),0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(var(--electric-rgb),0.1)"; };
const inputBlur  = (e) => { e.target.style.borderColor = "var(--input-border)"; e.target.style.boxShadow = "none"; };

export default function AuthForm({ mode = "login" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);
    const supabase = createClient();
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        if (data.user && !data.session) setSuccess("Kiểm tra email để xác minh tài khoản của bạn!");
        else { router.push("/"); router.refresh(); }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/"); router.refresh();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setIsGoogleLoading(false); }
  };

  return (
    <div
      className="rounded-[28px] p-8 sm:p-10 w-full max-w-md animate-fade-in"
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--green-subtle-border)",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3), 0 0 0 1px var(--green-subtle-border)",
      }}
    >
      {/* Logo */}
      <div className="text-center mb-8">
        <div
          className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center overflow-hidden"
          style={{
            background: "linear-gradient(135deg, var(--electric), var(--electric-muted))",
            boxShadow: "0 8px 24px rgba(var(--electric-rgb),0.35)",
            transform: "rotate(-5deg)",
          }}
        >
          <img src="/favicon.png" alt="Wordly" className="w-10 h-10 object-contain" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight gradient-text-brand">
          Wordly
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          {mode === "signup" ? "Tạo tài khoản của bạn" : "Chào mừng trở lại"}
        </p>
      </div>

      {/* Google */}
      <button
        onClick={handleGoogleSignIn}
        disabled={isGoogleLoading}
        className="w-full py-3 px-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-3 mb-4 disabled:opacity-60 hover:-translate-y-0.5 transition-all"
        style={{
          background: "var(--input-bg)",
          border: "1.5px solid var(--input-border)",
          color: "var(--ink)",
        }}
      >
        {isGoogleLoading ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/>
          </svg>
        )}
        <span>Tiếp tục với Google</span>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
        <span className="text-xs font-semibold uppercase" style={{ color: "var(--ink-soft)" }}>hoặc</span>
        <div className="flex-1 h-px" style={{ background: "var(--divider)" }} />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label className="flex items-center gap-1.5 font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>
              <User size={14} style={{ color: "var(--electric)" }} /> Tên của bạn
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Minh" required
              className="w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none transition-all"
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
            />
          </div>
        )}

        <div>
          <label className="flex items-center gap-1.5 font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>
            <Mail size={14} style={{ color: "var(--electric)" }} /> Email
          </label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="ban@example.com" required
            className="w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none transition-all"
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>
            <Lock size={14} style={{ color: "var(--electric)" }} /> Mật khẩu
          </label>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" required minLength={6}
            className="w-full px-4 py-3.5 rounded-2xl text-sm focus:outline-none transition-all"
            style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}
          />
          {mode === "login" && (
            <div className="text-right mt-2">
              <Link href="/forgot-password" className="text-xs font-semibold hover:underline" style={{ color: "var(--electric)" }}>
                Quên mật khẩu?
              </Link>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "var(--error)" }}>
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 rounded-xl text-sm" style={{ background: "rgba(var(--electric-rgb),0.1)", border: "1px solid rgba(var(--electric-rgb),0.25)", color: "var(--electric)" }}>
            {success}
          </div>
        )}

        <button
          type="submit" disabled={isLoading}
          className="w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:-translate-y-0.5 transition-all"
          style={{ background: "var(--electric)", color: "var(--on-electric)", boxShadow: "0 8px 24px rgba(var(--electric-rgb),0.3)" }}
        >
          {isLoading ? <><Loader2 size={18} className="animate-spin" /> Đang xử lý...</> :
           mode === "signup" ? "Tạo tài khoản" : "Đăng nhập"}
        </button>
      </form>

      <p className="text-center text-sm mt-6" style={{ color: "var(--ink-soft)" }}>
        {mode === "signup" ? (
          <>Đã có tài khoản?{" "}
            <Link href="/login" className="font-bold hover:underline" style={{ color: "var(--electric)" }}>Đăng nhập</Link></>
        ) : (
          <>Chưa có tài khoản?{" "}
            <Link href="/signup" className="font-bold hover:underline" style={{ color: "var(--electric)" }}>Đăng ký</Link></>
        )}
      </p>
    </div>
  );
}
