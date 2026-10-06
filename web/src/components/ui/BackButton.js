"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Goes back to the actual previous page in history. Falls back to `fallbackHref`
// only when there's no previous page to go back to (e.g. the page was opened
// directly via a bookmark/URL, so window.history has nothing behind it).
export default function BackButton({ fallbackHref = "/", label, onBeforeNavigate, className = "", iconSize = 18 }) {
  const router = useRouter();

  const handleClick = () => {
    onBeforeNavigate?.();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-full hover:-translate-y-0.5 hover:shadow-sm transition-all ${className}`}
      style={{ color: "var(--ink-soft)", background: "var(--surface-elevated)", border: "1px solid var(--line)" }}
    >
      <ArrowLeft size={iconSize} />
      {label && <span className="font-semibold">{label}</span>}
    </button>
  );
}
