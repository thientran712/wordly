"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-client";
import { Mail, Lock, User, Loader2 } from "lucide-react";

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
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) throw error;

        if (data.user && !data.session) {
          setSuccess("Check your email to verify your account!");
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        
        router.push("/");
        router.refresh();
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
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    
    if (error) {
      setError(error.message);
      setIsGoogleLoading(false);
    }
  };

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>
      
      <main className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div 
          className="bg-white rounded-[32px] p-8 sm:p-10 w-full max-w-md border-[3px] border-white animate-fade-in"
          style={{ boxShadow: '0 20px 48px rgba(45, 27, 78, 0.12)' }}
        >
          <div className="text-center mb-8">
            <div 
              className="w-16 h-16 mx-auto mb-3 rounded-3xl flex items-center justify-center text-3xl text-white shadow-[0_12px_32px_rgba(255,92,138,0.18)]"
              style={{ background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)', transform: 'rotate(-5deg)' }}
            >
              R
            </div>
            <h1 className="font-serif text-3xl font-bold gradient-text-purple-pink tracking-tight">
              Wordly
            </h1>
            <p className="text-sm text-[--ink-soft] mt-1">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </p>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading}
            className="w-full py-3 px-4 bg-white border-2 border-[--line] rounded-2xl font-semibold text-sm cursor-pointer transition-all hover:bg-[--whisper] hover:border-[--electric] flex items-center justify-center gap-3 mb-4 disabled:opacity-60"
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
            <span>Continue with Google</span>
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-[--line]"></div>
            <span className="text-xs text-[--ink-soft] uppercase font-semibold">or</span>
            <div className="flex-1 h-px bg-[--line]"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                  <User size={14} />
                  Your name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="David"
                  required
                  className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
                />
              </div>
            )}

            <div>
              <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                <Mail size={14} />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 font-bold text-sm mb-2">
                <Lock size={14} />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                required
                minLength={6}
                className="w-full px-4 py-3.5 bg-[--whisper] border-2 border-[--line] rounded-2xl focus:outline-none focus:border-[--electric] focus:bg-white focus:ring-4 focus:ring-purple-100 transition-all"
              />
              {mode === "login" && (
                <div className="text-right mt-2">
                  <Link 
                    href="/forgot-password" 
                    className="text-xs text-[--electric] font-semibold hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-[#FFE8E8] border-2 border-[#FFB4A8] text-sm text-[#B83426]">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 rounded-xl bg-[#E0FBE8] border-2 border-[#B8E8C9] text-sm text-[--grass]">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-4 text-white border-none rounded-2xl font-bold text-sm cursor-pointer transition-all hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ 
                background: 'linear-gradient(135deg, #FF5C8A, #6C5CE7)',
                boxShadow: '0 12px 32px rgba(255, 92, 138, 0.18)'
              }}
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : mode === "signup" ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <p className="text-center text-sm text-[--ink-soft] mt-6">
            {mode === "signup" ? (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-[--electric] font-bold hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <Link href="/signup" className="text-[--electric] font-bold hover:underline">
                  Sign up
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </>
  );
}
