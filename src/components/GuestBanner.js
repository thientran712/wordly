"use client";

import { useRouter } from "next/navigation";
import { Sparkles, LogIn, UserPlus } from "lucide-react";

export default function GuestBanner() {
  const router = useRouter();
  return (
    <div
      className="rounded-2xl px-4 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3"
      style={{
        background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.04))",
        border: "1px solid var(--green-subtle-border)",
      }}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "var(--green-subtle)", border: "1px solid var(--green-subtle-border)" }}
        >
          <Sparkles size={15} style={{ color: "var(--electric)" }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            Đăng ký để mở khoá đầy đủ tính năng
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Từ mới mỗi ngày · Ghi chú từ vựng · Ôn tập thông minh
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto">
        <button
          onClick={() => router.push("/signup")}
          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all"
          style={{ background: "var(--electric)", color: "#0A0A0A", boxShadow: "0 4px 12px rgba(34,197,94,0.3)" }}
        >
          <UserPlus size={13} /> Đăng ký miễn phí
        </button>
        <button
          onClick={() => router.push("/login")}
          className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold active:scale-95 transition-all"
          style={{ background: "var(--hover-bg)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" }}
        >
          <LogIn size={13} /> Đăng nhập
        </button>
      </div>
    </div>
  );
}
