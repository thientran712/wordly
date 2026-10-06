// Maps CEFR level -> relevant exam-prep goals. Purely derived (no DB column),
// since we don't have real per-word exam tagging data — this is an approximation
// based on typical vocabulary difficulty bands for each exam.
export const EXAM_GOALS = [
  { key: "general", label: "Giao tiếp cơ bản", icon: "🗨️" },
  { key: "toeic", label: "TOEIC", icon: "💼" },
  { key: "ielts", label: "IELTS", icon: "🎓" },
  { key: "toefl", label: "TOEFL", icon: "📘" },
];

const LEVEL_TO_GOALS = {
  A1: ["general"],
  A2: ["general"],
  B1: ["general", "toeic"],
  B2: ["toeic", "ielts"],
  C1: ["ielts", "toefl"],
  C2: ["toefl"],
};

export function examGoalsForLevel(level) {
  return LEVEL_TO_GOALS[level] || [];
}
