"use client";

export default function StatsBar({ streak, learned, todayNum, emailEnabled }) {
  return (
    <div
      className="flex items-center justify-center gap-3 sm:gap-5 px-5 py-3 bg-white rounded-2xl border-2 border-[--line] text-xs sm:text-sm font-semibold text-[--ink-soft] flex-wrap"
      style={{ boxShadow: "0 4px 16px rgba(108,92,231,0.06)" }}
    >
      <span>🔥 <strong className="text-[--ink]">{streak}</strong> ngày</span>
      <span className="text-[--line]">·</span>
      <span>📚 <strong className="text-[--electric]">{learned}</strong> đã học</span>
      <span className="text-[--line]">·</span>
      <span>⭐ <strong className="text-[--grass]">{todayNum}</strong> hôm nay</span>
      <span className="text-[--line]">·</span>
      <span>✉️ <strong style={{ color: emailEnabled ? "#00C896" : "#B8A8D8" }}>{emailEnabled ? "ON" : "OFF"}</strong></span>
    </div>
  );
}
