// Hệ số điều chỉnh due_at khi user chủ động bấm Dễ/Khó/Bỏ qua lâu hơn trong
// tab "Đã gợi ý" (web/src/components/home/SuggestionHistoryTab.js) hoặc gọi
// PATCH /api/learning/schedule. Dùng lại thang EMAIL_INTERVALS của email —
// KHÔNG dùng ts-fsrs (code chết, xem docs/superpowers/specs/2026-10-10-...).

import { EMAIL_INTERVALS } from "../email/select-word-for-email.js";

const VALID_RATINGS = new Set(["easy", "hard", "skip_longer"]);
const LAST_INDEX = EMAIL_INTERVALS.length - 1;

/**
 * Tính due_at/state/review_count mới sau khi user đánh giá một từ.
 *
 *  - easy:        nhảy lên 1 nấc, review_count + 1
 *  - hard:        lùi 1 nấc (tối thiểu nấc đầu), review_count không đổi
 *  - skip_longer: set thẳng nấc cuối, review_count không đổi
 *
 * current.review_count được coi là 0 nếu null/undefined (từ chưa từng qua
 * email job, ví dụ user bấm đánh giá lần đầu trên một từ mới lưu).
 */
export function computeScheduleUpdate(current, rating) {
  if (!VALID_RATINGS.has(rating)) {
    throw new Error(`Rating không hợp lệ: ${rating}`);
  }

  const reviewCount = current?.review_count ?? 0;
  const currentIndex = Math.min(reviewCount, LAST_INDEX);

  let nextIndex;
  let nextReviewCount;
  if (rating === "easy") {
    nextIndex = Math.min(currentIndex + 1, LAST_INDEX);
    nextReviewCount = reviewCount + 1;
  } else if (rating === "hard") {
    nextIndex = Math.max(currentIndex - 1, 0);
    nextReviewCount = reviewCount;
  } else {
    nextIndex = LAST_INDEX;
    nextReviewCount = reviewCount;
  }

  const intervalDays = EMAIL_INTERVALS[nextIndex];
  const dueAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    state: "review",
    review_count: nextReviewCount,
    due_at: dueAt.toISOString(),
    scheduled_days: intervalDays,
  };
}
