"use client";

import Dropdown from "@/components/ui/Dropdown";

export const LANGUAGES = [
  { code: "en", label: "🇺🇸 English" },
  { code: "es", label: "🇪🇸 Español" },
  { code: "fr", label: "🇫🇷 Français" },
  { code: "de", label: "🇩🇪 Deutsch" },
  { code: "zh", label: "🇨🇳 中文" },
  { code: "it", label: "🇮🇹 Italiano" },
  { code: "ar", label: "🇸🇦 العربية" },
  { code: "pt", label: "🇧🇷 Português" },
  { code: "ko", label: "🇰🇷 한국어" },
  { code: "ja", label: "🇯🇵 日本語" },
  { code: "th", label: "🇹🇭 ภาษาไทย" },
  { code: "ur", label: "🇵🇰 اردو" },
];

export const DIFFICULTIES = [
  { code: "easy", label: "🟢 Dễ" },
  { code: "medium", label: "🟡 Trung bình" },
  { code: "hard", label: "🔴 Khó" },
];

export const TOPIC_CATEGORIES = [
  { code: "part1", label: "① Part 1 — Câu hỏi ngắn" },
  { code: "part2", label: "② Part 2 — Cue card" },
  { code: "part3", label: "③ Part 3 — Thảo luận" },
];

export const INTERVIEW_CATEGORIES = [
  { code: "behavioral", label: "💬 Top 50 Behavioral" },
  { code: "consulting", label: "💼 Top 50 Consulting" },
];

// Shared filter row for the speaking-practice spinner pages — built with
// Wordly's existing Dropdown (src/components/ui/Dropdown.js), not the
// reference project's custom dropdown markup/styling.
export default function FilterBar({
  showLanguage = true, showDifficulty = true,
  language, onLanguageChange,
  difficulty, onDifficultyChange,
  category, onCategoryChange, categoryOptions, categoryAllLabel = "🎲 Ngẫu nhiên",
}) {
  return (
    <div className="flex items-center gap-2 mb-5 flex-wrap justify-center">
      {showLanguage && (
        <Dropdown
          value={language}
          onChange={onLanguageChange}
          options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
          allLabel="Ngôn ngữ"
        />
      )}
      {showDifficulty && (
        <Dropdown
          value={difficulty}
          onChange={onDifficultyChange}
          options={DIFFICULTIES.map((d) => ({ value: d.code, label: d.label }))}
          allLabel="🎲 Ngẫu nhiên"
        />
      )}
      {categoryOptions && (
        <Dropdown
          value={category}
          onChange={onCategoryChange}
          options={categoryOptions.map((c) => ({ value: c.code, label: c.label }))}
          allLabel={categoryAllLabel}
        />
      )}
    </div>
  );
}
