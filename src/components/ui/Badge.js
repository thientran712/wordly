"use client";

const TONE_STYLES = {
  neutral: { background: "var(--hover-bg)", color: "var(--ink-soft)", border: "1px solid var(--card-border)" },
  accent: { background: "var(--green-subtle)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" },
  error: { background: "var(--error-soft)", color: "var(--error)", border: "1px solid var(--error-border)" },
  warning: { background: "var(--sunshine-soft)", color: "var(--sunshine-text)", border: "1px solid var(--sunshine-border)" },
};

export default function Badge({ tone = "neutral", className = "", style = {}, children, ...props }) {
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${className}`}
      style={{ ...toneStyle, ...style }}
      {...props}
    >
      {children}
    </span>
  );
}
