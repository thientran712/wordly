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

const VALID_ENTRY_TYPES = new Set(["translate_history", "journal_entries"]);

/**
 * Kiểm tra body của PATCH /api/learning/schedule.
 * entry_type='bank' bị chặn: từ kho không có row cá nhân để cập nhật
 * due_at/state/review_count.
 * Trả về { error: string | null }.
 */
export function validateScheduleRequest({ entry_type, entry_id, rating } = {}) {
  if (entry_type === "bank") {
    return { error: "Không thể điều chỉnh lịch ôn cho từ kho (bank) — không có dữ liệu cá nhân để lưu." };
  }
  if (!VALID_ENTRY_TYPES.has(entry_type)) {
    return { error: `entry_type không hợp lệ: ${entry_type}` };
  }
  if (!entry_id || typeof entry_id !== "string") {
    return { error: "Thiếu entry_id" };
  }
  if (!VALID_RATINGS.has(rating)) {
    return { error: `rating không hợp lệ: ${rating}` };
  }
  return { error: null };
}
