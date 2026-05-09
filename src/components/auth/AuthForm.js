"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { Mail, Lock, User, Loader2 } from "lucide-react";

export default function AuthForm({ mode = "login" }) {
  const router = useRouter();
  const supabase = createClient();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } }
        });
        if (error) throw error;
        
        // Auto login after signup (since email confirmation is off)
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (signInError) throw signInError;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      }
      
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-[32px] p-8 sm:p-10 border-[3px] border-white relative overflow-hidden"
      style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.12)' }}>
      
      <div className="absolute -top-1/4 -right-1/4 w-80 h-80 rounded-full opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #FFD8C9, transparent)' }} />
      <div className="absolute -bottom-1/4 -left-1/4 w-64 h-64 rounded-full opacity-50 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #DCC9FF, transparent)' }} />

      <div className="relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl text-white"
            style={{ 
              background: 'linear-gradient(135deg, #6C5CE7, #FF5C8A)',
              boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)',
              transform: 'rotate(-5deg)'
            }}>
            {isSignup ? '✨' : '🌈'}
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight">
            {isSignup ? "Tạo tài khoản" : "Chào mừng trở lại"}
          </h1>
          <p className="text-sm text-[--ink-soft] mt-1">
            {isSignup ? "Bắt đầu hành trình học tiếng Anh" : "Đăng nhập để tiếp tục học"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <FormField label="Tên hiển thị" icon={<User size={14} />}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Tên của bạn"
                className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
              />
            </FormField>
          )}

          <FormField label="Email" icon={<Mail size={14} />}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="ban@email.com"
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </FormField>

          <FormField label="Mật khẩu" icon={<Lock size={14} />}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder={isSignup ? "Tối thiểu 6 ký tự" : "Mật khẩu"}
              className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl text-[--ink] focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
            />
          </FormField>

          {error && (
            <div className="p-3 rounded-2xl border-2 text-sm flex items-start gap-2"
              style={{ background: '#FFE8E8', borderColor: '#FFB4A8', color: '#B83426' }}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ 
              background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
              boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)'
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Đang xử lý...
              </>
            ) : (
              <>{isSignup ? '✨ Đăng ký' : '🚀 Đăng nhập'}</>
            )}
          </button>
        </form>

        <div className="text-center mt-6 pt-6 border-t border-[--line]">
          <p className="text-sm text-[--ink-soft]">
            {isSignup ? "Đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
            <Link 
              href={isSignup ? "/login" : "/signup"}
              className="font-bold text-[--electric] hover:text-[--hot-pink] transition-colors"
            >
              {isSignup ? "Đăng nhập" : "Đăng ký miễn phí"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, icon, children }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 font-bold text-xs sm:text-sm mb-2 text-[--ink]">
        {icon && <span>{icon}</span>}
        {label}
      </label>
      {children}
    </div>
  );
}

function translateError(msg) {
  const translations = {
    "Invalid login credentials": "Email hoặc mật khẩu không đúng",
    "User already registered": "Email này đã được đăng ký",
    "Password should be at least 6 characters": "Mật khẩu phải có ít nhất 6 ký tự",
    "Unable to validate email address: invalid format": "Email không hợp lệ",
    "Email not confirmed": "Email chưa được xác nhận",
  };
  return translations[msg] || msg;
}
