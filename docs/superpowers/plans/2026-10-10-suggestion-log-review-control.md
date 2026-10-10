# Suggestion Log & Review Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users see every word suggested to them via email or the iOS lock-screen widget, look up its meaning with the existing AI dictionary, and control its spaced-repetition `due_at` with three buttons (Dễ / Khó / Bỏ qua lâu hơn) — while making email sends stop auto-advancing the review schedule unconditionally.

**Architecture:** A new `suggestion_log` table records every word shown via email or widget (source + entry reference + timestamp), decoupled from the existing `email_log` (which keeps tracking send status). Three new Next.js API routes expose this log, a dictionary-lookup reuse path, and a manual schedule-adjustment endpoint. The Inngest email job stops auto-advancing `due_at`/`review_count`/`state` on send and instead just logs to `suggestion_log`. The web History page gets a new "Đã gợi ý" tab reusing the existing AI dictionary popup. The iOS host app posts to the new log endpoint whenever it recomputes the widget's word batch.

**Tech Stack:** Next.js 16 (App Router) API routes, Supabase Postgres + RLS, Inngest background jobs, Swift/SwiftUI (iOS host app, not the widget extension), `node:test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-10-10-suggestion-log-review-control-design.md`

## Global Constraints

- Do NOT run this migration against staging/production without separate explicit approval (CLAUDE.md absolute rule #2). This plan only creates the migration file and applies it to the local Supabase instance for testing.
- Every table holding tenant/user data must have RLS enabled, no exceptions (CLAUDE.md multi-tenant rule). `suggestion_log` is per-user data (not org-scoped), but still gets RLS: users may only SELECT their own rows; INSERT happens only via the service-role admin client (API routes / Inngest job), never directly from a client.
- New API routes default to protected (Next 16 + this repo's middleware convention) — do not add them to `PUBLIC_API_PATHS` in `web/src/middleware.js`.
- `params` in any new route handler must be awaited (Next 16 requirement) — not applicable here since none of the three new routes use dynamic segments, but note it in case that changes.
- Reuse `getUserFast()` for auth in every new route — it already supports both cookie sessions (web) and Bearer tokens forwarded by middleware (iOS), so no separate mobile auth path is needed.
- Logic that needs `node --test` coverage must live in `web/src/lib/`, not inside a route handler or React component (CLAUDE.md "Mẹo quan trọng" convention, already followed by `select-word-for-email.js` and `dictionary-client.js`).
- Do not touch `web/src/lib/learning/fsrs.js` (`ts-fsrs`) — confirmed dead code, out of scope per the spec.

## Review Focus

- **Rating on a word with no existing FSRS row state** (e.g. `review_count` null/undefined because the word was never touched by the email job) — `schedule-adjustment.js` must default `review_count` to 0, not throw or produce `NaN` in interval math. Covered in Task 2.
- **`entry_type: 'bank'` passed to `/api/learning/schedule`** — bank words have no `translate_history`/`journal_entries` row to update; the route must reject this with a 400, not silently no-op or crash on a missing row. Covered in Task 3.
- **Widget log-shown payload with a mix of personal and bank ids in the same call, including a malformed id that matches neither pattern** — `/api/widget/log-shown` must skip/ignore unparseable items rather than fail the whole batch (one bad item shouldn't lose the rest of the log). Covered in Task 4.
- **Email job's `advance-schedule` step removal must not break `content.words[].step === 'bank'` filtering elsewhere** — after removing the step, bank words must still not cause an error when logged to `suggestion_log` (no `translate_history` row to reference, only `bank_word_id`). Covered in Task 5.
- **User viewing "Đã gợi ý" tab with zero suggestion history** (new user, or one who only ever got in-app review, never email/widget) — the tab must render an empty state, not crash on an empty array or undefined `data.items`. Covered in Task 7.

---

## File Structure

**New files:**
- `supabase/migrations/20261010000100_suggestion_log.sql` — table + RLS.
- `web/src/lib/learning/schedule-adjustment.js` — pure function computing the next `due_at`/`state`/`review_count` from a rating + current review state. Unit-tested without DB.
- `web/src/app/api/learning/schedule/route.js` — `PATCH`, applies a rating to one `translate_history` or `journal_entries` row.
- `web/src/app/api/suggestion-log/route.js` — `GET`, paginated list of suggestion log entries joined with word/meaning data.
- `web/src/app/api/widget/log-shown/route.js` — `POST`, iOS host app logs a widget batch.
- `web/src/lib/widget/parse-widget-item-id.js` — pure function parsing a `WidgetWordItem.id` string (`"bank-<uuid>"` vs a plain `translate_history` uuid) into `{ entry_type, entry_id, bank_word_id }` or `null` if unparseable. Unit-tested.
- `web/src/components/ui/WordDefinitions.js` — extracted from `InlineTranslate.js` so both it and the new popup can render AI dictionary results.
- `web/src/components/home/SuggestionHistoryTab.js` — the "Đã gợi ý" tab content: list + popup + the 3 rating buttons.
- `mobile/ios/WordlyiOS/Core/Network/APIClient+Features.swift` — add `logWidgetShown(items:)` (modify, not create — file already exists for feature-specific API calls).

**Modified files:**
- `web/src/inngest/functions.js` — replace Step 6 (`advance-schedule`) with a step that writes to `suggestion_log` instead of mutating `due_at`/`review_count`/`state`.
- `web/src/components/home/InlineTranslate.js` — remove the local `WordDefinitions` function, `POS_LABEL`, `POS_COLOR`, `posStyle`; import them from the new shared file instead.
- `web/src/components/home/TranslateHistory.js` — add a simple tab switcher (Lịch sử dịch / Đã gợi ý) around the existing body, mounting `SuggestionHistoryTab` for the second tab.
- `mobile/ios/WordlyiOS/Core/Storage/AppGroupStorage.swift` — `WidgetSync.refresh()` and `WidgetSync.refreshBank()` call the new log-shown API after saving to the App Group.

## Interfaces Reference (for all tasks)

- `schedule-adjustment.js` exports `computeScheduleUpdate(current, rating)`:
  - `current`: `{ review_count: number | null | undefined }`
  - `rating`: `'easy' | 'hard' | 'skip_longer'`
  - Returns: `{ state: string, review_count: number, due_at: string (ISO), scheduled_days: number }` — throws `Error` if `rating` is not one of the three valid values.
- `parse-widget-item-id.js` exports `parseWidgetItemId(id)`:
  - `id`: `string`
  - Returns: `{ entry_type: 'translate_history', entry_id: string } | { entry_type: 'bank', bank_word_id: string } | null`

---

### Task 1: `suggestion_log` table + RLS migration

**Files:**
- Create: `supabase/migrations/20261010000100_suggestion_log.sql`
- Test: manual verification via local Supabase (no automated migration test harness exists in this repo today)

**Interfaces:**
- Produces: table `suggestion_log(id uuid, user_id uuid, source text, entry_type text, entry_id uuid, bank_word_id uuid, shown_at timestamptz)`, consumed by Tasks 3, 4, 5.

- [ ] **Step 1: Write the migration file**

```sql
-- Nhật ký "đã gợi ý từ gì, qua kênh nào" — nguồn cho tab "Đã gợi ý" trong
-- trang Lịch sử. Tách khỏi email_log (vẫn giữ nguyên, chỉ theo dõi trạng
-- thái gửi mail) vì widget không có bảng tương đương và cần nguồn chung
-- cho cả hai kênh.
--
-- Xem spec: docs/superpowers/specs/2026-10-10-suggestion-log-review-control-design.md

CREATE TABLE IF NOT EXISTS suggestion_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('email', 'widget')),
  entry_type    text NOT NULL CHECK (entry_type IN ('translate_history', 'journal_entries', 'bank')),
  entry_id      uuid,
  bank_word_id  uuid REFERENCES words(id) ON DELETE SET NULL,
  shown_at      timestamptz NOT NULL DEFAULT now(),

  -- entry_id xor bank_word_id, tuỳ entry_type
  CONSTRAINT suggestion_log_entry_shape CHECK (
    (entry_type = 'bank' AND entry_id IS NULL AND bank_word_id IS NOT NULL)
    OR (entry_type IN ('translate_history', 'journal_entries') AND entry_id IS NOT NULL AND bank_word_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS suggestion_log_user_idx ON suggestion_log (user_id, shown_at DESC);

ALTER TABLE suggestion_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON suggestion_log FROM anon;
GRANT SELECT ON suggestion_log TO authenticated;

DROP POLICY IF EXISTS suggestion_log_select_own ON suggestion_log;
CREATE POLICY suggestion_log_select_own ON suggestion_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Không có policy INSERT/UPDATE/DELETE cho authenticated/anon — chỉ service
-- role (API routes dùng createAdminClient(), Inngest job) ghi được vào bảng này.

COMMENT ON TABLE suggestion_log IS 'Nhật ký từ đã gợi ý qua email hoặc widget — nguồn cho tab "Đã gợi ý" trong trang Lịch sử. Không phải nơi theo dõi trạng thái gửi mail (đó là email_log).';
```

- [ ] **Step 2: Apply locally and verify**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly" && npx supabase db reset` (or `npx supabase migration up` if a local stack is already running — check `docs/LOCAL-SETUP-B2B.md` for the exact local workflow this repo uses before running).

Expected: migration applies with no errors; `\d suggestion_log` in `psql` (via `npx supabase db psql` or equivalent) shows the table, constraint, and index.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261010000100_suggestion_log.sql
git commit -m "feat(db): thêm bảng suggestion_log cho tính năng xem lại gợi ý"
```

---

### Task 2: `computeScheduleUpdate` pure function + tests

**Files:**
- Create: `web/src/lib/learning/schedule-adjustment.js`
- Test: `web/tests/unit/schedule-adjustment.test.mjs`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond the `EMAIL_INTERVALS` constant it re-reads from `web/src/lib/email/select-word-for-email.js`, which already exports it).
- Produces: `computeScheduleUpdate(current, rating)` — see Interfaces Reference above. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

```javascript
// web/tests/unit/schedule-adjustment.test.mjs
//
// Test hệ số điều chỉnh due_at khi user bấm Dễ/Khó/Bỏ qua lâu hơn trong tab
// "Đã gợi ý". Dùng lại thang EMAIL_INTERVALS đã có cho email, không phải
// FSRS thật (ts-fsrs là code chết, không dùng ở đây — xem spec).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeScheduleUpdate } from "../../src/lib/learning/schedule-adjustment.js";

describe("computeScheduleUpdate", () => {
  test("Dễ: nhảy lên nấc kế tiếp, tăng review_count", () => {
    const result = computeScheduleUpdate({ review_count: 0 }, "easy");
    assert.equal(result.state, "review");
    assert.equal(result.review_count, 1);
    assert.equal(result.scheduled_days, 3); // EMAIL_INTERVALS[1]
  });

  test("Dễ ở nấc cuối: giữ nguyên nấc cuối (90 ngày), review_count vẫn tăng", () => {
    const result = computeScheduleUpdate({ review_count: 5 }, "easy");
    assert.equal(result.scheduled_days, 90);
    assert.equal(result.review_count, 6);
  });

  test("Khó: lùi 1 nấc, review_count không đổi", () => {
    const result = computeScheduleUpdate({ review_count: 2 }, "hard");
    assert.equal(result.scheduled_days, 3); // EMAIL_INTERVALS[1], lùi từ nấc 2 (7 ngày)
    assert.equal(result.review_count, 2);
  });

  test("Khó ở nấc đầu: không lùi dưới 1 ngày", () => {
    const result = computeScheduleUpdate({ review_count: 0 }, "hard");
    assert.equal(result.scheduled_days, 1);
    assert.equal(result.review_count, 0);
  });

  test("Bỏ qua lâu hơn: luôn set nấc cuối (90 ngày), review_count không đổi", () => {
    const result = computeScheduleUpdate({ review_count: 1 }, "skip_longer");
    assert.equal(result.scheduled_days, 90);
    assert.equal(result.review_count, 1);
  });

  test("review_count null/undefined được coi là 0", () => {
    const result = computeScheduleUpdate({ review_count: null }, "easy");
    assert.equal(result.review_count, 1);
    assert.equal(result.scheduled_days, 3);
  });

  test("due_at là ISO string trong tương lai", () => {
    const before = Date.now();
    const result = computeScheduleUpdate({ review_count: 0 }, "easy");
    const dueAt = new Date(result.due_at).getTime();
    assert.ok(dueAt > before, "due_at phải ở tương lai");
  });

  test("rating không hợp lệ thì throw", () => {
    assert.throws(() => computeScheduleUpdate({ review_count: 0 }, "invalid"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/schedule-adjustment.test.mjs`
Expected: FAIL — `Cannot find module '../../src/lib/learning/schedule-adjustment.js'`

- [ ] **Step 3: Write the implementation**

```javascript
// web/src/lib/learning/schedule-adjustment.js
//
// Hệ số điều chỉnh due_at khi user chủ động bấm Dễ/Khó/Bỏ qua lâu hơn trong
// tab "Đã gợi ý" (web/src/components/home/SuggestionHistoryTab.js) hoặc gọi
// PATCH /api/learning/schedule. Dùng lại thang EMAIL_INTERVALS của email —
// KHÔNG dùng ts-fsrs (code chết, xem docs/superpowers/specs/2026-10-10-...).

import { EMAIL_INTERVALS } from "@/lib/email/select-word-for-email";

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/schedule-adjustment.test.mjs`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/learning/schedule-adjustment.js web/tests/unit/schedule-adjustment.test.mjs
git commit -m "feat(learning): thêm hàm tính due_at khi user đánh giá Dễ/Khó/Bỏ qua lâu hơn"
```

---

### Task 3: `PATCH /api/learning/schedule` route

**Files:**
- Create: `web/src/app/api/learning/schedule/route.js`
- Test: `web/tests/unit/learning-schedule-validation.test.mjs` (validation logic only — the route itself needs a live DB to fully test, consistent with how `translate-history/route.js` has no route-level unit test in this repo)

**Interfaces:**
- Consumes: `computeScheduleUpdate(current, rating)` from Task 2 (`web/src/lib/learning/schedule-adjustment.js`), `getUserFast()` from `web/src/lib/auth/get-user-fast.js`, `createAdminClient()` from `web/src/lib/supabase/admin.js`.
- Produces: `PATCH /api/learning/schedule` — consumed by Task 7 (UI).

- [ ] **Step 1: Write the failing test for request validation**

```javascript
// web/tests/unit/learning-schedule-validation.test.mjs
//
// Validation cho PATCH /api/learning/schedule tách thành hàm thuần để test
// không cần DB. entry_type='bank' bị chặn ở đây vì bank word không có row
// translate_history/journal_entries để update.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { validateScheduleRequest } from "../../src/lib/learning/schedule-adjustment.js";

describe("validateScheduleRequest", () => {
  test("chấp nhận entry_type translate_history hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", entry_id: "abc", rating: "easy" });
    assert.equal(result.error, null);
  });

  test("chấp nhận entry_type journal_entries hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "journal_entries", entry_id: "abc", rating: "hard" });
    assert.equal(result.error, null);
  });

  test("từ chối entry_type bank — không có row để update", () => {
    const result = validateScheduleRequest({ entry_type: "bank", entry_id: "abc", rating: "easy" });
    assert.match(result.error, /bank/i);
  });

  test("từ chối thiếu entry_id", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", rating: "easy" });
    assert.ok(result.error);
  });

  test("từ chối rating không hợp lệ", () => {
    const result = validateScheduleRequest({ entry_type: "translate_history", entry_id: "abc", rating: "nope" });
    assert.ok(result.error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/learning-schedule-validation.test.mjs`
Expected: FAIL — `validateScheduleRequest` is not exported.

- [ ] **Step 3: Add `validateScheduleRequest` to `schedule-adjustment.js`**

Add to `web/src/lib/learning/schedule-adjustment.js` (append, keep `computeScheduleUpdate` as-is):

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/learning-schedule-validation.test.mjs`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Write the route**

```javascript
// web/src/app/api/learning/schedule/route.js
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeScheduleUpdate, validateScheduleRequest } from "@/lib/learning/schedule-adjustment";

const TABLE_BY_ENTRY_TYPE = {
  translate_history: "translate_history",
  journal_entries: "journal_entries",
};

export async function PATCH(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { error: validationError } = validateScheduleRequest(body);
  if (validationError) return Response.json({ error: validationError }, { status: 400 });

  const { entry_type, entry_id, rating } = body;
  const table = TABLE_BY_ENTRY_TYPE[entry_type];
  const admin = createAdminClient();

  const { data: current, error: fetchError } = await admin
    .from(table)
    .select("review_count")
    .eq("id", entry_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return Response.json({ error: fetchError.message }, { status: 500 });
  if (!current) return Response.json({ error: "Không tìm thấy mục này" }, { status: 404 });

  const update = computeScheduleUpdate(current, rating);

  const { error: updateError } = await admin
    .from(table)
    .update({ ...update, last_reviewed_at: new Date().toISOString() })
    .eq("id", entry_id)
    .eq("user_id", user.id);

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  return Response.json({ success: true, ...update });
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/learning/schedule-adjustment.js web/src/app/api/learning/schedule/route.js web/tests/unit/learning-schedule-validation.test.mjs
git commit -m "feat(api): thêm PATCH /api/learning/schedule để user tự điều chỉnh due_at"
```

---

### Task 4: `parseWidgetItemId` + `POST /api/widget/log-shown` route

**Files:**
- Create: `web/src/lib/widget/parse-widget-item-id.js`
- Create: `web/src/app/api/widget/log-shown/route.js`
- Test: `web/tests/unit/parse-widget-item-id.test.mjs`

**Interfaces:**
- Consumes: `getUserFast()`, `createAdminClient()`.
- Produces: `parseWidgetItemId(id)` (see Interfaces Reference), `POST /api/widget/log-shown` — consumed by Task 6 (iOS).

- [ ] **Step 1: Write the failing tests**

```javascript
// web/tests/unit/parse-widget-item-id.test.mjs
//
// WidgetWordItem.id trên iOS là id của translate_history row cho từ cá nhân,
// hoặc "bank-<uuid>" cho từ kho (xem BankWords.swift: `"bank-\(r.id)"`).
// Cần phân loại đúng để ghi vào suggestion_log (entry_id vs bank_word_id).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseWidgetItemId } from "../../src/lib/widget/parse-widget-item-id.js";

describe("parseWidgetItemId", () => {
  test("id thường → translate_history", () => {
    const result = parseWidgetItemId("550e8400-e29b-41d4-a716-446655440000");
    assert.deepEqual(result, {
      entry_type: "translate_history",
      entry_id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  test("id dạng bank-<uuid> → bank", () => {
    const result = parseWidgetItemId("bank-550e8400-e29b-41d4-a716-446655440000");
    assert.deepEqual(result, {
      entry_type: "bank",
      bank_word_id: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  test("id rỗng hoặc không phải string → null", () => {
    assert.equal(parseWidgetItemId(""), null);
    assert.equal(parseWidgetItemId(null), null);
    assert.equal(parseWidgetItemId(undefined), null);
  });

  test("bank- mà không có uuid theo sau → null", () => {
    assert.equal(parseWidgetItemId("bank-"), null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/parse-widget-item-id.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```javascript
// web/src/lib/widget/parse-widget-item-id.js
//
// WidgetWordItem.id trên iOS (mobile/ios/.../AppGroupStorage.swift,
// BankWords.swift) là: id thật của translate_history cho từ cá nhân, hoặc
// "bank-<uuid>" cho từ kho dùng chung. API log-shown cần tách hai loại để
// ghi đúng cột (entry_id vs bank_word_id) vào suggestion_log.

const BANK_PREFIX = "bank-";

export function parseWidgetItemId(id) {
  if (typeof id !== "string" || !id.trim()) return null;

  if (id.startsWith(BANK_PREFIX)) {
    const bankId = id.slice(BANK_PREFIX.length).trim();
    if (!bankId) return null;
    return { entry_type: "bank", bank_word_id: bankId };
  }

  return { entry_type: "translate_history", entry_id: id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && node --test tests/unit/parse-widget-item-id.test.mjs`
Expected: PASS, all 4 tests green.

- [ ] **Step 5: Write the route**

```javascript
// web/src/app/api/widget/log-shown/route.js
//
// App iOS gọi khi tính lại batch widget (WidgetSync.refresh()/refreshBank()
// trong AppGroupStorage.swift) — KHÔNG phải mỗi lần render lock-screen
// (widget extension vẫn hoàn toàn read-only).
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseWidgetItemId } from "@/lib/widget/parse-widget-item-id";

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { items } = await request.json().catch(() => ({}));
  if (!Array.isArray(items) || items.length === 0) {
    return Response.json({ error: "items phải là một danh sách không rỗng" }, { status: 400 });
  }

  // Bỏ qua item không parse được thay vì làm fail cả batch — một id lỗi
  // không nên làm mất log của những id hợp lệ còn lại.
  const rows = items
    .map((item) => parseWidgetItemId(item?.id))
    .filter(Boolean)
    .map((parsed) => ({
      user_id: user.id,
      source: "widget",
      ...parsed,
    }));

  if (rows.length === 0) {
    return Response.json({ error: "Không có item hợp lệ nào trong danh sách" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("suggestion_log").insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ success: true, logged: rows.length });
}
```

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/widget/parse-widget-item-id.js web/src/app/api/widget/log-shown/route.js web/tests/unit/parse-widget-item-id.test.mjs
git commit -m "feat(api): thêm POST /api/widget/log-shown để ghi nhận từ widget đã hiện"
```

---

### Task 5: Replace email job's `advance-schedule` step with `suggestion_log` writes

**Files:**
- Modify: `web/src/inngest/functions.js` (Step 6, currently lines ~292-335 — re-verify exact lines before editing since Tasks 1-4 don't touch this file)

**Interfaces:**
- Consumes: `suggestion_log` table from Task 1.
- Produces: email sends no longer silently advance `due_at`/`review_count`/`state` — this is a behavior change Task 7's UI and Task 3's route become the only path for schedule changes going forward.

- [ ] **Step 1: Read current Step 6 to confirm line numbers are unchanged**

Run: `grep -n "Step 6: advance" "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web/src/inngest/functions.js"`
Expected: still around line 292 (confirm before editing — if Tasks 1-4 shifted anything in this file, which they shouldn't since none of them touch it, re-locate here).

- [ ] **Step 2: Replace the step**

Replace this block (currently `web/src/inngest/functions.js:292-335`):

```javascript
    // ── Step 6: advance spaced-repetition schedule for every sent entry ───────
    // Sets due_at = now + interval[review_count] so the same word isn't picked
    // again until its next scheduled window. Throws on DB failure so Inngest
    // retries this step (email already sent — only the schedule update is redone).
    await step.run("advance-schedule", async () => {
      const supabase = createAdminClient();
      const now = new Date();

      const buildUpdate = (reviewCount) => {
        const intervalDays = EMAIL_INTERVALS[Math.min(reviewCount, EMAIL_INTERVALS.length - 1)];
        const dueAt = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
        return {
          state: "review",
          review_count: reviewCount + 1,
          last_reviewed_at: now.toISOString(),
          due_at: dueAt.toISOString(),
          scheduled_days: intervalDays,
        };
      };

      const results = await Promise.all([
        // Bank words have no translate_history row — nothing to reschedule
        ...content.words.filter(w => w.step !== "bank").map(w =>
          supabase
            .from("translate_history")
            .update(buildUpdate(w.review_count ?? 0))
            .eq("id", w.id)
            .eq("user_id", user_id)
        ),
        ...(content.journal ? [
          supabase
            .from("journal_entries")
            .update(buildUpdate(content.journal.review_count ?? 0))
            .eq("id", content.journal.id)
            .eq("user_id", user_id)
        ] : []),
      ]);

      const failed = results.filter(r => r.error);
      if (failed.length > 0) {
        const msgs = failed.map(r => r.error.message).join("; ");
        throw new Error(`advance-schedule DB update failed: ${msgs}`);
      }
    });
```

with:

```javascript
    // ── Step 6: log every sent entry to suggestion_log ────────────────────────
    // Gửi email KHÔNG còn tự coi là "đã học tốt" — chỉ ghi nhận đã gợi ý.
    // due_at/state/review_count chỉ đổi khi user chủ động bấm Dễ/Khó/Bỏ qua
    // lâu hơn (PATCH /api/learning/schedule). Xem spec 2026-10-10.
    await step.run("log-suggestions", async () => {
      const supabase = createAdminClient();

      const rows = [
        // Bank words have no translate_history row — logged via bank_word_id.
        ...content.words.map(w => w.step === "bank"
          ? { user_id, source: "email", entry_type: "bank", bank_word_id: w.id }
          : { user_id, source: "email", entry_type: "translate_history", entry_id: w.id }),
        ...(content.journal
          ? [{ user_id, source: "email", entry_type: "journal_entries", entry_id: content.journal.id }]
          : []),
      ];

      const { error } = await supabase.from("suggestion_log").insert(rows);
      if (error) throw new Error(`log-suggestions DB insert failed: ${error.message}`);
    });
```

- [ ] **Step 3: Remove the now-unused `EMAIL_INTERVALS` import if nothing else in the file uses it**

Run: `grep -n "EMAIL_INTERVALS" "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web/src/inngest/functions.js"`

If the only remaining match is the `import` line itself, edit the import at the top of the file:

```javascript
import { selectEmailContent, selectBankWords } from "@/lib/email/select-word-for-email";
```

(removing `EMAIL_INTERVALS` from the destructured import — `select-word-for-email.js` itself keeps exporting it, since `schedule-adjustment.js` from Task 2 depends on it.)

- [ ] **Step 4: Check for existing Inngest function tests and run them**

Run: `grep -rl "functions.js\|advance-schedule\|inngest" "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web/tests/"`

If a test references `advance-schedule` or the old behavior, update it to assert the new `log-suggestions` step instead (write the specific assertion once you see the existing test's structure — do not guess its shape here).

- [ ] **Step 5: Run the full unit test suite**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npm test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add web/src/inngest/functions.js
git commit -m "fix(email): gửi mail không còn tự động coi là đã học tốt, chỉ ghi nhận đã gợi ý"
```

---

### Task 6: Extract `WordDefinitions` into a shared component

**Files:**
- Create: `web/src/components/ui/WordDefinitions.js`
- Modify: `web/src/components/home/InlineTranslate.js` (remove lines defining `POS_LABEL`, `POS_COLOR`, `posStyle`, and the local `WordDefinitions` function; add an import instead)

**Interfaces:**
- Produces: default export `WordDefinitions({ detail, onAskAI })` — a React component. Consumed by Task 7.

- [ ] **Step 1: Create the shared component file**

Move the exact content currently in `web/src/components/home/InlineTranslate.js` at lines 36-48 (`POS_LABEL`, `POS_COLOR`, `posStyle`) and lines 786-844 (`WordDefinitions` function) into:

```javascript
// web/src/components/ui/WordDefinitions.js
//
// Hiển thị nghĩa/từ loại/phát âm từ kết quả tra từ điển AI
// (web/src/lib/ai/dictionary-client.js). Tách ra từ InlineTranslate.js để
// dùng lại trong tab "Đã gợi ý" (SuggestionHistoryTab.js).
"use client";

const POS_LABEL = {
  noun: "Danh từ", verb: "Động từ", adjective: "Tính từ",
  adverb: "Trạng từ", pronoun: "Đại từ", preposition: "Giới từ",
  conjunction: "Liên từ", interjection: "Thán từ", exclamation: "Thán từ",
};
const POS_COLOR = {
  noun:      { bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)",  text: "#60A5FA" },
  verb:      { bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)", text: "#A78BFA" },
  adjective: { bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)",  text: "#FBBF24" },
  adverb:    { bg: "rgba(232,121,249,0.12)", border: "rgba(232,121,249,0.3)", text: "#E879F9" },
  default:   { bg: "var(--hover-bg)",         border: "var(--divider)",         text: "var(--ink-soft)" },
};
const posStyle = (pos) => POS_COLOR[pos] || POS_COLOR.default;

export default function WordDefinitions({ detail, onAskAI }) {
  const { phoneticUs, phoneticUk, meanings, hasMoreMeanings } = detail;
  return (
    <div className="flex flex-col gap-3">
      {(phoneticUs || phoneticUk) && (
        <div className="flex items-center gap-3 text-xs font-mono" style={{ color: "var(--ink-soft)" }}>
          {phoneticUs && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>US</span>{phoneticUs}</span>}
          {phoneticUk && <span><span className="font-sans font-bold not-italic mr-1" style={{ color: "var(--ink-ghost)" }}>UK</span>{phoneticUk}</span>}
        </div>
      )}
      {meanings.map((m, mi) => {
        const s = posStyle(m.pos);
        return (
          <div key={mi} className="flex flex-col gap-1.5">
            <span
              className="self-start text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
            >
              {POS_LABEL[m.pos] || m.pos}
            </span>
            <ol className="flex flex-col gap-2 pl-1">
              {m.defs.map((d, di) => (
                <li key={di} className="flex flex-col gap-0.5">
                  <span className="text-xs leading-relaxed" style={{ color: "var(--ink)" }}>
                    <span className="font-semibold mr-1" style={{ color: "var(--ink-soft)" }}>{di + 1}.</span>
                    {d.def}
                    {d.def_vi && <span style={{ color: "var(--electric)" }}> — {d.def_vi}</span>}
                  </span>
                  {d.example && (
                    <span
                      className="text-[11px] italic pl-3 leading-relaxed"
                      style={{ color: "var(--ink-ghost)", borderLeft: "2px solid var(--green-subtle-border)" }}
                    >
                      &ldquo;{d.example}&rdquo;
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
      {meanings.length === 0 && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          Không tìm thấy định nghĩa chi tiết.
        </p>
      )}
      {hasMoreMeanings && (
        <button
          onClick={onAskAI}
          className="self-start text-[11px] font-semibold hover:underline"
          style={{ color: "var(--electric)" }}
        >
          Từ này còn nhiều nghĩa khác — Nhấn Hỏi AI để biết thêm →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `InlineTranslate.js` to import instead of defining locally**

In `web/src/components/home/InlineTranslate.js`:
- Remove lines 36-48 (`POS_LABEL`, `POS_COLOR`, `posStyle` consts).
- Remove lines 786-844 (the local `WordDefinitions` function — note the file's two usages at the lines reported earlier, e.g. around 622 and 673, stay unchanged since they just call `<WordDefinitions ... />`).
- Add near the top imports (after the `lookupWord` import):

```javascript
import WordDefinitions from "@/components/ui/WordDefinitions";
```

- [ ] **Step 3: Run build to confirm no missing references**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npx next build`
Expected: "Compiled successfully" — confirms `POS_LABEL`/`POS_COLOR`/`posStyle` weren't referenced anywhere else in `InlineTranslate.js` outside the removed `WordDefinitions` function (if build fails on an undefined reference, that's a usage this step missed — find it with `grep -n "POS_LABEL\|POS_COLOR\|posStyle" web/src/components/home/InlineTranslate.js` and keep it local or re-import as needed).

- [ ] **Step 4: Run the existing test suite**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npm test`
Expected: PASS, no regressions (this is a pure extraction, no behavior change).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ui/WordDefinitions.js web/src/components/home/InlineTranslate.js
git commit -m "refactor(ui): tách WordDefinitions thành component dùng chung"
```

---

### Task 7: `GET /api/suggestion-log` route + `SuggestionHistoryTab` UI

**Files:**
- Create: `web/src/app/api/suggestion-log/route.js`
- Create: `web/src/components/home/SuggestionHistoryTab.js`
- Modify: `web/src/components/home/TranslateHistory.js` (add tab switcher around the existing body)

**Interfaces:**
- Consumes: `lookupWord`, `normalizeWordKey` from `web/src/lib/ai/dictionary-client.js`; `WordDefinitions` from Task 6; `getUserFast()`, `createAdminClient()`.
- Produces: `GET /api/suggestion-log?limit=&offset=` returning `{ items: [...], hasMore: boolean }`, where each item is `{ id, source, entry_type, shown_at, word, meaning, state, due_at, review_count }`.

- [ ] **Step 1: Write the route**

```javascript
// web/src/app/api/suggestion-log/route.js
import { getUserFast } from "@/lib/auth/get-user-fast";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE_SIZE_MAX = 50;

export async function GET(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ items: [], hasMore: false });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), PAGE_SIZE_MAX);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const admin = createAdminClient();

  const { data: logs, error } = await admin
    .from("suggestion_log")
    .select("id, source, entry_type, entry_id, bank_word_id, shown_at")
    .eq("user_id", user.id)
    .order("shown_at", { ascending: false })
    .range(offset, offset + limit);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = (logs || []).length > limit;
  const page = (logs || []).slice(0, limit);

  const translateIds = page.filter(l => l.entry_type === "translate_history").map(l => l.entry_id);
  const journalIds = page.filter(l => l.entry_type === "journal_entries").map(l => l.entry_id);
  const bankIds = page.filter(l => l.entry_type === "bank").map(l => l.bank_word_id);

  const [{ data: translateRows }, { data: journalRows }, { data: bankRows }] = await Promise.all([
    translateIds.length
      ? admin.from("translate_history").select("id, source_text, translated_text, state, due_at, review_count").in("id", translateIds)
      : Promise.resolve({ data: [] }),
    journalIds.length
      ? admin.from("journal_entries").select("id, content, state, due_at, review_count").in("id", journalIds)
      : Promise.resolve({ data: [] }),
    bankIds.length
      ? admin.from("words").select("id, word, def_vi, def_en").in("id", bankIds)
      : Promise.resolve({ data: [] }),
  ]);

  const translateMap = new Map((translateRows || []).map(r => [r.id, r]));
  const journalMap = new Map((journalRows || []).map(r => [r.id, r]));
  const bankMap = new Map((bankRows || []).map(r => [r.id, r]));

  const items = page.map(log => {
    if (log.entry_type === "translate_history") {
      const row = translateMap.get(log.entry_id);
      return row && {
        id: log.id, source: log.source, entry_type: log.entry_type, entry_id: log.entry_id,
        shown_at: log.shown_at, word: row.source_text, meaning: row.translated_text,
        state: row.state, due_at: row.due_at, review_count: row.review_count,
      };
    }
    if (log.entry_type === "journal_entries") {
      const row = journalMap.get(log.entry_id);
      return row && {
        id: log.id, source: log.source, entry_type: log.entry_type, entry_id: log.entry_id,
        shown_at: log.shown_at, word: row.content, meaning: null,
        state: row.state, due_at: row.due_at, review_count: row.review_count,
      };
    }
    const row = bankMap.get(log.bank_word_id);
    return row && {
      id: log.id, source: log.source, entry_type: log.entry_type, bank_word_id: log.bank_word_id,
      shown_at: log.shown_at, word: row.word, meaning: row.def_vi || row.def_en,
      state: null, due_at: null, review_count: null,
    };
  }).filter(Boolean); // referenced row may have been deleted since being logged

  return Response.json({ items, hasMore });
}
```

- [ ] **Step 2: Write the UI component**

```javascript
// web/src/components/home/SuggestionHistoryTab.js
//
// Tab "Đã gợi ý" trong trang Lịch sử: liệt kê từ đã gửi qua email/widget,
// click vào từ mở popup tra nghĩa AI (dùng lại WordDefinitions) kèm 3 nút
// Dễ/Khó/Bỏ qua lâu hơn để tự điều chỉnh due_at.
"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Smartphone, Loader2, ChevronDown } from "lucide-react";
import Modal from "@/components/ui/Modal";
import WordDefinitions from "@/components/ui/WordDefinitions";
import { lookupWord, normalizeWordKey } from "@/lib/ai/dictionary-client";

const PAGE_SIZE = 20;

const STATE_LABEL = {
  new: "Mới",
  review: "Đang ôn",
  relearning: "Đang học lại",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function SuggestionHistoryTab({ isLoggedIn = false }) {
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null); // the clicked item, opens the popup

  const fetchItems = useCallback(async () => {
    if (!isLoggedIn) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/suggestion-log?limit=${PAGE_SIZE}&offset=0`);
      const data = await res.json();
      setItems(data.items || []);
      setHasMore(data.hasMore ?? false);
      setOffset(PAGE_SIZE);
    } catch {
      setItems([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn]);

  const loadMore = async () => {
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/suggestion-log?limit=${PAGE_SIZE}&offset=${offset}`);
      const data = await res.json();
      setItems(prev => [...prev, ...(data.items || [])]);
      setHasMore(data.hasMore ?? false);
      setOffset(prev => prev + PAGE_SIZE);
    } catch {
      // silently fail — existing items stay visible
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => { fetchItems(); }, [fetchItems]);

  if (!isLoggedIn) return null;

  if (!isLoading && items.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
        Chưa có từ nào được gợi ý qua email hoặc widget.
      </p>
    );
  }

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--electric)" }} />
        </div>
      ) : (
        items.map(item => (
          <button
            key={item.id}
            onClick={() => setSelected(item)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
            style={{ borderTop: "1px solid var(--divider)" }}
          >
            {item.source === "email" ? <Mail size={13} style={{ color: "var(--ink-soft)" }} /> : <Smartphone size={13} style={{ color: "var(--ink-soft)" }} />}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{item.word}</span>
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{formatDate(item.shown_at)}</span>
            </div>
            {item.state && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
              >
                {STATE_LABEL[item.state] || item.state}
              </span>
            )}
          </button>
        ))
      )}

      {hasMore && (
        <div className="px-4 py-3 flex justify-center">
          <button
            onClick={loadMore}
            disabled={isLoadingMore}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--hover-bg)", color: "var(--electric)", border: "1px solid var(--green-subtle-border)" }}
          >
            {isLoadingMore
              ? <><Loader2 size={12} className="animate-spin" /> Đang tải...</>
              : <><ChevronDown size={12} /> Tải thêm</>}
          </button>
        </div>
      )}

      {selected && (
        <SuggestionDetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onRated={(update) => {
            setItems(prev => prev.map(it => it.id === selected.id ? { ...it, ...update } : it));
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

function SuggestionDetailModal({ item, onClose, onRated }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rating, setRating] = useState(null); // which button is in-flight

  useEffect(() => {
    let active = true;
    (async () => {
      const key = normalizeWordKey(item.word);
      const { detail, error, notFound } = await lookupWord(key);
      if (!active) return;
      setDetail(detail);
      setError(error || (notFound ? `Không tìm thấy "${key}" trong từ điển.` : null));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [item.word]);

  const canRate = item.entry_type !== "bank";

  const rate = async (value) => {
    setRating(value);
    try {
      const res = await fetch("/api/learning/schedule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_type: item.entry_type, entry_id: item.entry_id, rating: value }),
      });
      const data = await res.json();
      if (res.ok) onRated(data);
    } finally {
      setRating(null);
    }
  };

  return (
    <Modal onClose={onClose}>
      <h3 className="font-bold text-lg mb-3" style={{ color: "var(--ink)" }}>{item.word}</h3>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--electric)" }} />
        </div>
      ) : error ? (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{error}</p>
      ) : detail ? (
        <WordDefinitions detail={detail} />
      ) : null}

      {canRate && (
        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: "1px solid var(--divider)" }}>
          <button
            onClick={() => rate("hard")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--error-soft)", color: "var(--error)" }}
          >
            Khó
          </button>
          <button
            onClick={() => rate("easy")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--green-subtle)", color: "var(--electric)" }}
          >
            Dễ
          </button>
          <button
            onClick={() => rate("skip_longer")}
            disabled={rating !== null}
            className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            style={{ background: "var(--hover-bg)", color: "var(--ink-soft)" }}
          >
            Bỏ qua lâu hơn
          </button>
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Add the tab switcher to `TranslateHistory.js`**

In `web/src/components/home/TranslateHistory.js`:
- Add import: `import SuggestionHistoryTab from "@/components/home/SuggestionHistoryTab";`
- Add state near the top of the component: `const [activeTab, setActiveTab] = useState("history"); // 'history' | 'suggestions'`
- In the header section (around the existing title `<span>Lịch sử dịch</span>`), add a tab switcher row below the header, above the body:

```jsx
{!collapsed && (
  <div className="flex gap-1 px-4 pt-2" style={{ borderBottom: "1px solid var(--divider)" }}>
    <button
      onClick={() => setActiveTab("history")}
      className="text-xs font-semibold px-3 py-1.5 rounded-t-lg"
      style={{
        color: activeTab === "history" ? "var(--electric)" : "var(--ink-soft)",
        borderBottom: activeTab === "history" ? "2px solid var(--electric)" : "2px solid transparent",
      }}
    >
      Lịch sử dịch
    </button>
    <button
      onClick={() => setActiveTab("suggestions")}
      className="text-xs font-semibold px-3 py-1.5 rounded-t-lg"
      style={{
        color: activeTab === "suggestions" ? "var(--electric)" : "var(--ink-soft)",
        borderBottom: activeTab === "suggestions" ? "2px solid var(--electric)" : "2px solid transparent",
      }}
    >
      Đã gợi ý
    </button>
  </div>
)}
```

- Wrap the existing body content (the `groups.map(...)` block through the "Xoá hết" button, currently inside `{!collapsed && (<div>...</div>)}`) with `{activeTab === "history" && (...)}`, and add `{activeTab === "suggestions" && <SuggestionHistoryTab isLoggedIn={isLoggedIn} />}` as a sibling inside the same `{!collapsed && (...)}` block.
- Note the existing early return `if (!isLoggedIn || (groups.length === 0 && !isLoading && !undo)) return null;` (line 120) would currently hide the whole component — including the new "Đã gợi ý" tab — whenever `groups` (translate history) is empty, even if suggestion history has items. Change this condition to only gate on `isLoggedIn`: `if (!isLoggedIn) return null;` — the empty states for each tab are now handled inside that tab's own content (the existing history tab already has no special empty-state UI today; leave that behavior as-is, only remove the `groups.length === 0` part of this specific condition).

- [ ] **Step 4: Manual verification in the browser**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npm run dev` (use the port helper per `atlas-localhost-ports` skill if multiple sessions are running)

Open the home page logged in, confirm:
- "Lịch sử dịch" tab shows existing behavior unchanged.
- "Đã gợi ý" tab shows an empty state if `suggestion_log` has no rows yet (expected on a fresh local DB — this endpoint has no data until Task 5's job runs or test data is seeded).
- Manually insert a test row into `suggestion_log` pointing at a real `translate_history` row for the test user, reload, confirm it appears, click it, confirm the popup opens and the AI lookup fires, confirm the 3 rating buttons call the PATCH endpoint (watch Network tab) and close the popup.

- [ ] **Step 5: Run full test suite and build**

Run: `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npm test && npx next build`
Expected: tests PASS, build "Compiled successfully".

- [ ] **Step 6: Commit**

```bash
git add web/src/app/api/suggestion-log/route.js web/src/components/home/SuggestionHistoryTab.js web/src/components/home/TranslateHistory.js
git commit -m "feat(ui): thêm tab Đã gợi ý với popup tra nghĩa AI và 3 nút điều chỉnh lịch ôn"
```

---

### Task 8: iOS — log widget batch on sync

**Files:**
- Modify: `mobile/ios/WordlyiOS/Core/Network/APIClient.swift` (add `logWidgetShown`)
- Modify: `mobile/ios/WordlyiOS/Core/Storage/AppGroupStorage.swift` (`WidgetSync.refresh()` and `WidgetSync.refreshBank()`)

**Interfaces:**
- Consumes: `POST /api/widget/log-shown` from Task 4, `WidgetWordItem` (existing type, has `.id` and `.word`).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Add the API call to `APIClient.swift`**

In `mobile/ios/WordlyiOS/Core/Network/APIClient.swift`, add near the other feature methods (after `fetchHistory`, following the same pattern as `saveTranslation`):

```swift
// MARK: - Widget suggestion log
func logWidgetShown(items: [WidgetWordItem]) async {
    struct Item: Encodable { let id: String }
    struct Body: Encodable { let items: [Item] }
    struct Resp: Decodable { let success: Bool? }
    // Lỗi không quan trọng — chỉ là log, không chặn người dùng.
    _ = try? await request(
        path: "/api/widget/log-shown",
        method: "POST",
        body: Body(items: items.map { Item(id: $0.id) }),
        responseType: Resp.self
    )
}
```

- [ ] **Step 2: Call it from `WidgetSync.refresh()` and `WidgetSync.refreshBank()`**

In `mobile/ios/WordlyiOS/Core/Storage/AppGroupStorage.swift`, modify `WidgetSync`:

```swift
enum WidgetSync {
    static func refresh() async {
        var all: [TranslateHistoryEntry] = []
        var offset = 0
        var fetchedAny = false
        while offset < 200 {
            guard let page = try? await APIClient.shared.fetchHistory(limit: 50, offset: offset) else { break }
            fetchedAny = true
            all += page.history
            if !page.hasMore { break }
            offset += 50
        }
        guard fetchedAny else { return }
        let items = AppGroupStorage.items(from: all)
        AppGroupStorage.shared.saveWords(items)
        if !items.isEmpty {
            Task { await APIClient.shared.logWidgetShown(items: items) }
        }
        await refreshBank()
    }

    static func refreshBank(force: Bool = false) async {
        let store = AppGroupStorage.shared
        let skill = try? await APIClient.shared.fetchProfile().profile?.skillLevel
        guard force || BankWords.needsRefresh(fetchedAt: store.bankFetchedAt, level: skill, lastLevel: store.bankLevel) else { return }
        guard let words = try? await BankWords.fetch(skill: skill), !words.isEmpty else { return }
        store.saveBank(words, level: skill)
        Task { await APIClient.shared.logWidgetShown(items: words) }
    }
}
```

Note: `Task { ... }` fire-and-forget keeps `refresh()`/`refreshBank()` from waiting on the log call — matches the spec's "không chặn UI" requirement.

- [ ] **Step 3: Build the iOS app to verify no compile errors**

Open `mobile/ios/` in Xcode (per the project's README for XcodeGen setup) and build the `WordlyiOS` target.
Expected: builds successfully, no errors in `APIClient.swift` or `AppGroupStorage.swift`.

- [ ] **Step 4: Manual verification in the simulator**

Run the app in the iOS Simulator, trigger a widget sync (open the app, or go to Settings → widget refresh per `WidgetSettingsView.swift`), and confirm via server logs or a direct Supabase table check that `suggestion_log` rows with `source: 'widget'` appear for the test account.

- [ ] **Step 5: Commit**

```bash
git add mobile/ios/WordlyiOS/Core/Network/APIClient.swift mobile/ios/WordlyiOS/Core/Storage/AppGroupStorage.swift
git commit -m "feat(ios): ghi nhận từ đã hiện trên widget vào suggestion_log"
```

---

## Final Verification (whole branch)

- [ ] Run `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npm test` — all green.
- [ ] Run `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npx next build` — "Compiled successfully".
- [ ] Run `cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly/web" && npx eslint src/app/api/learning/schedule/route.js src/app/api/suggestion-log/route.js src/app/api/widget/log-shown/route.js src/lib/learning/schedule-adjustment.js src/lib/widget/parse-widget-item-id.js src/components/ui/WordDefinitions.js src/components/home/SuggestionHistoryTab.js src/components/home/TranslateHistory.js src/components/home/InlineTranslate.js src/inngest/functions.js` — clean (ignore the two pre-existing `set-state-in-effect` errors in `practice/page.js` if touched incidentally — those predate this plan).
- [ ] Confirm no migration was applied to staging/production — only local Supabase (per Global Constraints).
- [ ] Update `PROGRESS.md` per CLAUDE.md section 8: mark this feature done with evidence (tests/build), note the iOS build/manual-verify as unverified-in-CI if not run through TestFlight yet, and record the email-behavior-change decision (no longer auto-advances schedule) as a new architectural decision.
