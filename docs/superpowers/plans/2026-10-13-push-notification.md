# Push notification nhắc ôn từ (iOS, FCM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng iOS nhận thông báo đẩy "một từ cần ôn + nghĩa" theo lịch riêng (mốc :00/:30), bấm vào mở đúng từ; đồng thời khung giờ email cũng chỉ còn mốc :00/:30.

**Architecture:** Cron VPS sẵn có (`/api/cron/send-emails`, 5 phút/lần) chạy thêm `runDuePushSends` song song với email. Postgres chọn slot tới giờ (`due_push_slots`), Node giành quyền gửi bằng unique `(slot_id, send_date)`, chọn từ bằng thuật toán email, gửi FCM HTTP v1 qua pool song song 20. iOS dùng `FirebaseMessaging` lấy FCM token, đăng ký qua RPC `register_push_device` (token thuộc người đăng ký gần nhất), bấm thông báo đi đường deep link widget `wordly://word?...`.

**Tech Stack:** Next 16 (route handlers), Supabase Postgres + RLS, `jose` (đã có), `node:test`; SwiftUI iOS 17, XcodeGen, Firebase iOS SDK (chỉ `FirebaseMessaging`), XCTest.

**Spec:** `docs/superpowers/specs/2026-10-13-push-notification-design.md` — đọc trước khi làm bất kỳ task nào.

## Global Constraints

- Mọi lệnh `npm`/`node` chạy trong `web/`. Test: `cd web && npm test`; RLS: `npm run test:rls` (cần Supabase local — cổng mặc định bị BedWar chiếm, đổi tạm `553xx` trong `supabase/config.toml`, **không commit**; tạo `web/.env.test.local` từ `npx supabase status -o env`).
- iOS test: **một** simulator `BedWar-iPhone16`, `-parallel-testing-enabled NO`. Sửa `project.yml` → chạy `cd mobile/ios && xcodegen generate`.
- TDD bắt buộc: test fail → verify fail → code → verify pass. Không bỏ bước verify fail.
- **Không** dùng `createAdminClient()` trong route người dùng; route cron đã có trong `ADMIN_ALLOWED`.
- Không thêm thư viện server (dùng `jose` + `fetch`). Không `firebase-admin`.
- Firebase iOS: **chỉ** product `FirebaseMessaging`. `GoogleService-Info.plist` **không commit** (gitignore). App phải build + chạy khi thiếu file này.
- Giờ nhắc: chỉ `HH:00`/`HH:30`. Lỗi: `"Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)"`, trùng: `"Đã có khung giờ HH:MM"`.
- Hằng số: cửa sổ bù 30 phút; song song 20; hạn lượt 240.000 ms; dọn `push_log` > 30 ngày, `push_devices` > 270 ngày, ≤ 5.000 dòng/lượt; `apns-expiration` +3600 s; body ≤ 150 ký tự; giờ push mặc định `20:00`; tối đa 10 khung; rate limit `/api/push/devices` 10/phút, route cài đặt push 30/phút (theo user id).
- Deep link: `wordly://word?id=<id>&w=<từ>&m=<nghĩa>&bank=0|1`, từ kho có id `bank-<words.id>`; mã hoá bằng `encodeURIComponent` (không dùng `URLSearchParams` — nó mã hoá dấu cách thành `+`, Swift đọc thành dấu `+` thật).
- Git: nhánh `feat/push-notification`; `git add <đường dẫn cụ thể>`, **không** `git add -A`; commit tiếng Việt nêu *vì sao*; **không** `Co-Authored-By`. Kiểm `git status --ignored mobile/` trước khi add file iOS.
- **Cửa bắt buộc (dừng, hỏi chủ dự án):** chạy migration lên production, deploy production, upload TestFlight/bump build. Plan này **không** tự làm các việc đó.

## Review Focus

1. **Từ/nghĩa có dấu cách, `+`, `&`, `#`, tiếng Việt có dấu** → link push phải được Swift `WidgetDeepLink(url:)` đọc ra đúng y nguyên chuỗi gốc. Test: Task 4 (JS mã hoá) + Task 13 (Swift đọc đúng chuỗi do JS tạo).
2. **FCM trả `INVALID_ARGUMENT` vì payload sai (không phải token)** → **không** được xoá token của người dùng (nếu không, một lỗi code xoá sạch mọi thiết bị). Test: Task 6.
3. **Khung 23:30, cron chạy lúc 00:05 hôm sau** → vẫn gửi, `send_date` = hôm qua, xét ngày-trong-tuần của hôm qua. Test: Task 3 (mô phỏng) + Task 3 RLS (hàm SQL thật).
4. **Khung giờ lẻ cũ (08:15) của email: bật/tắt không gửi `send_time`, hoặc PUT lại đúng giờ của chính nó** → phải được chấp nhận, không báo trùng/không hợp lệ. Test: Task 2.
5. **A đăng ký token, B đăng nhập cùng máy và đăng ký cùng token** → lượt cron sau chỉ gửi cho B, không gửi cho A. Test: Task 3 RLS (chuyển chủ) + Task 8 (cron đọc thiết bị theo user tại lúc gửi).

---

## File Structure

**Server (`web/`)**

| File | Trách nhiệm |
|---|---|
| `src/lib/reminders/slot-time.js` (mới) | Luật mốc :00/:30 dùng chung email + push |
| `src/lib/reminders/slot-guard.js` (mới) | Kiểm giờ mới so với các khung khác của người dùng (đọc DB) |
| `src/lib/reminders/run-reminder-cron.js` (mới) | Chạy email + push song song, lỗi bên này không chặn bên kia |
| `src/lib/email/cron-schedule.js` (sửa) | Export `safeTimezone`, `localParts`, `isScheduledDay` cho mô phỏng push |
| `src/lib/push/due-push-slots-model.js` (mới) | Mô phỏng JS của hàm SQL `due_push_slots` (test + đối chiếu) |
| `src/lib/push/build-message.js` (mới) | Từ → message FCM + deep link |
| `src/lib/push/google-access-token.js` (mới) | Service account → access token Google (cache) |
| `src/lib/push/fcm-config.js` (mới) | Đọc `FCM_*` từ env |
| `src/lib/push/fcm-client.js` (mới) | Gọi FCM v1, phân loại lỗi |
| `src/lib/push/run-pool.js` (mới) | Pool song song có hạn thời gian |
| `src/lib/push/cron-send-push.js` (mới) | Lượt gửi push |
| `src/lib/push/validate.js` (mới) | Validate body route push |
| `src/app/api/push/devices/route.js`, `preferences/route.js`, `slots/route.js` (mới) | API cho iOS |
| `src/app/api/email-slots/route.js` (sửa) | Áp luật mốc 30 phút |
| `src/app/api/cron/send-emails/route.js` (sửa) | Gọi `runReminderCron` |
| `../supabase/migrations/20261014000100_push_notifications.sql` (mới) | Bảng, RLS, 3 hàm SQL |
| `scripts/push-load-seed.sql`, `scripts/push-load-check.mjs` (mới) | Đo tải 10k (không chạy trong CI) |

**iOS (`mobile/ios/`)**

| File | Trách nhiệm |
|---|---|
| `WordlyiOS/Features/Settings/ReminderScheduleLogic.swift` (đổi tên từ `EmailSettingsLogic.swift`) | Logic thuần lịch nhắc + mốc 30 phút |
| `WordlyiOS/Features/Settings/ReminderSettings.swift` (mới) | `ReminderChannel`, `ReminderSettingsViewModel`, `ReminderSettingsForm`, `HalfHourPicker` |
| `WordlyiOS/Features/Settings/EmailSettingsView.swift` (sửa) | Dùng form chung |
| `WordlyiOS/Features/Settings/PushSettingsView.swift` (mới) | Màn "Thông báo nhắc ôn" + quyền |
| `WordlyiOS/Core/Push/PushLogic.swift` (mới) | Logic thuần push (đồng bộ token, đọc link, hỏi một lần) |
| `WordlyiOS/Core/Push/PushManager.swift` (mới) | Firebase, quyền, token, delegate thông báo |
| `WordlyiOS/App/AppDelegate.swift` (mới) | Nhận APNs token |
| `WordlyiOS/Core/Network/APIClient+Features.swift`, `APIClient.swift` (sửa) | API reminder theo kênh + push device; đọc thông báo lỗi server |
| `WordlyiOS/Core/Auth/AuthManager.swift` (sửa) | Huỷ token khi đăng xuất/xoá tài khoản |
| `WordlyiOS/App/WordlyApp.swift`, `ContentView.swift` (sửa) | Gắn delegate, đồng bộ token, mở link |
| `WordlyiOS/Features/Translate/TranslateViewModel.swift`, `TranslateView.swift` (sửa) | Sheet hỏi bật nhắc một lần |
| `WordlyiOS/Features/Profile/ProfileView.swift` (sửa) | Dòng "Thông báo nhắc ôn" |
| `project.yml`, `.gitignore`, `PrivacyInfo.xcprivacy` (sửa) | Firebase, entitlement, khai Device ID |

---

### Task 0: Nhánh làm việc

**Files:** spec + plan đã có trên nhánh `docs/push-notification-spec` (chưa commit).

- [ ] **Step 1: Tạo nhánh từ `main`, mang spec + plan theo**

```bash
cd "/Volumes/SanDisk/Working Companies/Dự án cá nhân/wordly"
git switch docs/push-notification-spec
git switch -c feat/push-notification
git add docs/superpowers/specs/2026-10-13-push-notification-design.md docs/superpowers/plans/2026-10-13-push-notification.md
git commit -m "docs: spec + plan push notification nhắc ôn từ (FCM, lịch riêng, mốc 30 phút) — chủ dự án đã duyệt spec 13/10"
```

---

### Task 1: Luật mốc :00/:30 (`slot-time.js`)

**Files:**
- Create: `web/src/lib/reminders/slot-time.js`
- Test: `web/tests/unit/slot-time.test.mjs`

**Interfaces:**
- Produces: `HALF_HOUR_TIMES: string[]` (48 mốc), `normalizeTime(value) → "HH:MM" | null`, `isHalfHour(value) → boolean`, `checkSlotTime(value, otherTimes) → { ok: true, time } | { ok: false, error }`, hằng `HALF_HOUR_ERROR`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/slot-time.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { HALF_HOUR_TIMES, normalizeTime, isHalfHour, checkSlotTime, HALF_HOUR_ERROR } from "../../src/lib/reminders/slot-time.js";

test("48 mốc từ 00:00 tới 23:30, cách nhau 30 phút", () => {
  assert.equal(HALF_HOUR_TIMES.length, 48);
  assert.equal(HALF_HOUR_TIMES[0], "00:00");
  assert.equal(HALF_HOUR_TIMES[1], "00:30");
  assert.equal(HALF_HOUR_TIMES[47], "23:30");
});

test("normalizeTime nhận HH:MM, H:MM, HH:MM:00 (Postgres) — sai thì null", () => {
  assert.equal(normalizeTime("8:30"), "08:30");
  assert.equal(normalizeTime("08:30:00"), "08:30");
  assert.equal(normalizeTime("24:00"), null);
  assert.equal(normalizeTime("08:60"), null);
  assert.equal(normalizeTime("08:30:15"), null);
  assert.equal(normalizeTime("abc"), null);
  assert.equal(normalizeTime(null), null);
});

test("isHalfHour chỉ đúng với :00 và :30", () => {
  for (const t of ["00:00", "08:30", "23:30", "8:00", "20:00:00"]) assert.equal(isHalfHour(t), true, t);
  for (const t of ["08:15", "08:10", "08:01", "8:5", "24:00", ""]) assert.equal(isHalfHour(t), false, t);
});

test("checkSlotTime: giờ lẻ → lỗi mốc 30 phút", () => {
  assert.deepEqual(checkSlotTime("08:15", []), { ok: false, error: HALF_HOUR_ERROR });
});

test("checkSlotTime: trùng khung khác (kể cả dạng HH:MM:SS) → lỗi trùng", () => {
  assert.deepEqual(checkSlotTime("08:30", ["08:30:00", "20:00:00"]), { ok: false, error: "Đã có khung giờ 08:30" });
});

test("checkSlotTime: hợp lệ → trả giờ đã chuẩn hoá", () => {
  assert.deepEqual(checkSlotTime("9:00", ["08:30:00", "08:15:00"]), { ok: true, time: "09:00" });
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd web && node --test tests/unit/slot-time.test.mjs`
Expected: FAIL — `Cannot find module '.../slot-time.js'`

- [ ] **Step 3: Viết code**

```js
// web/src/lib/reminders/slot-time.js
// Giờ nhắc (email + push) chỉ theo mốc :00/:30 — spec 2026-10-13 mục 9.
// Mốc 30 phút + không trùng ⇒ hai khung bất kỳ của một người cách nhau ≥ 30
// phút, không phải tính khoảng cách. Khung giờ lẻ cũ vẫn gửi bình thường; luật
// này chỉ chặn khi ĐẶT giờ mới.

export const HALF_HOUR_ERROR = "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)";

export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** "8:30" | "08:30" | "08:30:00" → "08:30"; sai định dạng → null. */
export function normalizeTime(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] ?? 0);
  if (h > 23 || min > 59 || sec !== 0) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function isHalfHour(value) {
  const t = normalizeTime(value);
  return t !== null && (t.endsWith(":00") || t.endsWith(":30"));
}

/** Giờ mới cho một khung: phải là mốc :00/:30 và không trùng `otherTimes`. */
export function checkSlotTime(value, otherTimes = []) {
  const time = normalizeTime(value);
  if (!time || !isHalfHour(time)) return { ok: false, error: HALF_HOUR_ERROR };
  if (otherTimes.map(normalizeTime).includes(time)) return { ok: false, error: `Đã có khung giờ ${time}` };
  return { ok: true, time };
}
```

- [ ] **Step 4: Chạy, thấy pass**

Run: `cd web && node --test tests/unit/slot-time.test.mjs`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reminders/slot-time.js web/tests/unit/slot-time.test.mjs
git commit -m "feat(reminders): luật giờ nhắc chỉ mốc :00/:30 — chặn đặt khung sát nhau (08:00 + 08:01 bị gửi dồn)"
```

---

### Task 2: Email-slots áp luật mốc 30 phút (`slot-guard.js`)

**Files:**
- Create: `web/src/lib/reminders/slot-guard.js`
- Modify: `web/src/app/api/email-slots/route.js` (POST + PUT)
- Test: `web/tests/unit/slot-guard.test.mjs`

**Interfaces:**
- Consumes: `checkSlotTime` (Task 1).
- Produces: `guardSlotTime(supabase, { table, userId, value, excludeId }) → Promise<{ ok: true, time } | { ok: false, status: 400|500, error }>`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/slot-guard.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { guardSlotTime } from "../../src/lib/reminders/slot-guard.js";

function fakeSupabase(rows, { error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(["from", table]);
      let data = rows;
      const q = {
        select: () => q,
        eq(col, val) { calls.push(["eq", col, val]); data = data.filter(r => r[col] === val); return q; },
        then: (resolve) => Promise.resolve({ data: error ? null : data, error }).then(resolve),
      };
      return q;
    },
  };
}

const rows = [
  { id: "s1", user_id: "u1", send_time: "08:15:00" }, // giờ lẻ cũ
  { id: "s2", user_id: "u1", send_time: "20:00:00" },
  { id: "x9", user_id: "u2", send_time: "09:00:00" }, // người khác — không tính
];

test("đúng bảng + lọc theo user", async () => {
  const sb = fakeSupabase(rows);
  await guardSlotTime(sb, { table: "push_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(sb.calls.slice(0, 2), [["from", "push_slots"], ["eq", "user_id", "u1"]]);
});

test("giờ của người khác không tính là trùng", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(r, { ok: true, time: "09:00" });
});

test("trùng khung khác của chính mình → 400", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "20:00" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.error, "Đã có khung giờ 20:00");
});

test("PUT lại đúng giờ của chính khung đó → hợp lệ (excludeId)", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "20:00", excludeId: "s2" });
  assert.deepEqual(r, { ok: true, time: "20:00" });
});

test("giờ lẻ → 400 lỗi mốc", async () => {
  const r = await guardSlotTime(fakeSupabase(rows), { table: "email_slots", userId: "u1", value: "08:45" });
  assert.equal(r.status, 400);
  assert.match(r.error, /giờ tròn hoặc rưỡi/);
});

test("DB lỗi → 500, không cho qua", async () => {
  const r = await guardSlotTime(fakeSupabase([], { error: { message: "boom" } }), { table: "email_slots", userId: "u1", value: "09:00" });
  assert.deepEqual(r, { ok: false, status: 500, error: "boom" });
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd web && node --test tests/unit/slot-guard.test.mjs`
Expected: FAIL — `Cannot find module '.../slot-guard.js'`

- [ ] **Step 3: Viết `slot-guard.js`**

```js
// web/src/lib/reminders/slot-guard.js
import { checkSlotTime } from "./slot-time.js";

/** Kiểm giờ mới của một khung (email_slots | push_slots) so với các khung
 * KHÁC của cùng người dùng. `excludeId` = khung đang sửa (không tự trùng).
 * `supabase` là client RLS của người dùng. */
export async function guardSlotTime(supabase, { table, userId, value, excludeId = null }) {
  const { data, error } = await supabase.from(table).select("id, send_time").eq("user_id", userId);
  if (error) return { ok: false, status: 500, error: error.message };
  const others = (data || []).filter((s) => s.id !== excludeId).map((s) => s.send_time);
  const r = checkSlotTime(value, others);
  return r.ok ? r : { ...r, status: 400 };
}
```

- [ ] **Step 4: Chạy, thấy pass**

Run: `cd web && node --test tests/unit/slot-guard.test.mjs`
Expected: PASS 6/6

- [ ] **Step 5: Sửa route `email-slots`**

Trong `web/src/app/api/email-slots/route.js` thêm import đầu file:

```js
import { guardSlotTime } from "@/lib/reminders/slot-guard";
```

Trong `POST`, thay khối từ `const { send_time } = await request.json();` tới hết khối insert bằng:

```js
  const { send_time } = await request.json();
  if (!send_time) return Response.json({ error: "Missing send_time" }, { status: 400 });
  const guard = await guardSlotTime(supabase, { table: "email_slots", userId: user.id, value: send_time });
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabase
    .from("email_slots")
    .insert({ user_id: user.id, send_time: guard.time, enabled: true })
    .select()
    .single();
```

Trong `PUT`, thay dòng `if (send_time !== undefined) update.send_time = send_time;` bằng:

```js
  if (send_time !== undefined) {
    const guard = await guardSlotTime(supabase, { table: "email_slots", userId: user.id, value: send_time, excludeId: id });
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
    update.send_time = guard.time;
  }
```

(`enabled` không đổi giờ → không kiểm: khung giờ lẻ cũ vẫn bật/tắt được — Review Focus #4.)

- [ ] **Step 6: Toàn bộ test + lint**

Run: `cd web && npm test && npx eslint src/lib/reminders src/app/api/email-slots/route.js`
Expected: mọi test PASS, eslint sạch.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/reminders/slot-guard.js web/tests/unit/slot-guard.test.mjs web/src/app/api/email-slots/route.js
git commit -m "feat(email): khung giờ email chỉ nhận mốc :00/:30 và không trùng — khung lẻ cũ vẫn bật/tắt được"
```

---

### Task 3: Migration push + mô phỏng `due_push_slots` + test RLS

**Files:**
- Modify: `web/src/lib/email/cron-schedule.js` (export 3 hàm)
- Create: `web/src/lib/push/due-push-slots-model.js`
- Create: `supabase/migrations/20261014000100_push_notifications.sql`
- Test: `web/tests/unit/due-push-slots-model.test.mjs`, `web/tests/rls/push-rls.test.mjs`

**Interfaces:**
- Produces (JS): `duePushSlotsModel({ slots, preferences, profiles, devices, logs, now, catchupMinutes = 30 }) → [{ slot_id, user_id, send_date: "YYYY-MM-DD" }]`.
- Produces (SQL): bảng `push_devices`, `push_preferences`, `push_slots`, `push_log`; `register_push_device(p_token text, p_platform text, p_app_version text) → void` (authenticated); `due_push_slots(p_now timestamptz, p_catchup_minutes int) → TABLE(slot_id uuid, user_id uuid, send_date date)` (service_role); `cleanup_push_data(p_log_days int, p_device_days int, p_limit int) → jsonb {logs, devices}` (service_role); `suggestion_log.source` nhận `'push'`.

- [ ] **Step 1: Export helper trong `cron-schedule.js`**

Đổi `function safeTimezone`, `function localParts`, `function isScheduledDay` thành `export function ...` (không đổi thân hàm). Chạy `cd web && node --test tests/unit/cron-schedule.test.mjs` → vẫn PASS.

- [ ] **Step 2: Viết test fail cho mô phỏng**

```js
// web/tests/unit/due-push-slots-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { duePushSlotsModel } from "../../src/lib/push/due-push-slots-model.js";

const base = (over = {}) => ({
  slots: [{ id: "s1", user_id: "u1", send_time: "20:00:00", enabled: true }],
  preferences: [{ user_id: "u1", enabled: true, frequency: "daily", custom_days: [1, 2, 3, 4, 5] }],
  profiles: [{ id: "u1", timezone: "Asia/Ho_Chi_Minh" }],
  devices: [{ user_id: "u1" }],
  logs: [],
  ...over,
});
// 13:00Z = 20:00 VN (UTC+7). 13/10/2026 là thứ Ba.
const at = (iso) => new Date(iso);

test("đúng giờ → tới hạn, send_date theo giờ địa phương", () => {
  assert.deepEqual(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:00:00Z") }),
    [{ slot_id: "s1", user_id: "u1", send_date: "2026-10-13" }]);
});

test("trễ 29 phút vẫn gửi bù; 30 phút thì thôi; sớm 1 phút chưa gửi", () => {
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:29:00Z") }).length, 1);
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T13:30:00Z") }).length, 0);
  assert.equal(duePushSlotsModel({ ...base(), now: at("2026-10-13T12:59:00Z") }).length, 0);
});

test("23:30 + cron 00:05 hôm sau → gửi bù, send_date = hôm qua (Review Focus #3)", () => {
  const d = base({ slots: [{ id: "s1", user_id: "u1", send_time: "23:30:00", enabled: true }] });
  // 17:05Z 13/10 = 00:05 VN 14/10
  assert.deepEqual(duePushSlotsModel({ ...d, now: at("2026-10-13T17:05:00Z") }),
    [{ slot_id: "s1", user_id: "u1", send_date: "2026-10-13" }]);
});

test("qua nửa đêm xét thứ của HÔM QUA: hẹn 23:30 thứ Sáu, weekdays, cron 00:05 thứ Bảy → vẫn gửi", () => {
  const d = base({
    slots: [{ id: "s1", user_id: "u1", send_time: "23:30:00", enabled: true }],
    preferences: [{ user_id: "u1", enabled: true, frequency: "weekdays", custom_days: [] }],
  });
  // 16/10/2026 thứ Sáu; 17:05Z 16/10 = 00:05 VN thứ Bảy 17/10
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-16T17:05:00Z") })[0]?.send_date, "2026-10-16");
});

test("đã có push_log cùng (slot, ngày) → bỏ", () => {
  const d = base({ logs: [{ slot_id: "s1", send_date: "2026-10-13" }] });
  assert.equal(duePushSlotsModel({ ...d, now: at("2026-10-13T13:05:00Z") }).length, 0);
});

test("không có thiết bị / tắt push / tắt slot → bỏ", () => {
  const now = at("2026-10-13T13:00:00Z");
  assert.equal(duePushSlotsModel({ ...base({ devices: [] }), now }).length, 0);
  assert.equal(duePushSlotsModel({ ...base({ preferences: [{ user_id: "u1", enabled: false, frequency: "daily", custom_days: [] }] }), now }).length, 0);
  assert.equal(duePushSlotsModel({ ...base({ slots: [{ id: "s1", user_id: "u1", send_time: "20:00:00", enabled: false }] }), now }).length, 0);
});

test("custom_days: 0=CN … 6=T7", () => {
  const d = (days) => base({ preferences: [{ user_id: "u1", enabled: true, frequency: "custom", custom_days: days }] });
  const now = at("2026-10-13T13:00:00Z"); // thứ Ba = 2
  assert.equal(duePushSlotsModel({ ...d([2]), now }).length, 1);
  assert.equal(duePushSlotsModel({ ...d([1, 3]), now }).length, 0);
});

test("múi giờ khác: Kolkata (+5:30), New York (đổi giờ mùa hè), sai/null → VN", () => {
  const tz = (timezone) => base({ profiles: [{ id: "u1", timezone }] });
  // 14:30Z = 20:00 Kolkata
  assert.equal(duePushSlotsModel({ ...tz("Asia/Kolkata"), now: at("2026-10-13T14:30:00Z") }).length, 1);
  // 13/10 New York đang EDT (UTC-4): 20:00 = 00:00Z 14/10
  assert.deepEqual(duePushSlotsModel({ ...tz("America/New_York"), now: at("2026-10-14T00:00:00Z") })[0]?.send_date, "2026-10-13");
  assert.equal(duePushSlotsModel({ ...tz("Mars/Olympus"), now: at("2026-10-13T13:00:00Z") }).length, 1);
  assert.equal(duePushSlotsModel({ ...tz(null), now: at("2026-10-13T13:00:00Z") }).length, 1);
});
```

- [ ] **Step 3: Chạy, thấy fail**

Run: `cd web && node --test tests/unit/due-push-slots-model.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 4: Viết mô phỏng**

```js
// web/src/lib/push/due-push-slots-model.js
// Bản JS của hàm SQL due_push_slots (migration 20261014000100) — để test mọi
// máy (không cần Postgres) và để test RLS đối chiếu kết quả với hàm SQL thật.
// Sửa một bên phải sửa cả bên kia.
import { safeTimezone, localParts, isScheduledDay } from "../email/cron-schedule.js";

export function duePushSlotsModel({ slots, preferences, profiles, devices, logs, now, catchupMinutes = 30 }) {
  const prefBy = new Map(preferences.filter((p) => p.enabled).map((p) => [p.user_id, p]));
  const tzBy = new Map(profiles.map((p) => [p.id, p.timezone]));
  const hasDevice = new Set(devices.map((d) => d.user_id));
  const logged = new Set(logs.map((l) => `${l.slot_id}|${l.send_date}`));
  const out = [];

  for (const s of slots) {
    if (!s.enabled || !hasDevice.has(s.user_id)) continue;
    const pref = prefBy.get(s.user_id);
    if (!pref) continue;
    const local = localParts(now, safeTimezone(tzBy.get(s.user_id)));
    const [h, m] = s.send_time.split(":").map(Number);
    const nowMin = local.hour * 60 + local.minute + local.second / 60;

    // Hôm nay, hoặc hôm qua khi cửa sổ bù vắt qua nửa đêm (hẹn 23:30, giờ 00:05)
    for (const back of [0, 1]) {
      const late = nowMin + back * 1440 - (h * 60 + m);
      if (late < 0 || late >= catchupMinutes) continue;
      const day = new Date(Date.UTC(local.year, local.month, local.day - back));
      const sendDate = day.toISOString().slice(0, 10);
      if (!isScheduledDay(pref.frequency, pref.custom_days, day.getUTCDay())) continue;
      if (logged.has(`${s.id}|${sendDate}`)) continue;
      out.push({ slot_id: s.id, user_id: s.user_id, send_date: sendDate });
    }
  }
  return out;
}
```

- [ ] **Step 5: Chạy, thấy pass**

Run: `cd web && node --test tests/unit/due-push-slots-model.test.mjs`
Expected: PASS 8/8

- [ ] **Step 6: Viết migration**

```sql
-- supabase/migrations/20261014000100_push_notifications.sql
-- Push notification nhắc ôn từ (spec 2026-10-13). Mọi bảng bật RLS, mọi FK
-- tới auth.users ON DELETE CASCADE (xoá tài khoản tự dọn sạch).

BEGIN;

CREATE TABLE public.push_devices (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  platform    text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  app_version text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_devices_user_idx ON public.push_devices (user_id);
CREATE INDEX push_devices_updated_idx ON public.push_devices (updated_at);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
-- Không có policy INSERT/UPDATE: chỉ ghi qua register_push_device (chống chiếm/rò token)
CREATE POLICY push_devices_select_own ON public.push_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY push_devices_delete_own ON public.push_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.push_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT false,
  frequency   text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekdays', 'custom')),
  custom_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_preferences_own ON public.push_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.push_slots (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  send_time  time NOT NULL CHECK (EXTRACT(minute FROM send_time) IN (0, 30) AND EXTRACT(second FROM send_time) = 0),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, send_time)
);
ALTER TABLE public.push_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_slots_own ON public.push_slots FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.push_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slot_id    uuid NOT NULL REFERENCES public.push_slots(id) ON DELETE CASCADE,
  send_date  date NOT NULL,
  status     text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  entry_ids  jsonb,
  devices    integer,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, send_date) -- giành quyền gửi: hai lượt cron chồng nhau chỉ một lượt INSERT được
);
CREATE INDEX push_log_created_idx ON public.push_log (created_at);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY; -- không policy: chỉ service role

ALTER TABLE public.suggestion_log DROP CONSTRAINT suggestion_log_source_check;
ALTER TABLE public.suggestion_log ADD CONSTRAINT suggestion_log_source_check
  CHECK (source IN ('email', 'widget', 'push'));

-- Token thuộc về người đăng ký GẦN NHẤT: A đăng xuất lỗi, B đăng nhập cùng máy
-- → token chuyển sang B, thông báo của A không hiện trên máy B.
CREATE FUNCTION public.register_push_device(p_token text, p_platform text, p_app_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9:_-]{100,4096}$' THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'invalid platform'; END IF;
  INSERT INTO push_devices (user_id, token, platform, app_version)
  VALUES (auth.uid(), p_token, p_platform, left(p_app_version, 32))
  ON CONFLICT (token) DO UPDATE
    SET user_id = auth.uid(), platform = EXCLUDED.platform,
        app_version = EXCLUDED.app_version, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated;

-- Slot cần gửi ngay bây giờ — bản JS: web/src/lib/push/due-push-slots-model.js
CREATE FUNCTION public.due_push_slots(p_now timestamptz DEFAULT now(), p_catchup_minutes int DEFAULT 30)
RETURNS TABLE (slot_id uuid, user_id uuid, send_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  WITH zones AS MATERIALIZED (SELECT name FROM pg_timezone_names),
  cand AS (
    SELECT s.id AS slot_id, s.user_id, s.send_time, pp.frequency, pp.custom_days,
           (p_now AT TIME ZONE COALESCE(z.name, 'Asia/Ho_Chi_Minh')) AS local_now
    FROM push_slots s
    JOIN push_preferences pp ON pp.user_id = s.user_id AND pp.enabled
    LEFT JOIN profiles pr ON pr.id = s.user_id
    LEFT JOIN zones z ON z.name = pr.timezone
    WHERE s.enabled
      AND EXISTS (SELECT 1 FROM push_devices d WHERE d.user_id = s.user_id)
  ),
  sched AS (
    SELECT c.slot_id, c.user_id, c.frequency, c.custom_days, c.local_now,
           v.d AS send_date, (v.d + c.send_time) AS local_due
    FROM cand c
    CROSS JOIN LATERAL (VALUES (c.local_now::date), (c.local_now::date - 1)) AS v(d)
  )
  SELECT sc.slot_id, sc.user_id, sc.send_date
  FROM sched sc
  WHERE sc.local_now >= sc.local_due
    AND sc.local_now < sc.local_due + make_interval(mins => p_catchup_minutes)
    AND (sc.frequency = 'daily'
         OR (sc.frequency = 'weekdays' AND EXTRACT(dow FROM sc.send_date) BETWEEN 1 AND 5)
         OR (sc.frequency = 'custom' AND EXTRACT(dow FROM sc.send_date)::int = ANY (sc.custom_days)))
    AND NOT EXISTS (SELECT 1 FROM push_log pl WHERE pl.slot_id = sc.slot_id AND pl.send_date = sc.send_date)
  ORDER BY (sc.local_now - sc.local_due) DESC, sc.slot_id;  -- trễ nhất gửi trước
$$;
REVOKE ALL ON FUNCTION public.due_push_slots(timestamptz, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_push_slots(timestamptz, int) TO service_role;

-- Dọn dần, giới hạn mỗi lượt để không khoá bảng lâu
CREATE FUNCTION public.cleanup_push_data(p_log_days int DEFAULT 30, p_device_days int DEFAULT 270, p_limit int DEFAULT 5000)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_logs int; v_devices int;
BEGIN
  DELETE FROM push_log WHERE id IN (
    SELECT id FROM push_log WHERE created_at < now() - make_interval(days => p_log_days) LIMIT p_limit);
  GET DIAGNOSTICS v_logs = ROW_COUNT;
  DELETE FROM push_devices WHERE id IN (
    SELECT id FROM push_devices WHERE updated_at < now() - make_interval(days => p_device_days) LIMIT p_limit);
  GET DIAGNOSTICS v_devices = ROW_COUNT;
  RETURN jsonb_build_object('logs', v_logs, 'devices', v_devices);
END $$;
REVOKE ALL ON FUNCTION public.cleanup_push_data(int, int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_push_data(int, int, int) TO service_role;

COMMIT;
```

Trước khi chạy: xác nhận tên ràng buộc thật — `grep -n "source" supabase/migrations/20261010000100_suggestion_log.sql` (ràng buộc inline → Postgres đặt tên `suggestion_log_source_check`). Trên Supabase local kiểm: `psql "$DB_URL" -c "\d public.suggestion_log"`.

- [ ] **Step 7: Áp migration lên Supabase LOCAL**

Run (gốc repo): `npx supabase migration up` (chỉ local — **không** chạy lên production ở task này).
Expected: `Applying migration 20261014000100_push_notifications.sql...` không lỗi.

- [ ] **Step 8: Viết test RLS (fail trước khi có migration, pass sau)**

```js
// web/tests/rls/push-rls.test.mjs
// Cô lập dữ liệu push giữa người dùng + hàm SQL due_push_slots khớp bản JS.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { skipReason, createTestUser, cleanupUsers, adminClient } from "../helpers/supabase-test-client.mjs";
import { duePushSlotsModel } from "../../src/lib/push/due-push-slots-model.js";

const skip = skipReason();
const token = (c) => `${c}`.repeat(140); // 140 ký tự hợp lệ

describe("Push: RLS + hàm SQL", { skip: skip ? `Bỏ qua: ${skip}` : false }, () => {
  let a, b;
  const admin = adminClient();
  before(async () => { a = await createTestUser("pushA"); b = await createTestUser("pushB"); });
  after(() => cleanupUsers(a, b));

  test("không INSERT thẳng push_devices được (chỉ qua RPC)", async () => {
    const { error } = await a.client.from("push_devices").insert({ user_id: a.id, token: token("a") });
    assert.ok(error, "RLS phải chặn");
  });

  test("register_push_device: token sai định dạng bị từ chối", async () => {
    const { error } = await a.client.rpc("register_push_device", { p_token: "ngan", p_platform: "ios", p_app_version: "1.0" });
    assert.ok(error);
  });

  test("B đăng ký token của A → token chuyển sang B, A không còn (Review Focus #5)", async () => {
    const t = token("x");
    assert.ok(!(await a.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: "1.0 (16)" })).error);
    assert.ok(!(await b.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: "1.0 (16)" })).error);
    const { data: rows } = await admin.from("push_devices").select("user_id").eq("token", t);
    assert.deepEqual(rows.map((r) => r.user_id), [b.id]);
    const { data: seenByA } = await a.client.from("push_devices").select("id");
    assert.deepEqual(seenByA, []);
  });

  test("B không đọc/xoá được thiết bị của A", async () => {
    const t = token("y");
    await a.client.rpc("register_push_device", { p_token: t, p_platform: "ios", p_app_version: null });
    const { data: seen } = await b.client.from("push_devices").select("id").eq("token", t);
    assert.deepEqual(seen, []);
    await b.client.from("push_devices").delete().eq("token", t);
    const { data: still } = await admin.from("push_devices").select("id").eq("token", t);
    assert.equal(still.length, 1);
  });

  test("push_preferences / push_slots: của ai nấy thấy, không ghi hộ", async () => {
    assert.ok(!(await a.client.from("push_preferences").upsert({ user_id: a.id, enabled: true })).error);
    assert.ok((await b.client.from("push_preferences").upsert({ user_id: a.id, enabled: false })).error);
    assert.ok(!(await a.client.from("push_slots").insert({ user_id: a.id, send_time: "20:00" })).error);
    assert.ok((await b.client.from("push_slots").insert({ user_id: a.id, send_time: "21:00" })).error);
    assert.deepEqual((await b.client.from("push_slots").select("id").eq("user_id", a.id)).data, []);
  });

  test("push_slots: DB từ chối giờ lẻ và giờ trùng", async () => {
    assert.ok((await a.client.from("push_slots").insert({ user_id: a.id, send_time: "08:15" })).error);
    assert.ok((await a.client.from("push_slots").insert({ user_id: a.id, send_time: "20:00" })).error, "trùng 20:00");
  });

  test("push_log: người dùng không đọc được, không gọi được hàm cron", async () => {
    assert.deepEqual((await a.client.from("push_log").select("id")).data, []);
    assert.ok((await a.client.rpc("due_push_slots", {})).error);
    assert.ok((await a.client.rpc("cleanup_push_data", {})).error);
  });

  test("due_push_slots (SQL) khớp duePushSlotsModel (JS) — gồm ca qua nửa đêm", async () => {
    await admin.from("profiles").update({ timezone: "Asia/Ho_Chi_Minh" }).eq("id", a.id);
    await admin.from("push_slots").insert({ user_id: a.id, send_time: "23:30" });
    await admin.from("push_devices").delete().eq("user_id", a.id);
    await a.client.rpc("register_push_device", { p_token: token("z"), p_platform: "ios", p_app_version: null });
    for (const iso of ["2026-10-13T13:00:00Z", "2026-10-13T13:29:00Z", "2026-10-13T13:30:00Z", "2026-10-13T17:05:00Z"]) {
      const { data: sql, error } = await admin.rpc("due_push_slots", { p_now: iso, p_catchup_minutes: 30 });
      assert.ok(!error, error?.message);
      const [slots, preferences, profiles, devices, logs] = await Promise.all([
        admin.from("push_slots").select("id, user_id, send_time, enabled").eq("user_id", a.id),
        admin.from("push_preferences").select("user_id, enabled, frequency, custom_days").eq("user_id", a.id),
        admin.from("profiles").select("id, timezone").eq("id", a.id),
        admin.from("push_devices").select("user_id").eq("user_id", a.id),
        admin.from("push_log").select("slot_id, send_date").eq("user_id", a.id),
      ]);
      const js = duePushSlotsModel({ slots: slots.data, preferences: preferences.data, profiles: profiles.data,
        devices: devices.data, logs: logs.data, now: new Date(iso) });
      const mine = sql.filter((r) => r.user_id === a.id);
      const key = (r) => `${r.slot_id}|${r.send_date}`;
      assert.deepEqual(mine.map(key).sort(), js.map(key).sort(), iso);
    }
  });

  test("push_log unique (slot_id, send_date) chặn giành quyền lần 2", async () => {
    const { data: slot } = await admin.from("push_slots").select("id").eq("user_id", a.id).limit(1).single();
    const row = { user_id: a.id, slot_id: slot.id, send_date: "2026-10-13", status: "sending" };
    assert.ok(!(await admin.from("push_log").insert(row)).error);
    const dup = await admin.from("push_log").insert(row);
    assert.equal(dup.error?.code, "23505");
  });

  test("xoá user → dữ liệu push sạch (cascade)", async () => {
    const c = await createTestUser("pushC");
    await c.client.rpc("register_push_device", { p_token: token("c"), p_platform: "ios", p_app_version: null });
    await c.client.from("push_preferences").upsert({ user_id: c.id, enabled: true });
    await c.client.from("push_slots").insert({ user_id: c.id, send_time: "07:00" });
    await admin.auth.admin.deleteUser(c.id);
    for (const t of ["push_devices", "push_preferences", "push_slots"]) {
      const { data } = await admin.from(t).select("user_id").eq("user_id", c.id);
      assert.deepEqual(data, [], t);
    }
  });
});
```

- [ ] **Step 9: Chạy RLS — xác nhận pass (và fail nếu revert migration)**

Run: `cd web && npm run test:rls`
Expected: `push-rls` PASS 10/10, các file RLS cũ vẫn PASS. Để chứng minh test bắt lỗi: tạm `npx supabase migration down` (hoặc `db reset` về trước) → chạy lại → fail; rồi `migration up` lại.

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/email/cron-schedule.js web/src/lib/push/due-push-slots-model.js web/tests/unit/due-push-slots-model.test.mjs supabase/migrations/20261014000100_push_notifications.sql web/tests/rls/push-rls.test.mjs
git commit -m "feat(push): bảng + RLS + hàm chọn slot tới giờ trong Postgres — token thuộc người đăng ký gần nhất để không rò thông báo chéo, chỉ trả slot cần gửi thay vì kéo cả bảng mỗi 5 phút"
```

---

### Task 4: Message FCM + deep link (`build-message.js`)

**Files:**
- Create: `web/src/lib/push/build-message.js`
- Test: `web/tests/unit/push-build-message.test.mjs`

**Interfaces:**
- Produces: `pushLink({ id, word, meaning, fromBank }) → string`, `truncate(text, max = 150) → string`, `buildPushMessage({ token, word: { id, word, meaning, fromBank }, now }) → object` (message FCM v1).

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/push-build-message.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { pushLink, truncate, buildPushMessage } from "../../src/lib/push/build-message.js";

test("link từ đã lưu: id thô, bank=0", () => {
  assert.equal(pushLink({ id: "abc-1", word: "resilient", meaning: "kiên cường", fromBank: false }),
    "wordly://word?id=abc-1&w=resilient&m=ki%C3%AAn%20c%C6%B0%E1%BB%9Dng&bank=0");
});

test("link từ kho: id có tiền tố bank-, bank=1", () => {
  assert.match(pushLink({ id: 42, word: "go", meaning: "đi", fromBank: true }), /^wordly:\/\/word\?id=bank-42&w=go&m=.*&bank=1$/);
});

test("ký tự đặc biệt mã hoá %XX, không dùng + cho dấu cách (Review Focus #1)", () => {
  const link = pushLink({ id: "1", word: "make up", meaning: "a+b & c # d", fromBank: false });
  assert.ok(link.includes("w=make%20up"));
  assert.ok(link.includes("m=a%2Bb%20%26%20c%20%23%20d"));
  assert.ok(!link.includes("+"));
});

test("truncate theo ký tự (không cắt đôi emoji), thêm …", () => {
  assert.equal(truncate("ngắn"), "ngắn");
  const long = "á".repeat(200);
  const t = truncate(long);
  assert.equal(Array.from(t).length, 150);
  assert.ok(t.endsWith("…"));
  assert.equal(truncate("😀".repeat(151)).endsWith("…"), true);
});

test("message: title = từ, body = nghĩa, header APNs, data.link chuỗi", () => {
  const now = new Date("2026-10-13T13:00:00Z");
  const m = buildPushMessage({ token: "T", word: { id: "1", word: "resilient", meaning: "kiên cường", fromBank: false }, now });
  assert.equal(m.token, "T");
  assert.equal(m.apns.payload.aps.alert.title, "resilient");
  assert.equal(m.apns.payload.aps.alert.body, "kiên cường");
  assert.equal(m.apns.payload.aps.sound, "default");
  assert.equal(m.apns.payload.aps["thread-id"], "wordly-review");
  assert.equal(m.apns.headers["apns-push-type"], "alert");
  assert.equal(m.apns.headers["apns-priority"], "10");
  assert.equal(m.apns.headers["apns-expiration"], String(Math.floor(now.getTime() / 1000) + 3600));
  assert.equal(typeof m.data.link, "string");
  assert.equal(m.android, undefined);
});

test("nghĩa rỗng → body mặc định, vẫn có link", () => {
  const m = buildPushMessage({ token: "T", word: { id: "1", word: "x", meaning: "  ", fromBank: false }, now: new Date() });
  assert.equal(m.apns.payload.aps.alert.body, "Chạm để ôn lại từ này");
});
```

- [ ] **Step 2: Chạy, thấy fail**

Run: `cd web && node --test tests/unit/push-build-message.test.mjs` → FAIL `Cannot find module`.

- [ ] **Step 3: Viết code**

```js
// web/src/lib/push/build-message.js
// Từ → message FCM HTTP v1 (chỉ khối apns — chưa có Android).
// Link khớp WidgetDeepLink của iOS: wordly://word?id=…&w=…&m=…&bank=0|1.
// Dùng encodeURIComponent, KHÔNG dùng URLSearchParams: nó mã hoá dấu cách
// thành "+", còn URLComponents của Swift đọc "+" là dấu cộng thật.

const MAX_BODY = 150;
const EXPIRY_SECONDS = 3600; // máy tắt quá 1 giờ thì bỏ — nhắc trễ vô nghĩa
const EMPTY_BODY = "Chạm để ôn lại từ này";

export function pushLink({ id, word, meaning, fromBank }) {
  const linkId = fromBank ? `bank-${id}` : String(id);
  const enc = encodeURIComponent;
  return `wordly://word?id=${enc(linkId)}&w=${enc(word)}&m=${enc(meaning ?? "")}&bank=${fromBank ? 1 : 0}`;
}

export function truncate(text, max = MAX_BODY) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max - 1).join("").trimEnd() + "…";
}

export function buildPushMessage({ token, word, now = new Date() }) {
  const meaning = (word.meaning || "").trim();
  return {
    token,
    data: { link: pushLink({ ...word, meaning }) },
    apns: {
      headers: {
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(now.getTime() / 1000) + EXPIRY_SECONDS),
      },
      payload: {
        aps: {
          alert: { title: word.word, body: truncate(meaning || EMPTY_BODY) },
          sound: "default",
          "thread-id": "wordly-review",
        },
      },
    },
  };
}
```

Lưu ý: `truncate` với chuỗi đúng 150 ký tự sau cắt: `slice(0,149)` + "…" = 150 ✓ (test kiểm `"á".repeat(200)`).

- [ ] **Step 4: Chạy, thấy pass** — `node --test tests/unit/push-build-message.test.mjs` → PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/push/build-message.js web/tests/unit/push-build-message.test.mjs
git commit -m "feat(push): dựng message FCM + deep link đúng định dạng widget — mã hoá %20 để Swift đọc đúng từ có dấu cách/dấu +"
```

---

### Task 5: Access token Google + cấu hình FCM

**Files:**
- Create: `web/src/lib/push/google-access-token.js`, `web/src/lib/push/fcm-config.js`
- Modify: `web/.env.example`
- Test: `web/tests/unit/push-google-token.test.mjs`

**Interfaces:**
- Produces: `createGoogleTokenProvider({ serviceAccount: { client_email, private_key }, fetchImpl, clock }) → { get(): Promise<string>, invalidate(): void }`; `loadFcmConfig(env = process.env) → { projectId, serviceAccount } | null` (thiếu biến → `null`; biến hỏng → throw).

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/push-google-token.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { importSPKI, jwtVerify } from "jose";
import { createGoogleTokenProvider } from "../../src/lib/push/google-access-token.js";
import { loadFcmConfig } from "../../src/lib/push/fcm-config.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const sa = { client_email: "push@wordly.iam.gserviceaccount.com", private_key: privateKey, project_id: "wordly-123" };

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { ok: r.status === 200, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}

test("ký JWT RS256 đúng iss/aud/scope rồi đổi lấy access token", async () => {
  const fetchImpl = fakeFetch([{ status: 200, body: { access_token: "AT1", expires_in: 3600 } }]);
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl });
  assert.equal(await p.get(), "AT1");
  const { url, body } = fetchImpl.calls[0];
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const { payload, protectedHeader } = await jwtVerify(body.get("assertion"), await importSPKI(publicKey, "RS256"), {
    issuer: sa.client_email, audience: "https://oauth2.googleapis.com/token",
  });
  assert.equal(protectedHeader.alg, "RS256");
  assert.equal(payload.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assert.equal(payload.exp - payload.iat, 3600);
});

test("cache tới 5 phút trước hạn, sau đó xin mới; invalidate xin mới ngay", async () => {
  let now = 1_000_000;
  const fetchImpl = fakeFetch([
    { status: 200, body: { access_token: "AT1", expires_in: 3600 } },
    { status: 200, body: { access_token: "AT2", expires_in: 3600 } },
    { status: 200, body: { access_token: "AT3", expires_in: 3600 } },
  ]);
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl, clock: () => now });
  assert.equal(await p.get(), "AT1");
  now += 54 * 60 * 1000;
  assert.equal(await p.get(), "AT1");
  now += 2 * 60 * 1000; // còn < 5 phút
  assert.equal(await p.get(), "AT2");
  p.invalidate();
  assert.equal(await p.get(), "AT3");
  assert.equal(fetchImpl.calls.length, 3);
});

test("Google từ chối → throw có mã lỗi", async () => {
  const p = createGoogleTokenProvider({ serviceAccount: sa, fetchImpl: fakeFetch([{ status: 400, body: { error: "invalid_grant" } }]) });
  await assert.rejects(() => p.get(), /400 invalid_grant/);
});

test("loadFcmConfig: thiếu biến → null; đủ → projectId (env ưu tiên hơn JSON); hỏng → throw", () => {
  assert.equal(loadFcmConfig({}), null);
  const b64 = Buffer.from(JSON.stringify(sa)).toString("base64");
  assert.equal(loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: b64 }).projectId, "wordly-123");
  assert.equal(loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: b64, FCM_PROJECT_ID: "khac" }).projectId, "khac");
  assert.throws(() => loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: "bm90LWpzb24=" }), /FCM_SERVICE_ACCOUNT_BASE64/);
  const missing = Buffer.from(JSON.stringify({ project_id: "p" })).toString("base64");
  assert.throws(() => loadFcmConfig({ FCM_SERVICE_ACCOUNT_BASE64: missing }), /client_email/);
});
```

- [ ] **Step 2: Chạy, thấy fail** — `node --test tests/unit/push-google-token.test.mjs` → FAIL `Cannot find module`.

- [ ] **Step 3: Viết code**

```js
// web/src/lib/push/google-access-token.js
// Service account → access token OAuth2 của Google cho FCM HTTP v1.
// Token sống 1 giờ; cache tới 5 phút trước khi hết hạn. Dùng jose (đã có),
// không thêm google-auth-library / firebase-admin.
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const EARLY_REFRESH_MS = 5 * 60 * 1000;

export function createGoogleTokenProvider({ serviceAccount, fetchImpl = fetch, clock = () => Date.now() }) {
  let cached = null;
  let expiresAt = 0;

  return {
    async get() {
      if (cached && clock() < expiresAt - EARLY_REFRESH_MS) return cached;
      const key = await importPKCS8(serviceAccount.private_key, "RS256");
      const iat = Math.floor(clock() / 1000);
      const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(serviceAccount.client_email)
        .setAudience(TOKEN_URL)
        .setIssuedAt(iat)
        .setExpirationTime(iat + 3600)
        .sign(key);
      const res = await fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) throw new Error(`google token: ${res.status} ${data.error || ""}`.trim());
      cached = data.access_token;
      expiresAt = clock() + (data.expires_in || 3600) * 1000;
      return cached;
    },
    invalidate() {
      cached = null;
      expiresAt = 0;
    },
  };
}
```

```js
// web/src/lib/push/fcm-config.js
// Thiếu biến → null (push tắt, email không ảnh hưởng). Biến có nhưng hỏng →
// throw để lỗi cấu hình hiện rõ trong log cron, không im lặng.
export function loadFcmConfig(env = process.env) {
  const raw = env.FCM_SERVICE_ACCOUNT_BASE64;
  if (!raw) return null;
  let sa;
  try {
    sa = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_BASE64 không phải JSON service account hợp lệ");
  }
  if (!sa.client_email || !sa.private_key) throw new Error("Service account FCM thiếu client_email/private_key");
  const projectId = env.FCM_PROJECT_ID || sa.project_id;
  if (!projectId) throw new Error("Thiếu FCM_PROJECT_ID");
  return { projectId, serviceAccount: sa };
}
```

Thêm vào cuối `web/.env.example`:

```
# ── Push notification (Firebase Cloud Messaging) ─────────────────────────────
# Service account chỉ quyền "Firebase Cloud Messaging API Admin".
# base64 của CẢ file JSON: base64 -i service-account.json | tr -d '\n'
FCM_PROJECT_ID=wordly-xxxxx
FCM_SERVICE_ACCOUNT_BASE64=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 4: Chạy, thấy pass** — PASS 4/4.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/push/google-access-token.js web/src/lib/push/fcm-config.js web/tests/unit/push-google-token.test.mjs web/.env.example
git commit -m "feat(push): access token Google từ service account bằng jose — không kéo firebase-admin vào image"
```

---

### Task 6: Gọi FCM + phân loại lỗi (`fcm-client.js`)

**Files:**
- Create: `web/src/lib/push/fcm-client.js`
- Test: `web/tests/unit/push-fcm-client.test.mjs`

**Interfaces:**
- Produces: `sendFcmMessage({ projectId, accessToken, message, fetchImpl }) → Promise<{ ok, status, code, message }>`; `isDeadToken(result) → boolean`; `isFatal(result) → boolean`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/push-fcm-client.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { sendFcmMessage, isDeadToken, isFatal } from "../../src/lib/push/fcm-client.js";

const fcmError = (status, httpStatus, errorCode, message = "") => ({
  ok: false, status: httpStatus,
  json: async () => ({ error: { code: httpStatus, status, message,
    details: errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : [] } }),
});

test("gửi đúng URL, Bearer, body { message }", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ name: "x" }) }; };
  const r = await sendFcmMessage({ projectId: "p1", accessToken: "AT", message: { token: "T" }, fetchImpl });
  assert.deepEqual(r, { ok: true, status: 200, code: null, message: "" });
  assert.equal(seen.url, "https://fcm.googleapis.com/v1/projects/p1/messages:send");
  assert.equal(seen.init.headers.Authorization, "Bearer AT");
  assert.deepEqual(JSON.parse(seen.init.body), { message: { token: "T" } });
});

test("lấy errorCode trong details, rơi về error.status", async () => {
  const r1 = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => fcmError("NOT_FOUND", 404, "UNREGISTERED") });
  assert.equal(r1.code, "UNREGISTERED");
  const r2 = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => fcmError("UNAUTHENTICATED", 401, null) });
  assert.equal(r2.code, "UNAUTHENTICATED");
  assert.equal(r2.status, 401);
});

test("lỗi mạng → code NETWORK, không throw", async () => {
  const r = await sendFcmMessage({ projectId: "p", accessToken: "a", message: {}, fetchImpl: async () => { throw new Error("ECONNRESET"); } });
  assert.equal(r.code, "NETWORK");
  assert.equal(r.ok, false);
});

test("token chết: UNREGISTERED, SENDER_ID_MISMATCH, INVALID_ARGUMENT nói về registration token", () => {
  assert.equal(isDeadToken({ code: "UNREGISTERED" }), true);
  assert.equal(isDeadToken({ code: "SENDER_ID_MISMATCH", status: 403 }), true);
  assert.equal(isDeadToken({ code: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" }), true);
});

test("INVALID_ARGUMENT do payload sai KHÔNG phải token chết (Review Focus #2)", () => {
  assert.equal(isDeadToken({ code: "INVALID_ARGUMENT", message: "Invalid value at 'message.apns.headers'" }), false);
  assert.equal(isDeadToken({ code: "QUOTA_EXCEEDED" }), false);
  assert.equal(isDeadToken({ code: "UNAVAILABLE" }), false);
});

test("lỗi nặng dừng cả lượt: THIRD_PARTY_AUTH_ERROR, 401, 403 không phải SENDER_ID_MISMATCH", () => {
  assert.equal(isFatal({ code: "THIRD_PARTY_AUTH_ERROR", status: 401 }), true);
  assert.equal(isFatal({ code: "UNAUTHENTICATED", status: 401 }), true);
  assert.equal(isFatal({ code: "PERMISSION_DENIED", status: 403 }), true);
  assert.equal(isFatal({ code: "SENDER_ID_MISMATCH", status: 403 }), false);
  assert.equal(isFatal({ code: "UNAVAILABLE", status: 503 }), false);
  assert.equal(isFatal({ code: "QUOTA_EXCEEDED", status: 429 }), false);
});
```

- [ ] **Step 2: Chạy, thấy fail** — FAIL `Cannot find module`.

- [ ] **Step 3: Viết code**

```js
// web/src/lib/push/fcm-client.js
// FCM HTTP v1: POST /v1/projects/<id>/messages:send — một request mỗi thiết bị.
// Không throw: mọi lỗi trả về { ok:false, status, code, message } để lượt cron
// quyết định xoá token / dừng lượt / bỏ qua.

export async function sendFcmMessage({ projectId, accessToken, message, fetchImpl = fetch }) {
  let res;
  try {
    res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    return { ok: false, status: 0, code: "NETWORK", message: e.message };
  }
  if (res.ok) return { ok: true, status: res.status, code: null, message: "" };
  const body = await res.json().catch(() => ({}));
  const err = body.error || {};
  const fcmCode = (err.details || []).find((d) => d.errorCode)?.errorCode;
  return { ok: false, status: res.status, code: fcmCode || err.status || `HTTP_${res.status}`, message: err.message || "" };
}

/** Token không còn dùng được → xoá khỏi push_devices. INVALID_ARGUMENT chỉ
 * tính khi Google nói rõ là token — payload sai mà xoá token thì một lỗi code
 * sẽ xoá sạch thiết bị của mọi người. */
export function isDeadToken(r) {
  if (r.code === "UNREGISTERED" || r.code === "SENDER_ID_MISMATCH") return true;
  return r.code === "INVALID_ARGUMENT" && /registration token/i.test(r.message || "");
}

/** Lỗi cấu hình (service account, key APNs trên Firebase) → dừng cả lượt. */
export function isFatal(r) {
  if (r.code === "THIRD_PARTY_AUTH_ERROR" || r.status === 401) return true;
  return r.status === 403 && r.code !== "SENDER_ID_MISMATCH";
}
```

- [ ] **Step 4: Chạy, thấy pass** — PASS 6/6.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/push/fcm-client.js web/tests/unit/push-fcm-client.test.mjs
git commit -m "feat(push): client FCM v1 + phân loại lỗi — chỉ xoá token khi Google nói rõ token hỏng, lỗi cấu hình thì dừng lượt"
```

---

### Task 7: Pool song song có hạn thời gian (`run-pool.js`)

**Files:**
- Create: `web/src/lib/push/run-pool.js`
- Test: `web/tests/unit/push-run-pool.test.mjs`

**Interfaces:**
- Produces: `runPool(items, worker, { concurrency = 20, budgetMs = 240000, clock, shouldStop }) → Promise<{ completed, failed, deferred, errors: string[] }>`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/push-run-pool.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runPool } from "../../src/lib/push/run-pool.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("không quá N việc cùng lúc, chạy hết", async () => {
  let running = 0, peak = 0;
  const r = await runPool(Array.from({ length: 50 }, (_, i) => i), async () => {
    running++; peak = Math.max(peak, running); await sleep(2); running--;
  }, { concurrency: 5 });
  assert.equal(peak, 5);
  assert.deepEqual({ completed: r.completed, failed: r.failed, deferred: r.deferred }, { completed: 50, failed: 0, deferred: 0 });
});

test("một việc lỗi không dừng việc khác; đếm failed + giữ tối đa 5 lỗi", async () => {
  const r = await runPool([1, 2, 3, 4, 5, 6, 7], async (i) => { if (i % 2) throw new Error(`e${i}`); }, { concurrency: 2 });
  assert.equal(r.completed, 3);
  assert.equal(r.failed, 4);
  assert.equal(r.errors.length, 4);
});

test("hết hạn thời gian → không nhận việc mới, đếm deferred", async () => {
  let now = 0;
  const r = await runPool([1, 2, 3, 4], async () => { now += 100; }, { concurrency: 1, budgetMs: 250, clock: () => now });
  assert.equal(r.completed, 3);
  assert.equal(r.deferred, 1);
});

test("shouldStop → dừng nhận việc mới", async () => {
  let stop = false;
  const r = await runPool([1, 2, 3, 4], async (i) => { if (i === 2) stop = true; }, { concurrency: 1, shouldStop: () => stop });
  assert.equal(r.completed, 2);
  assert.equal(r.deferred, 2);
});

test("danh sách rỗng", async () => {
  assert.deepEqual(await runPool([], async () => {}), { completed: 0, failed: 0, deferred: 0, errors: [] });
});
```

- [ ] **Step 2: Chạy, thấy fail** — FAIL `Cannot find module`.

- [ ] **Step 3: Viết code**

```js
// web/src/lib/push/run-pool.js
// Chạy `worker` cho từng item, tối đa `concurrency` việc cùng lúc. Quá
// `budgetMs` hoặc `shouldStop()` → không nhận việc mới (việc đang chạy chạy
// nốt); phần còn lại đếm `deferred` — lượt cron sau gửi bù (cửa sổ 30 phút).

export async function runPool(items, worker, {
  concurrency = 20,
  budgetMs = 240_000,
  clock = () => Date.now(),
  shouldStop = () => false,
} = {}) {
  const start = clock();
  let next = 0;
  let completed = 0;
  let failed = 0;
  const errors = [];

  async function lane() {
    while (next < items.length) {
      if (shouldStop() || clock() - start >= budgetMs) return;
      const item = items[next++];
      try {
        await worker(item);
        completed++;
      } catch (e) {
        failed++;
        if (errors.length < 5) errors.push(e?.message || String(e));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return { completed, failed, deferred: items.length - completed - failed, errors };
}
```

- [ ] **Step 4: Chạy, thấy pass** — PASS 5/5.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/push/run-pool.js web/tests/unit/push-run-pool.test.mjs
git commit -m "feat(push): pool song song có hạn thời gian — giờ cao điểm 20:00 ~5.000 người gửi tuần tự mất ~35 phút"
```

---

### Task 8: Lượt gửi push (`cron-send-push.js`)

**Files:**
- Create: `web/src/lib/push/cron-send-push.js`
- Test: `web/tests/unit/cron-send-push.test.mjs`

**Interfaces:**
- Consumes: `buildPushMessage` (T4), `createGoogleTokenProvider`, `loadFcmConfig` (T5), `sendFcmMessage`, `isDeadToken`, `isFatal` (T6), `runPool` (T7), `selectEmailContent`, `selectBankWords` (có sẵn), RPC `due_push_slots`, `cleanup_push_data` (T3).
- Produces: `runDuePushSends(supabase, now = new Date(), deps = {}) → Promise<{ disabled: true } | { due, sent, skipped, failed, claimed_elsewhere, tokens_removed, deferred, fatal, errors, cleaned, duration_ms }>`. `deps`: `{ config, tokenProvider, send, selectContent, selectBank, concurrency, budgetMs }`. Hằng `CATCHUP_MINUTES = 30`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/cron-send-push.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runDuePushSends } from "../../src/lib/push/cron-send-push.js";

// Supabase giả đủ dùng cho cron: from(t).select/eq/gte/insert/update/delete + rpc.
function fakeDb({ due = [], devices = [], pushLog = [] } = {}) {
  const db = { push_devices: [...devices], push_log: [...pushLog], suggestion_log: [] };
  const rpcCalls = [];
  const filtersMatch = (row, filters) => filters.every(([c, v]) => row[c] === v);
  function from(table) {
    const filters = [];
    let op = "select", payload = null;
    const q = {
      select: () => q,
      gte: () => q,
      eq(c, v) { filters.push([c, v]); return q; },
      insert(row) { op = "insert"; payload = row; return q; },
      update(row) { op = "update"; payload = row; return q; },
      delete() { op = "delete"; return q; },
      then(resolve) {
        const rows = db[table] || [];
        let result = { data: null, error: null };
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          if (table === "push_log" && list.some((r) => rows.some((x) => x.slot_id === r.slot_id && x.send_date === r.send_date))) {
            result = { data: null, error: { code: "23505", message: "duplicate key" } };
          } else rows.push(...list);
        } else if (op === "update") {
          rows.filter((r) => filtersMatch(r, filters)).forEach((r) => Object.assign(r, payload));
        } else if (op === "delete") {
          db[table] = rows.filter((r) => !filtersMatch(r, filters));
        } else {
          result = { data: rows.filter((r) => filtersMatch(r, filters)), error: null };
        }
        return Promise.resolve(result).then(resolve);
      },
    };
    return q;
  }
  return {
    db, rpcCalls, from,
    rpc(name, args) {
      rpcCalls.push([name, args]);
      if (name === "due_push_slots") return Promise.resolve({ data: due, error: null });
      if (name === "cleanup_push_data") return Promise.resolve({ data: { logs: 0, devices: 0 }, error: null });
      return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
    },
  };
}

const config = { projectId: "p", serviceAccount: {} };
const tokenProvider = () => { let n = 0; return { get: async () => `AT${n}`, invalidate: () => { n++; } }; };
const ownWord = async () => ({ words: [{ id: "w1", word: "resilient", meaning_vi: "kiên cường", step: "due" }], journal: null });
const noWord = async () => null;
const bankWord = async () => [{ id: 7, word: "go", meaning_vi: "đi", step: "bank" }];
const okSend = () => { const sent = []; const fn = async (a) => { sent.push(a); return { ok: true, status: 200, code: null }; }; fn.sent = sent; return fn; };
const slot = (i, user = `u${i}`) => ({ slot_id: `s${i}`, user_id: user, send_date: "2026-10-13" });
const now = new Date("2026-10-13T13:00:00Z");

test("thiếu cấu hình FCM → disabled, không gọi DB", async () => {
  const sb = fakeDb();
  assert.deepEqual(await runDuePushSends(sb, now, { config: null }), { disabled: true });
  assert.equal(sb.rpcCalls.length, 0);
});

test("gửi tới mọi thiết bị, log sent + suggestion_log source=push", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }, { id: "d2", user_id: "u1", token: "T2" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord, selectBank: bankWord });
  assert.equal(r.sent, 1);
  assert.deepEqual(send.sent.map((s) => s.message.token), ["T1", "T2"]);
  assert.equal(sb.db.push_log[0].status, "sent");
  assert.equal(sb.db.push_log[0].devices, 2);
  assert.deepEqual(sb.db.suggestion_log, [{ user_id: "u1", source: "push", entry_type: "translate_history", entry_id: "w1" }]);
  assert.deepEqual(sb.rpcCalls[0], ["due_push_slots", { p_now: now.toISOString(), p_catchup_minutes: 30 }]);
  assert.equal(sb.rpcCalls.at(-1)[0], "cleanup_push_data");
});

test("hết từ riêng → dùng từ kho, link bank", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: noWord, selectBank: bankWord });
  assert.match(send.sent[0].message.data.link, /id=bank-7/);
  assert.deepEqual(sb.db.suggestion_log[0], { user_id: "u1", source: "push", entry_type: "bank", bank_word_id: 7 });
});

test("hết cả từ riêng lẫn kho → skipped, không gửi", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: noWord, selectBank: async () => [] });
  assert.equal(r.skipped, 1);
  assert.equal(send.sent.length, 0);
  assert.equal(sb.db.push_log[0].status, "skipped");
});

test("slot đã có lượt khác giành (unique) → bỏ, không gửi trùng", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }], pushLog: [{ slot_id: "s1", send_date: "2026-10-13", status: "sending" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord });
  assert.equal(r.claimed_elsewhere, 1);
  assert.equal(send.sent.length, 0);
});

test("hai lượt cron chạy song song chỉ gửi một lần", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const send = okSend();
  const deps = { config, tokenProvider: tokenProvider(), send, selectContent: ownWord };
  await Promise.all([runDuePushSends(sb, now, deps), runDuePushSends(sb, now, deps)]);
  assert.equal(send.sent.length, 1);
});

test("chỉ gửi tới thiết bị CỦA người có slot (token đã chuyển chủ thì thôi) — Review Focus #5", async () => {
  const sb = fakeDb({ due: [slot(1, "uA")], devices: [{ id: "d1", user_id: "uB", token: "T-shared" }] });
  const send = okSend();
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord });
  assert.equal(send.sent.length, 0);
  assert.equal(r.skipped, 1);
});

test("token chết bị xoá; INVALID_ARGUMENT do payload thì giữ", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }, { id: "d2", user_id: "u1", token: "T2" }] });
  const send = async ({ message }) => message.token === "T1"
    ? { ok: false, status: 404, code: "UNREGISTERED", message: "" }
    : { ok: false, status: 400, code: "INVALID_ARGUMENT", message: "Invalid value at 'message.apns'" };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord });
  assert.equal(r.tokens_removed, 1);
  assert.deepEqual(sb.db.push_devices.map((d) => d.id), ["d2"]);
  assert.equal(sb.db.push_log[0].status, "failed");
});

test("401 → làm mới access token, thử lại 1 lần", async () => {
  const sb = fakeDb({ due: [slot(1)], devices: [{ id: "d1", user_id: "u1", token: "T1" }] });
  const tokens = [];
  const send = async ({ accessToken }) => { tokens.push(accessToken); return tokens.length === 1 ? { ok: false, status: 401, code: "UNAUTHENTICATED" } : { ok: true, status: 200 }; };
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord });
  assert.deepEqual(tokens, ["AT0", "AT1"]);
  assert.equal(r.sent, 1);
});

test("lỗi cấu hình (THIRD_PARTY_AUTH_ERROR) → dừng lượt, slot sau để lượt sau", async () => {
  const due = [slot(1), slot(2), slot(3)];
  const devices = due.map((s, i) => ({ id: `d${i}`, user_id: s.user_id, token: `T${i}` }));
  const sb = fakeDb({ due, devices });
  const send = async () => ({ ok: false, status: 401, code: "THIRD_PARTY_AUTH_ERROR" });
  const r = await runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send, selectContent: ownWord, concurrency: 1 });
  assert.equal(r.fatal, "THIRD_PARTY_AUTH_ERROR");
  assert.equal(r.deferred, 2);
  assert.equal(sb.db.push_log.length, 1, "slot chưa giành quyền thì chưa có log → lượt sau gửi bù");
});

test("due_push_slots lỗi → throw (route ghi lỗi, email vẫn chạy)", async () => {
  const sb = fakeDb();
  sb.rpc = async () => ({ data: null, error: { message: "boom" } });
  await assert.rejects(() => runDuePushSends(sb, now, { config, tokenProvider: tokenProvider(), send: okSend() }), /due_push_slots: boom/);
});
```

- [ ] **Step 2: Chạy, thấy fail** — FAIL `Cannot find module`.

- [ ] **Step 3: Viết code**

```js
// web/src/lib/push/cron-send-push.js
// Lượt gửi push — cron VPS gọi qua /api/cron/send-emails mỗi 5 phút (spec
// 2026-10-13). Postgres chọn slot tới giờ (due_push_slots, cửa sổ bù 30 phút),
// mỗi slot GIÀNH QUYỀN bằng INSERT push_log unique (slot_id, send_date) trước
// khi gửi → hai lượt chạy chồng không gửi đôi. Chạy song song qua runPool.
import { selectEmailContent, selectBankWords } from "../email/select-word-for-email.js";
import { buildPushMessage } from "./build-message.js";
import { sendFcmMessage, isDeadToken, isFatal } from "./fcm-client.js";
import { createGoogleTokenProvider } from "./google-access-token.js";
import { loadFcmConfig } from "./fcm-config.js";
import { runPool } from "./run-pool.js";

export const CATCHUP_MINUTES = 30;
const RECENT_DAYS = 3;

// Access token sống 1 giờ — giữ giữa các lượt cron trong cùng container.
let sharedProvider = null;
function defaultProvider(config) {
  sharedProvider ??= createGoogleTokenProvider({ serviceAccount: config.serviceAccount });
  return sharedProvider;
}

/** Một từ cho người dùng: từ đã lưu cần ôn (thuật toán email), tránh từ đã
 * gợi ý 3 ngày qua; không có thì lấy từ kho. Không có gì → null. */
async function pickWord(supabase, userId, now, { selectContent, selectBank }) {
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("suggestion_log").select("entry_id, bank_word_id").eq("user_id", userId).gte("shown_at", since);
  const recentEntryIds = (recent || []).map((r) => r.entry_id).filter(Boolean);
  const recentBankIds = (recent || []).map((r) => r.bank_word_id).filter(Boolean);

  const picked = await selectContent(supabase, userId, { lastEntryIds: recentEntryIds });
  const own = picked?.words?.[0];
  if (own) return { id: own.id, word: own.word, meaning: own.meaning_vi || "", fromBank: false };

  const [bank] = await selectBank(supabase, userId, { count: 1, recentIds: recentBankIds }).catch(() => []);
  return bank ? { id: bank.id, word: bank.word, meaning: bank.meaning_vi || "", fromBank: true } : null;
}

export async function runDuePushSends(supabase, now = new Date(), deps = {}) {
  const started = Date.now();
  const config = "config" in deps ? deps.config : loadFcmConfig();
  if (!config) return { disabled: true };

  const provider = deps.tokenProvider || defaultProvider(config);
  const send = deps.send || sendFcmMessage;
  const selectors = {
    selectContent: deps.selectContent || selectEmailContent,
    selectBank: deps.selectBank || selectBankWords,
  };

  const { data: due, error } = await supabase.rpc("due_push_slots", {
    p_now: now.toISOString(), p_catchup_minutes: CATCHUP_MINUTES,
  });
  if (error) throw new Error(`due_push_slots: ${error.message}`);

  const stats = { due: due.length, sent: 0, skipped: 0, failed: 0, claimed_elsewhere: 0, tokens_removed: 0 };
  let fatal = null;

  async function deliver(message) {
    const call = async () => send({ projectId: config.projectId, accessToken: await provider.get(), message });
    let r = await call();
    if (r.status === 401 && r.code !== "THIRD_PARTY_AUTH_ERROR") {
      provider.invalidate();
      r = await call();
    }
    return r;
  }

  async function handle({ slot_id, user_id, send_date }) {
    const claim = await supabase.from("push_log").insert({ slot_id, user_id, send_date, status: "sending" });
    if (claim.error) {
      if (claim.error.code === "23505") { stats.claimed_elsewhere++; return; }
      throw new Error(`push_log claim: ${claim.error.message}`);
    }
    const finish = (fields) => supabase.from("push_log").update(fields).eq("slot_id", slot_id).eq("send_date", send_date);

    // Đọc thiết bị ĐÚNG LÚC gửi — token đã chuyển sang người khác thì không còn ở đây
    const { data: devices } = await supabase.from("push_devices").select("id, token").eq("user_id", user_id);
    if (!devices?.length) { stats.skipped++; await finish({ status: "skipped", error: "no devices" }); return; }

    const word = await pickWord(supabase, user_id, now, selectors);
    if (!word) { stats.skipped++; await finish({ status: "skipped", error: "Nothing to send — both queues empty" }); return; }

    let delivered = 0;
    let lastError = null;
    for (const d of devices) {
      if (fatal) break;
      const r = await deliver(buildPushMessage({ token: d.token, word, now }));
      if (r.ok) { delivered++; continue; }
      lastError = r.code;
      if (isDeadToken(r)) {
        await supabase.from("push_devices").delete().eq("id", d.id);
        stats.tokens_removed++;
      } else if (isFatal(r)) {
        fatal = r.code;
      }
    }

    await finish({ status: delivered ? "sent" : "failed", devices: delivered, entry_ids: [word.id], error: delivered ? null : lastError });
    if (!delivered) { stats.failed++; return; }
    stats.sent++;
    const row = word.fromBank
      ? { user_id, source: "push", entry_type: "bank", bank_word_id: word.id }
      : { user_id, source: "push", entry_type: "translate_history", entry_id: word.id };
    const { error: logError } = await supabase.from("suggestion_log").insert(row);
    if (logError) console.error(`[cron-send-push] suggestion_log (không fatal): ${logError.message}`);
  }

  const pool = await runPool(due, handle, {
    concurrency: deps.concurrency ?? 20,
    budgetMs: deps.budgetMs ?? 240_000,
    shouldStop: () => fatal !== null,
  });
  const { data: cleaned } = await supabase.rpc("cleanup_push_data", { p_log_days: 30, p_device_days: 270, p_limit: 5000 });

  return {
    ...stats,
    failed: stats.failed + pool.failed,
    deferred: pool.deferred,
    fatal,
    errors: pool.errors,
    cleaned: cleaned ?? null,
    duration_ms: Date.now() - started,
  };
}
```

- [ ] **Step 4: Chạy, thấy pass** — `node --test tests/unit/cron-send-push.test.mjs` → PASS 11/11.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/push/cron-send-push.js web/tests/unit/cron-send-push.test.mjs
git commit -m "feat(push): lượt gửi push — giành quyền trước khi gửi (không gửi đôi), 1 từ/thông báo, dọn token chết + log cũ"
```

---

### Task 9: Route cron chạy email + push độc lập

**Files:**
- Create: `web/src/lib/reminders/run-reminder-cron.js`
- Modify: `web/src/app/api/cron/send-emails/route.js`
- Test: `web/tests/unit/run-reminder-cron.test.mjs`

**Interfaces:**
- Produces: `runReminderCron(jobs: { [name]: () => Promise<any> }) → Promise<{ [name]: result | { error } }>`.

- [ ] **Step 1: Viết test fail**

```js
// web/tests/unit/run-reminder-cron.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { runReminderCron } from "../../src/lib/reminders/run-reminder-cron.js";

test("email lỗi vẫn chạy push và ngược lại", async () => {
  assert.deepEqual(
    await runReminderCron({ email: async () => { throw new Error("smtp"); }, push: async () => ({ sent: 3 }) }),
    { email: { error: "smtp" }, push: { sent: 3 } });
  assert.deepEqual(
    await runReminderCron({ email: async () => ({ checked: 8 }), push: async () => { throw new Error("fcm"); } }),
    { email: { checked: 8 }, push: { error: "fcm" } });
});

test("chạy song song, không đợi lần lượt", async () => {
  const t0 = Date.now();
  const wait = () => new Promise((r) => setTimeout(() => r("ok"), 50));
  await runReminderCron({ email: wait, push: wait });
  assert.ok(Date.now() - t0 < 95);
});
```

- [ ] **Step 2: Chạy, thấy fail** — FAIL `Cannot find module`.

- [ ] **Step 3: Viết code + sửa route**

```js
// web/src/lib/reminders/run-reminder-cron.js
// Email và push chạy song song trong cùng lượt cron; lỗi bên này không chặn
// bên kia (spec 2026-10-13 mục 2). Phản hồi: { email: …, push: … }.
export async function runReminderCron(jobs) {
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(names.map((n) => jobs[n]()));
  return Object.fromEntries(names.map((n, i) => [n, settled[i].status === "fulfilled"
    ? settled[i].value
    : { error: settled[i].reason?.message || String(settled[i].reason) }]));
}
```

Thay toàn bộ `web/src/app/api/cron/send-emails/route.js` bằng:

```js
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCronSecret } from "@/lib/auth/validate-cron-secret";
import { runDueEmailSends } from "@/lib/email/cron-send-emails";
import { runDuePushSends } from "@/lib/push/cron-send-push";
import { runReminderCron } from "@/lib/reminders/run-reminder-cron";

// Cron VPS gọi endpoint này mỗi 5 phút (xem infra/vps/README.md) — chạy cả
// email (src/lib/email/cron-send-emails.js) và push (src/lib/push/cron-send-push.js).
// Giữ đường dẫn cũ để không phải sửa crontab trên VPS.
export async function POST(request) {
  const authHeader = request.headers.get("authorization");
  if (!validateCronSecret(authHeader)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const result = await runReminderCron({
    email: () => runDueEmailSends(supabase),
    push: () => runDuePushSends(supabase),
  });
  return Response.json(result);
}
```

Cập nhật lý do trong `web/tests/unit/admin-client-usage.test.mjs`: `"cron/send-emails/route.js": "cron hệ thống (email + push), không có người dùng đăng nhập",`.

Cập nhật `infra/vps/README.md` dòng mô tả `send-emails-cron.sh`: thêm "— chạy cả email và push (`web/src/lib/push/cron-send-push.js`), phản hồi `{ email, push }`".

- [ ] **Step 4: Chạy, thấy pass** — `npm test` → mọi test PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reminders/run-reminder-cron.js web/tests/unit/run-reminder-cron.test.mjs web/src/app/api/cron/send-emails/route.js web/tests/unit/admin-client-usage.test.mjs infra/vps/README.md
git commit -m "feat(push): cron 5 phút chạy cả email và push song song — giữ đường dẫn cũ để không sửa crontab VPS, lỗi bên này không chặn bên kia"
```

---

### Task 10: API push cho iOS (devices, preferences, slots)

**Files:**
- Create: `web/src/lib/push/validate.js`, `web/src/app/api/push/devices/route.js`, `web/src/app/api/push/preferences/route.js`, `web/src/app/api/push/slots/route.js`
- Test: `web/tests/unit/push-validate.test.mjs`

**Interfaces:**
- Consumes: `guardSlotTime` (T2), `checkRateLimitDb`, `rateLimitResponse`, `createClient`, `createSharedClient`, `getUserFast`.
- Produces (HTTP, hợp đồng với iOS):
  - `POST /api/push/devices` body `{ token, platform, app_version }` → `{ success: true }`; `DELETE /api/push/devices` body `{ token }` → `{ success: true }`.
  - `GET /api/push/preferences` → `{ preferences: { enabled, frequency, custom_days } | null }`; `PUT` cùng body → `{ preferences }` (bật lần đầu mà chưa có khung → tạo `20:00`).
  - `GET /api/push/slots` → `{ slots: [{ id, send_time, enabled }] }`; `POST { send_time }` → `{ slot }`; `PUT { id, send_time?, enabled? }` → `{ success: true }`; `DELETE ?id=` → `{ success: true }` (giữ ≥ 1).
  - JS: `validateDeviceBody(body) → { ok, value | error }`, `validatePreferencesBody(body) → { ok, value | error }`, `DEFAULT_PUSH_TIME = "20:00"`, `MAX_PUSH_SLOTS = 10`.

- [ ] **Step 1: Viết test fail cho validate**

```js
// web/tests/unit/push-validate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { validateDeviceBody, validatePreferencesBody } from "../../src/lib/push/validate.js";

const tok = "a".repeat(120) + ":APA91b_-x";

test("device: token FCM hợp lệ, platform mặc định ios", () => {
  assert.deepEqual(validateDeviceBody({ token: tok, app_version: "1.0.0 (16)" }),
    { ok: true, value: { token: tok, platform: "ios", app_version: "1.0.0 (16)" } });
});

test("device: token ngắn/ký tự lạ/không phải chuỗi → lỗi", () => {
  for (const token of ["abc", "a".repeat(99), "a".repeat(120) + " x", "a".repeat(120) + "<", 123, null]) {
    assert.equal(validateDeviceBody({ token }).ok, false, String(token));
  }
});

test("device: platform lạ, app_version quá dài → lỗi", () => {
  assert.equal(validateDeviceBody({ token: tok, platform: "web" }).ok, false);
  assert.equal(validateDeviceBody({ token: tok, app_version: "x".repeat(33) }).ok, false);
  assert.equal(validateDeviceBody(null).ok, false);
});

test("preferences: hợp lệ → custom_days bỏ trùng + sắp xếp", () => {
  assert.deepEqual(validatePreferencesBody({ enabled: true, frequency: "custom", custom_days: [5, 1, 1] }),
    { ok: true, value: { enabled: true, frequency: "custom", custom_days: [1, 5] } });
});

test("preferences: sai kiểu → lỗi", () => {
  assert.equal(validatePreferencesBody({ enabled: "yes", frequency: "daily", custom_days: [1] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "hourly", custom_days: [1] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [7] }).ok, false);
  assert.equal(validatePreferencesBody({ enabled: true, frequency: "daily", custom_days: [1.5] }).ok, false);
});
```

- [ ] **Step 2: Chạy, thấy fail** — FAIL `Cannot find module`.

- [ ] **Step 3: Viết `validate.js`**

```js
// web/src/lib/push/validate.js
// Validate body các route /api/push/* (ranh giới tin cậy với app).
export const DEFAULT_PUSH_TIME = "20:00";
export const MAX_PUSH_SLOTS = 10;
const TOKEN_RE = /^[A-Za-z0-9:_-]{100,4096}$/;
const FREQUENCIES = ["daily", "weekdays", "custom"];

export function validateDeviceBody(body) {
  const { token, platform = "ios", app_version = null } = body || {};
  if (typeof token !== "string" || !TOKEN_RE.test(token)) return { ok: false, error: "Token không hợp lệ" };
  if (!["ios", "android"].includes(platform)) return { ok: false, error: "platform không hợp lệ" };
  if (app_version !== null && (typeof app_version !== "string" || app_version.length > 32)) {
    return { ok: false, error: "app_version không hợp lệ" };
  }
  return { ok: true, value: { token, platform, app_version } };
}

export function validatePreferencesBody(body) {
  const { enabled, frequency, custom_days } = body || {};
  if (typeof enabled !== "boolean") return { ok: false, error: "enabled phải là true/false" };
  if (!FREQUENCIES.includes(frequency)) return { ok: false, error: "frequency không hợp lệ" };
  if (!Array.isArray(custom_days) || custom_days.length === 0 || custom_days.length > 7
      || !custom_days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    return { ok: false, error: "custom_days không hợp lệ" };
  }
  return { ok: true, value: { enabled, frequency, custom_days: [...new Set(custom_days)].sort((a, b) => a - b) } };
}
```

- [ ] **Step 4: Chạy, thấy pass** — PASS 5/5.

- [ ] **Step 5: Viết 3 route**

```js
// web/src/app/api/push/devices/route.js
// Đăng ký / huỷ FCM token của máy. Ghi qua RPC register_push_device (token
// chuyển sang người đăng ký gần nhất — chống rò thông báo chéo người dùng).
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { validateDeviceBody } from "@/lib/push/validate";

async function limited(userId) {
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-devices", clientKey: userId, limit: 10, windowMs: 60_000 });
  return rl.allowed ? null : rateLimitResponse(rl);
}

export async function POST(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await limited(user.id);
  if (blocked) return blocked;

  const v = validateDeviceBody(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_device", {
    p_token: v.value.token, p_platform: v.value.platform, p_app_version: v.value.app_version,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await limited(user.id);
  if (blocked) return blocked;

  const { token } = (await request.json().catch(() => null)) || {};
  if (typeof token !== "string" || !token) return Response.json({ error: "Missing token" }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from("push_devices").delete().eq("token", token).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
```

```js
// web/src/app/api/push/preferences/route.js
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { validatePreferencesBody, DEFAULT_PUSH_TIME } from "@/lib/push/validate";

const FIELDS = "enabled, frequency, custom_days";

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_preferences").select(FIELDS).eq("user_id", user.id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ preferences: data ?? null });
}

export async function PUT(request) {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-settings", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const v = validatePreferencesBody(await request.json().catch(() => null));
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.from("push_preferences")
    .upsert({ user_id: user.id, ...v.value, updated_at: new Date().toISOString() })
    .select(FIELDS).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Bật lần đầu mà chưa có khung nào → tạo 20:00 (như email tạo 08:00)
  if (v.value.enabled) {
    const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!count) await supabase.from("push_slots").insert({ user_id: user.id, send_time: DEFAULT_PUSH_TIME });
  }
  return Response.json({ preferences: data });
}
```

```js
// web/src/app/api/push/slots/route.js
// Như /api/email-slots, nhưng giờ chỉ mốc :00/:30 (DB cũng chặn bằng CHECK + UNIQUE).
import { createClient } from "@/lib/supabase/server";
import { createSharedClient } from "@/lib/supabase/shared";
import { getUserFast } from "@/lib/auth/get-user-fast";
import { checkRateLimitDb } from "@/lib/security/rate-limit-db";
import { rateLimitResponse } from "@/lib/security/rate-limit";
import { guardSlotTime } from "@/lib/reminders/slot-guard";
import { MAX_PUSH_SLOTS } from "@/lib/push/validate";

async function authed() {
  const user = await getUserFast();
  if (!user) return { res: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const rl = await checkRateLimitDb({ supabase: createSharedClient(), scope: "push-settings", clientKey: user.id, limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return { res: rateLimitResponse(rl) };
  return { user, supabase: await createClient() };
}

export async function GET() {
  const user = await getUserFast();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase.from("push_slots").select("id, send_time, enabled")
    .eq("user_id", user.id).order("send_time", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slots: data || [] });
}

export async function POST(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count >= MAX_PUSH_SLOTS) return Response.json({ error: `Tối đa ${MAX_PUSH_SLOTS} khung giờ` }, { status: 400 });

  const { send_time } = (await request.json().catch(() => null)) || {};
  const guard = await guardSlotTime(supabase, { table: "push_slots", userId: user.id, value: send_time });
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { data, error } = await supabase.from("push_slots")
    .insert({ user_id: user.id, send_time: guard.time, enabled: true }).select("id, send_time, enabled").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ slot: data });
}

export async function PUT(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const { id, send_time, enabled } = (await request.json().catch(() => null)) || {};
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const update = {};
  if (send_time !== undefined) {
    const guard = await guardSlotTime(supabase, { table: "push_slots", userId: user.id, value: send_time, excludeId: id });
    if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });
    update.send_time = guard.time;
  }
  if (enabled !== undefined) update.enabled = Boolean(enabled);

  const { error } = await supabase.from("push_slots").update(update).eq("id", id).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request) {
  const { user, supabase, res } = await authed();
  if (res) return res;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const { count } = await supabase.from("push_slots").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if (count <= 1) return Response.json({ error: "Phải có ít nhất 1 khung giờ" }, { status: 400 });
  await supabase.from("push_slots").delete().eq("id", id).eq("user_id", user.id);
  return Response.json({ success: true });
}
```

Route mới mặc định protected (không thêm vào `PUBLIC_API_PATHS`). Kiểm tên export thật trước khi dùng: `grep -n "export" web/src/lib/supabase/shared.js web/src/lib/security/rate-limit.js`.

- [ ] **Step 6: Kiểm chứng**

Run: `cd web && npm test && npx eslint src/app/api/push src/lib/push src/lib/reminders && npx next build`
Expected: test PASS (gồm `admin-client-usage` — route push không dùng admin), eslint sạch, build "Compiled successfully".

Smoke trên local (Supabase local + `npm run dev` với cổng từ `hf-port`), Bearer JWT của user test:
- `POST /api/push/slots {"send_time":"08:15"}` → 400 giờ tròn hoặc rưỡi; `{"send_time":"08:30"}` → 200; lặp lại → 400 "Đã có khung giờ 08:30".
- `PUT /api/push/preferences {"enabled":true,"frequency":"daily","custom_days":[1,2,3,4,5]}` với user chưa có khung → `GET /api/push/slots` có `20:00:00`.
- Không Bearer → 401.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/push/validate.js web/tests/unit/push-validate.test.mjs web/src/app/api/push
git commit -m "feat(push): API cho iOS — đăng ký token qua RPC, cài đặt + khung giờ push (mốc 30 phút), rate limit chống app lỗi gọi lặp"
```

---

### Task 11: Script đo tải 10.000 người

**Files:**
- Create: `web/scripts/push-load-seed.sql`, `web/scripts/push-load-check.mjs`

**Interfaces:**
- Consumes: `runDuePushSends` (T8) với `send`/`selectContent` giả có độ trễ.

- [ ] **Step 1: Viết seed SQL (chỉ chạy trên Supabase LOCAL)**

```sql
-- web/scripts/push-load-seed.sql — CHỈ Supabase local. Tạo 10.000 user giả
-- (email loadtest+N@wordly.local), mỗi người 1 thiết bị + push bật + khung 20:00.
-- Dọn: DELETE FROM auth.users WHERE email LIKE 'loadtest+%@wordly.local';
INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'loadtest+' || g || '@wordly.local', now(), now()
FROM generate_series(1, 10000) g;

INSERT INTO public.push_devices (user_id, token)
SELECT id, 'load' || replace(id::text, '-', '') || repeat('x', 80) FROM auth.users WHERE email LIKE 'loadtest+%';
INSERT INTO public.push_preferences (user_id, enabled) SELECT id, true FROM auth.users WHERE email LIKE 'loadtest+%';
INSERT INTO public.push_slots (user_id, send_time) SELECT id, '20:00' FROM auth.users WHERE email LIKE 'loadtest+%';
UPDATE public.profiles SET timezone = 'Asia/Ho_Chi_Minh' WHERE id IN (SELECT id FROM auth.users WHERE email LIKE 'loadtest+%');
```

(Nếu trigger `handle_new_user` đã tạo `profiles` thì `UPDATE` có tác dụng; nếu không, bỏ qua — múi giờ thiếu rơi về VN.)

- [ ] **Step 2: Viết script đo**

```js
// web/scripts/push-load-check.mjs — đo lượt push với 10k người cùng hẹn 20:00.
// CHỈ chạy với Supabase local (đọc web/.env.test.local). Không gọi FCM thật:
// send giả trễ 150 ms, chọn từ giả trễ 300 ms (ước lượng production).
// Chạy: cd web && node scripts/push-load-check.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { runDuePushSends } from "../src/lib/push/cron-send-push.js";

const env = Object.fromEntries(readFileSync(new URL("../.env.test.local", import.meta.url), "utf8")
  .split("\n").map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
if (!/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error("Chỉ chạy với Supabase local");
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = new Date(); // đặt giờ máy hoặc truyền mốc 20:00 VN: new Date("2026-10-13T13:00:00Z")
const at = process.argv[2] ? new Date(process.argv[2]) : now;

let t = Date.now();
const { data: due, error } = await supabase.rpc("due_push_slots", { p_now: at.toISOString(), p_catchup_minutes: 30 });
if (error) throw error;
console.log(`due_push_slots: ${due.length} slot trong ${Date.now() - t} ms (mục tiêu < 500 ms)`);

t = Date.now();
const result = await runDuePushSends(supabase, at, {
  config: { projectId: "load", serviceAccount: {} },
  tokenProvider: { get: async () => "AT", invalidate() {} },
  send: async () => { await sleep(150); return { ok: true, status: 200, code: null }; },
  selectContent: async () => { await sleep(300); return { words: [{ id: crypto.randomUUID(), word: "load", meaning_vi: "tải", step: "due" }] }; },
});
console.log(JSON.stringify({ ...result, wall_ms: Date.now() - t }, null, 2));
console.log("Mục tiêu: duration_ms < 240000, deferred = 0");
```

Lưu ý: `suggestion_log.entry_id` có FK tới `translate_history` → insert sẽ lỗi (ghi `console.error`, không fatal) — chấp nhận cho đo tải; con số cần đọc là `duration_ms`, `deferred`, `sent`.

- [ ] **Step 3: Chạy trên local**

```bash
psql "$(cd .. && npx supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -f scripts/push-load-seed.sql
node scripts/push-load-check.mjs 2026-10-13T13:00:00Z
```

Expected: `due_push_slots` ≈ 10000 slot < 500 ms; lượt: `sent` 10000, `deferred` 0, `duration_ms` < 240000. Nếu `deferred > 0` → ghi số đo vào PROGRESS và báo chủ dự án (không tự tăng song song quá 20 khi chưa đo được tải DB). Sau đó dọn: `DELETE FROM auth.users WHERE email LIKE 'loadtest+%@wordly.local';`

- [ ] **Step 4: Commit**

```bash
git add web/scripts/push-load-seed.sql web/scripts/push-load-check.mjs
git commit -m "test(push): script đo tải 10k người cùng hẹn 20:00 trên Supabase local — biết trước khi nào cần tăng song song/tách worker"
```

---

### Task 12: iOS — lịch nhắc dùng chung + menu giờ mốc 30 phút (email)

**Files:**
- Rename: `mobile/ios/WordlyiOS/Features/Settings/EmailSettingsLogic.swift` → `ReminderScheduleLogic.swift`
- Rename: `mobile/ios/WordlyiOSTests/EmailSettingsLogicTests.swift` → `ReminderScheduleLogicTests.swift`
- Create: `mobile/ios/WordlyiOS/Features/Settings/ReminderSettings.swift`
- Modify: `mobile/ios/WordlyiOS/Features/Settings/EmailSettingsView.swift`, `mobile/ios/WordlyiOS/Features/Profile/ProfileView.swift`, `mobile/ios/WordlyiOS/Core/Network/APIClient+Features.swift`, `mobile/ios/WordlyiOS/Core/Network/APIClient.swift`

**Interfaces:**
- Produces (Swift):
  - `enum ReminderScheduleLogic` — giữ `days`, `maxSlots`, `canAddSlot`, `canDeleteSlot`, `toggle(day:in:)`, `summary(_:)`; **bỏ** `date(from:)`, `timeString(from:)`; thêm `halfHourTimes: [String]`, `minutes(_:) -> Int?`, `isHalfHour(_:) -> Bool`, `conflict(for:others:) -> String?`, `options(current:others:) -> [String]`, `suggestedNewTime(existing:fallback:) -> String?`.
  - `enum ReminderChannel { case email, push }` với `preferencesPath`, `slotsPath`, `defaultTime`.
  - `APIClient`: `fetchReminderPreferences(_:) async throws -> EmailPreferences?`, `saveReminderPreferences(_:_:) async throws`, `fetchReminderSlots(_:) async throws -> [EmailSlot]`, `addReminderSlot(_:time:) async throws -> EmailSlot`, `updateReminderSlot(_:id:time:) async throws`, `deleteReminderSlot(_:id:) async throws`; các hàm `*Email*` cũ gọi qua bản `.email`.
  - `APIError.serverMessage: String?` — trường `error` trong JSON lỗi server.
  - `ReminderSettingsViewModel(channel:)`, `ReminderSettingsForm(vm:toggleTitle:toggleSubtitle:)`, `HalfHourPicker`.

- [ ] **Step 1: Đổi tên file (giữ lịch sử git)**

```bash
cd mobile/ios
git mv WordlyiOS/Features/Settings/EmailSettingsLogic.swift WordlyiOS/Features/Settings/ReminderScheduleLogic.swift
git mv WordlyiOSTests/EmailSettingsLogicTests.swift WordlyiOSTests/ReminderScheduleLogicTests.swift
```

Trong 2 file: đổi `enum EmailSettingsLogic` → `enum ReminderScheduleLogic`, class test → `ReminderScheduleLogicTests`, mọi `EmailSettingsLogic.` → `ReminderScheduleLogic.` (cả `EmailSettingsView.swift`, `ProfileView.swift`): `grep -rln EmailSettingsLogic WordlyiOS WordlyiOSTests`. Xoá test `testTimeStringRoundTrip` (hàm `date/timeString` sẽ bỏ).

- [ ] **Step 2: Viết test fail cho logic mốc 30 phút**

Thêm vào `ReminderScheduleLogicTests`:

```swift
    func testHalfHourTimes() {
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.count, 48)
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.first, "00:00")
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes[17], "08:30")
        XCTAssertEqual(ReminderScheduleLogic.halfHourTimes.last, "23:30")
    }

    func testIsHalfHour() {
        XCTAssertTrue(ReminderScheduleLogic.isHalfHour("08:00"))
        XCTAssertTrue(ReminderScheduleLogic.isHalfHour("20:30:00"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("08:15"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("08:01:00"))
        XCTAssertFalse(ReminderScheduleLogic.isHalfHour("25:00"))
    }

    func testConflictMatchesServerMessages() {
        XCTAssertEqual(ReminderScheduleLogic.conflict(for: "08:15", others: []),
                       "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)")
        XCTAssertEqual(ReminderScheduleLogic.conflict(for: "08:30", others: ["08:30:00"]), "Đã có khung giờ 08:30")
        XCTAssertNil(ReminderScheduleLogic.conflict(for: "09:00", others: ["08:30:00", "08:15:00"]))
    }

    func testOptionsHideUsedAndKeepLegacyCurrent() {
        let opts = ReminderScheduleLogic.options(current: "08:15:00", others: ["20:00:00"])
        XCTAssertEqual(opts.first, "08:15", "giờ lẻ cũ của chính khung đứng đầu")
        XCTAssertFalse(opts.contains("20:00"))
        XCTAssertTrue(opts.contains("08:00"))
        XCTAssertEqual(opts.count, 48)  // 48 mốc − 20:00 + 08:15
        XCTAssertEqual(ReminderScheduleLogic.options(current: "08:30:00", others: []).count, 48)
    }

    func testSuggestedNewTimeWrapsMidnightAndSkipsUsed() {
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: [], fallback: "20:00"), "20:00")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["08:00:00"], fallback: "20:00"), "08:30")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["23:30:00", "00:00:00"], fallback: "20:00"), "00:30")
        XCTAssertEqual(ReminderScheduleLogic.suggestedNewTime(existing: ["08:15:00"], fallback: "20:00"), "08:30")
    }
```

Thêm file test `mobile/ios/WordlyiOSTests/APIErrorMessageTests.swift`:

```swift
import XCTest
@testable import Wordly

final class APIErrorMessageTests: XCTestCase {
    func testServerMessageReadsErrorField() {
        let e = APIError.serverError(#"HTTP 400: {"error":"Đã có khung giờ 08:30"}"#)
        XCTAssertEqual(e.serverMessage, "Đã có khung giờ 08:30")
    }
    func testServerMessageNilForNonJSON() {
        XCTAssertNil(APIError.serverError("HTTP 500: Internal").serverMessage)
        XCTAssertNil(APIError.unauthorized.serverMessage)
    }
}
```

(Kiểm tên module test: `grep -n "@testable import" mobile/ios/WordlyiOSTests/*.swift | head -1` — dùng đúng tên đó.)

- [ ] **Step 3: Chạy, thấy fail**

```bash
cd mobile/ios && xcodegen generate && xcodebuild test -project WordlyiOS.xcodeproj -scheme WordlyiOS \
  -destination 'platform=iOS Simulator,name=BedWar-iPhone16' -parallel-testing-enabled NO \
  -only-testing:WordlyiOSTests/ReminderScheduleLogicTests -only-testing:WordlyiOSTests/APIErrorMessageTests 2>&1 | tail -20
```

Expected: build FAIL — `type 'ReminderScheduleLogic' has no member 'halfHourTimes'`, `value of type 'APIError' has no member 'serverMessage'`.

- [ ] **Step 4: Viết logic**

Trong `ReminderScheduleLogic.swift`: xoá `date(from:calendar:)` và `timeString(from:calendar:)`, sửa comment đầu file thành `/// Logic thuần lịch nhắc dùng chung cho Email và Thông báo (mốc :00/:30 — spec 2026-10-13 mục 9).`, thêm:

```swift
    static let halfHourError = "Chỉ chọn được giờ tròn hoặc rưỡi (ví dụ 08:00, 08:30)"

    /// 48 mốc 00:00 … 23:30 — chỉ được chọn các giờ này (khớp server).
    static let halfHourTimes: [String] = (0..<48).map { String(format: "%02d:%02d", $0 / 2, ($0 % 2) * 30) }

    /// "08:30" / "08:30:00" → phút trong ngày; sai → nil.
    static func minutes(_ time: String) -> Int? {
        let p = time.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2, (0...23).contains(p[0]), (0...59).contains(p[1]) else { return nil }
        return p[0] * 60 + p[1]
    }

    private static func hhmm(_ m: Int) -> String { String(format: "%02d:%02d", m / 60, m % 60) }
    private static func short(_ time: String) -> String { String(time.prefix(5)) }

    static func isHalfHour(_ time: String) -> Bool {
        guard let m = minutes(time) else { return false }
        return m % 30 == 0 && (time.count <= 5 || time.hasSuffix(":00"))
    }

    /// Lỗi khi đặt giờ này (nil = được) — cùng câu chữ với server.
    static func conflict(for time: String, others: [String]) -> String? {
        guard isHalfHour(time) else { return halfHourError }
        let t = short(time)
        return others.map(short).contains(t) ? "Đã có khung giờ \(t)" : nil
    }

    /// Mốc cho menu chọn giờ của một khung: mọi mốc chưa dùng ở khung khác;
    /// giờ lẻ cũ của chính khung (đặt trước bản này) đứng đầu để vẫn thấy nó.
    static func options(current: String?, others: [String]) -> [String] {
        let used = Set(others.map(short))
        var list = halfHourTimes.filter { !used.contains($0) }
        if let c = current.map(short), !isHalfHour(c) { list.insert(c, at: 0) }
        return list
    }

    /// Giờ gợi ý cho khung mới: mốc trống đầu tiên sau khung muộn nhất (vòng
    /// qua nửa đêm); chưa có khung nào → fallback; hết mốc → nil.
    static func suggestedNewTime(existing: [String], fallback: String) -> String? {
        let used = Set(existing.map(short))
        guard let last = existing.compactMap(minutes).max() else { return fallback }
        let base = last / 30 * 30
        for k in 1...48 {
            let c = hhmm((base + 30 * k) % 1440)
            if !used.contains(c) { return c }
        }
        return nil
    }
```

Trong `APIClient.swift`, thêm sau `enum APIError`:

```swift
extension APIError {
    /// Câu báo lỗi server gửi trong JSON `{ "error": "…" }` (để hiện cho người dùng).
    var serverMessage: String? {
        guard case .serverError(let raw) = self,
              let start = raw.firstIndex(of: "{"),
              let data = String(raw[start...]).data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return obj["error"] as? String
    }
}
```

- [ ] **Step 5: API theo kênh**

Tạo đầu file `ReminderSettings.swift`:

```swift
import SwiftUI

/// Hai kênh nhắc học dùng chung form lịch: Email và Thông báo đẩy.
enum ReminderChannel {
    case email, push
    var preferencesPath: String { self == .email ? "/api/email-preferences" : "/api/push/preferences" }
    var slotsPath: String { self == .email ? "/api/email-slots" : "/api/push/slots" }
    var defaultTime: String { self == .email ? "08:00" : "20:00" }
}
```

Trong `APIClient+Features.swift`, thay khối hàm email-preferences/email-slots (dòng ~85–109) bằng:

```swift
    func fetchReminderPreferences(_ channel: ReminderChannel) async throws -> EmailPreferences? {
        try await request(path: channel.preferencesPath, responseType: EmailPreferencesResponse.self).preferences
    }

    func saveReminderPreferences(_ prefs: EmailPreferences, _ channel: ReminderChannel) async throws {
        _ = try await request(path: channel.preferencesPath, method: "PUT", body: prefs, responseType: EmailPreferencesResponse.self)
    }

    func fetchReminderSlots(_ channel: ReminderChannel) async throws -> [EmailSlot] {
        try await request(path: channel.slotsPath, responseType: EmailSlotsResponse.self).slots
    }

    func addReminderSlot(_ channel: ReminderChannel, time: String) async throws -> EmailSlot {
        struct Body: Encodable { let send_time: String }
        return try await request(path: channel.slotsPath, method: "POST", body: Body(send_time: time), responseType: EmailSlotResponse.self).slot
    }

    func updateReminderSlot(_ channel: ReminderChannel, id: String, time: String) async throws {
        struct Body: Encodable { let id: String; let send_time: String }
        _ = try await request(path: channel.slotsPath, method: "PUT", body: Body(id: id, send_time: time), responseType: Ok.self)
    }

    func deleteReminderSlot(_ channel: ReminderChannel, id: String) async throws {
        _ = try await request(path: "\(channel.slotsPath)?id=\(id)", method: "DELETE", responseType: Ok.self)
    }

    func fetchEmailPreferences() async throws -> EmailPreferences? { try await fetchReminderPreferences(.email) }
```

(`Ok` decode `{ success: true }` — kiểm `grep -n "struct Ok" -A3 WordlyiOS/Core/Network/*.swift`; nếu `Ok` đòi field khác thì route push trả đúng field đó.)

- [ ] **Step 6: ViewModel + form + menu giờ dùng chung**

Thêm tiếp vào `ReminderSettings.swift` (chuyển `EmailSettingsViewModel` cũ sang đây, đổi tên, bỏ debounce — menu chọn mốc rời rạc nên gửi ngay):

```swift
@MainActor
final class ReminderSettingsViewModel: ObservableObject {
    let channel: ReminderChannel
    @Published var prefs = EmailPreferences(enabled: false, frequency: "daily", customDays: [1, 2, 3, 4, 5])
    @Published var slots: [EmailSlot] = []
    @Published var state: Loadable<Void> = .idle
    @Published var saving = false
    @Published var toast: String?
    @Published var error: String?
    let timezone = TimeZone.current.identifier

    init(channel: ReminderChannel) { self.channel = channel }

    func load() async {
        state = .loading
        do {
            async let p = APIClient.shared.fetchReminderPreferences(channel)
            async let s = APIClient.shared.fetchReminderSlots(channel)
            if let loaded = try await p {
                prefs = loaded
                if prefs.customDays.isEmpty { prefs.customDays = [1, 2, 3, 4, 5] }
            }
            slots = try await s
            state = .loaded(())
            Task { try? await APIClient.shared.updateTimezone(timezone) }
        } catch {
            state = .failed("Không tải được cài đặt.")
        }
    }

    func save() async {
        saving = true
        error = nil
        defer { saving = false }
        do {
            try await APIClient.shared.saveReminderPreferences(prefs, channel)
            if prefs.enabled && slots.isEmpty {
                // Push: server tự tạo 20:00; email: app tạo 08:00 như trước
                if channel == .push { slots = try await APIClient.shared.fetchReminderSlots(.push) }
                else { slots = [try await APIClient.shared.addReminderSlot(.email, time: channel.defaultTime)] }
            }
            toast = prefs.enabled ? "Đã lưu — sẽ nhắc theo lịch bạn chọn" : "Đã tắt nhắc học"
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Lưu thất bại, thử lại nhé."
        }
    }

    func addSlot() async {
        guard ReminderScheduleLogic.canAddSlot(count: slots.count),
              let time = ReminderScheduleLogic.suggestedNewTime(existing: slots.map(\.sendTime), fallback: channel.defaultTime)
        else { return }
        do {
            slots.append(try await APIClient.shared.addReminderSlot(channel, time: time))
            error = nil
        } catch {
            self.error = (error as? APIError)?.serverMessage ?? "Không thêm được khung giờ."
        }
    }

    /// Đổi giờ: kiểm ở máy trước (cùng luật server); server từ chối → trả giờ cũ + báo lỗi.
    func update(_ slot: EmailSlot, to time: String) async {
        let others = slots.filter { $0.id != slot.id }.map(\.sendTime)
        if let msg = ReminderScheduleLogic.conflict(for: time, others: others) { error = msg; return }
        guard let i = slots.firstIndex(where: { $0.id == slot.id }) else { return }
        let old = slots[i]
        slots[i] = EmailSlot(id: slot.id, sendTime: time)
        error = nil
        do {
            try await APIClient.shared.updateReminderSlot(channel, id: slot.id, time: time)
        } catch {
            if let j = slots.firstIndex(where: { $0.id == slot.id }) { slots[j] = old }
            self.error = (error as? APIError)?.serverMessage ?? "Không đổi được giờ, thử lại nhé."
        }
    }

    func delete(_ slot: EmailSlot) async {
        guard ReminderScheduleLogic.canDeleteSlot(count: slots.count) else { return }
        slots.removeAll { $0.id == slot.id }
        do { try await APIClient.shared.deleteReminderSlot(channel, id: slot.id) }
        catch { await load() }
    }
}

/// Chọn giờ theo mốc :00/:30 — menu gọn trong một dòng Form (thay DatePicker từng phút).
struct HalfHourPicker: View {
    let selection: String
    let options: [String]
    let onPick: (String) -> Void

    var body: some View {
        Menu {
            ForEach(options, id: \.self) { t in
                Button(t) { onPick(t) }
            }
        } label: {
            HStack {
                Text("Gửi lúc").foregroundStyle(.primary)
                Spacer()
                Text(String(selection.prefix(5)))
                    .font(WordlyFonts.body(15, weight: .semibold))
                    .foregroundStyle(WordlyColors.electric)
                Image(systemName: "chevron.up.chevron.down").font(.caption).foregroundStyle(WordlyColors.inkSoft)
            }
        }
    }
}
```

Tạo `ReminderSettingsForm` trong cùng file: **chuyển nguyên** phần `content` + section nút Lưu của `EmailSettingsView` hiện tại (dòng ~108–200) vào struct sau, với 3 thay đổi: (1) `Toggle` dùng `toggleTitle`/`toggleSubtitle`; (2) khối `ForEach(vm.slots)` dùng `HalfHourPicker`; (3) nút thêm khung gọi thẳng `vm.addSlot()` (bỏ `showAdd`/`newSlotTime`):

```swift
struct ReminderSettingsForm: View {
    @ObservedObject var vm: ReminderSettingsViewModel
    let toggleTitle: String
    let toggleSubtitle: String

    var body: some View {
        Section {
            Toggle(isOn: $vm.prefs.enabled) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(toggleTitle).font(WordlyFonts.body(15, weight: .semibold))
                    Text(toggleSubtitle).font(WordlyFonts.body(12)).foregroundStyle(WordlyColors.inkSoft)
                }
            }
            .tint(WordlyColors.electric)
        }

        if vm.prefs.enabled {
            Section("Tần suất") {
                Picker("Tần suất", selection: $vm.prefs.frequency) {
                    Text("📅 Mỗi ngày").tag("daily")
                    Text("💼 Thứ 2–6").tag("weekdays")
                    Text("⚙️ Tuỳ chỉnh").tag("custom")
                }
                .pickerStyle(.segmented)
                if vm.prefs.frequency == "custom" {
                    HStack(spacing: 6) {
                        ForEach(ReminderScheduleLogic.days) { day in
                            let on = vm.prefs.customDays.contains(day.value)
                            Button {
                                vm.prefs.customDays = ReminderScheduleLogic.toggle(day: day.value, in: vm.prefs.customDays)
                            } label: {
                                Text(day.label)
                                    .font(WordlyFonts.body(13, weight: .bold))
                                    .frame(maxWidth: .infinity, minHeight: 36)
                                    .background(on ? WordlyColors.electric : WordlyColors.hoverBG)
                                    .foregroundStyle(on ? WordlyColors.onElectric : WordlyColors.inkSoft)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            Section {
                ForEach(vm.slots) { slot in
                    HStack {
                        Image(systemName: "clock.fill").foregroundStyle(WordlyColors.electric)
                        HalfHourPicker(
                            selection: slot.sendTime,
                            options: ReminderScheduleLogic.options(
                                current: slot.sendTime,
                                others: vm.slots.filter { $0.id != slot.id }.map(\.sendTime)),
                            onPick: { t in Task { await vm.update(slot, to: t) } })
                    }
                    .swipeActions {
                        if ReminderScheduleLogic.canDeleteSlot(count: vm.slots.count) {
                            Button("Xoá", role: .destructive) { Task { await vm.delete(slot) } }
                        }
                    }
                }
                if ReminderScheduleLogic.canAddSlot(count: vm.slots.count) {
                    Button { Task { await vm.addSlot() } } label: {
                        Label("Thêm khung giờ", systemImage: "plus.circle.fill")
                    }
                    .foregroundStyle(WordlyColors.electric)
                }
            } header: {
                Text("Giờ gửi (\(vm.slots.count)/\(ReminderScheduleLogic.maxSlots))")
            } footer: {
                Text("Chỉ chọn giờ tròn hoặc rưỡi. Theo múi giờ \(vm.timezone). Vuốt sang trái để xoá một khung giờ.")
            }
        }

        Section {
            if let e = vm.error {
                Text(e).font(WordlyFonts.body(13)).foregroundStyle(WordlyColors.error)
            }
            Button { Task { await vm.save() } } label: {
                HStack {
                    if vm.saving { ProgressView().tint(WordlyColors.onElectric) }
                    Text("Lưu cài đặt").frame(maxWidth: .infinity)
                }
                .font(WordlyFonts.body(15, weight: .bold))
                .padding(.vertical, 6)
            }
            .listRowBackground(WordlyColors.electric)
            .foregroundStyle(WordlyColors.onElectric)
            .disabled(vm.saving)
        }
    }
}
```

(Hai section "Tần suất" và "Lưu cài đặt" là code cũ của `EmailSettingsView` chuyển sang, chỉ đổi `EmailSettingsLogic` → `ReminderScheduleLogic`.)

Sửa `EmailSettingsView`: xoá `EmailSettingsViewModel`, `newSlotTime`, `showAdd`, `content`; còn lại:

```swift
struct EmailSettingsView: View {
    @StateObject private var vm = ReminderSettingsViewModel(channel: .email)

    var body: some View {
        Form {
            switch vm.state {
            case .idle, .loading:
                Section { LoadingStateView() }
            case .failed(let m):
                Section { ErrorStateView(message: m) { Task { await vm.load() } } }
            case .loaded:
                ReminderSettingsForm(vm: vm, toggleTitle: "Nhận email ôn từ vựng",
                                     toggleSubtitle: "Mỗi email nhắc lại vài từ bạn đã lưu")
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Email nhắc học")
        .navigationBarTitleDisplayMode(.inline)
        .toast($vm.toast)
        .task { if case .idle = vm.state { await vm.load() } }
    }
}
```

Nếu `EmailSettingsView` cũ còn section nào khác (vd. "Gửi email thử") — giữ lại trong `case .loaded:` sau form.

- [ ] **Step 7: Chạy test, thấy pass + toàn bộ unit iOS**

```bash
cd mobile/ios && xcodegen generate && xcodebuild test -project WordlyiOS.xcodeproj -scheme WordlyiOS \
  -destination 'platform=iOS Simulator,name=BedWar-iPhone16' -parallel-testing-enabled NO \
  -only-testing:WordlyiOSTests 2>&1 | tail -5
```

Expected: `** TEST SUCCEEDED **`, số test = cũ − 1 + 7.

- [ ] **Step 8: Xem trên simulator** — mở Cá nhân → Email nhắc học: menu giờ chỉ có mốc :00/:30, mốc đã dùng không có trong menu, "Thêm khung giờ" thêm mốc kế tiếp. Chụp màn lưu vào thư mục nháp phiên.

- [ ] **Step 9: Commit**

```bash
git add mobile/ios/WordlyiOS/Features/Settings mobile/ios/WordlyiOSTests/ReminderScheduleLogicTests.swift mobile/ios/WordlyiOSTests/APIErrorMessageTests.swift mobile/ios/WordlyiOS/Core/Network/APIClient+Features.swift mobile/ios/WordlyiOS/Core/Network/APIClient.swift mobile/ios/WordlyiOS/Features/Profile/ProfileView.swift
git commit -m "feat(ios): giờ email chỉ chọn mốc :00/:30 qua menu — form lịch nhắc dùng chung để màn Thông báo dùng lại, lỗi server hiện đúng câu"
```

---

### Task 13: iOS — Firebase SDK, entitlement, logic push thuần

**Files:**
- Modify: `mobile/ios/project.yml`, `.gitignore`, `mobile/ios/README.md`
- Create: `mobile/ios/WordlyiOS/Core/Push/PushLogic.swift`
- Test: `mobile/ios/WordlyiOSTests/PushLogicTests.swift`

**Interfaces:**
- Produces: `enum PushLogic { static func shouldSync(lastSync: Date?, now: Date, force: Bool) -> Bool; static func linkURL(from: [AnyHashable: Any]) -> URL?; static func hasFirebaseConfig(_ bundle: Bundle) -> Bool; static func appVersion(_ bundle: Bundle) -> String; static func shouldOfferPrompt(alreadyShown: Bool, status: UNAuthorizationStatus, pushAvailable: Bool) -> Bool; static let promptShownKey: String }`.

- [ ] **Step 1: Viết test fail**

```swift
// mobile/ios/WordlyiOSTests/PushLogicTests.swift
import XCTest
import UserNotifications
@testable import Wordly

final class PushLogicTests: XCTestCase {
    func testShouldSyncOncePerDayUnlessForced() {
        let now = Date(timeIntervalSince1970: 1_000_000)
        XCTAssertTrue(PushLogic.shouldSync(lastSync: nil, now: now, force: false))
        XCTAssertFalse(PushLogic.shouldSync(lastSync: now.addingTimeInterval(-3600), now: now, force: false))
        XCTAssertTrue(PushLogic.shouldSync(lastSync: now.addingTimeInterval(-24 * 3600), now: now, force: false))
        XCTAssertTrue(PushLogic.shouldSync(lastSync: now, now: now, force: true))
    }

    /// Chuỗi y hệt server tạo (web/tests/unit/push-build-message.test.mjs) — Review Focus #1.
    func testLinkFromServerDecodesSpecialCharacters() throws {
        let info: [AnyHashable: Any] = ["link": "wordly://word?id=1&w=make%20up&m=a%2Bb%20%26%20c%20%23%20d&bank=0"]
        let url = try XCTUnwrap(PushLogic.linkURL(from: info))
        let link = try XCTUnwrap(WidgetDeepLink(url: url))
        XCTAssertEqual(link.word, "make up")
        XCTAssertEqual(link.meaning, "a+b & c # d")
        XCTAssertFalse(link.fromBank)
    }

    func testLinkVietnameseAndBank() throws {
        let info: [AnyHashable: Any] = ["link": "wordly://word?id=bank-42&w=go&m=%C4%91i&bank=1"]
        let link = try XCTUnwrap(WidgetDeepLink(url: XCTUnwrap(PushLogic.linkURL(from: info))))
        XCTAssertEqual(link.meaning, "đi")
        XCTAssertEqual(link.bankWordId, "42")
    }

    func testLinkRejectsMissingOrForeign() {
        XCTAssertNil(PushLogic.linkURL(from: [:]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": 5]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": "https://evil.example/word?id=1&w=x"]))
        XCTAssertNil(PushLogic.linkURL(from: ["link": "wordly://word?id=&w=x"]))
    }

    func testOfferPromptOnlyOnceAndOnlyWhenUndecided() {
        XCTAssertTrue(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .notDetermined, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: true, status: .notDetermined, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .authorized, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .denied, pushAvailable: true))
        XCTAssertFalse(PushLogic.shouldOfferPrompt(alreadyShown: false, status: .notDetermined, pushAvailable: false))
    }

    func testMissingFirebasePlistIsDetected() {
        XCTAssertFalse(PushLogic.hasFirebaseConfig(Bundle(for: PushLogicTests.self)))
    }
}
```

- [ ] **Step 2: Chạy, thấy fail** — build FAIL `cannot find 'PushLogic' in scope`.

- [ ] **Step 3: Viết `PushLogic.swift`**

```swift
// mobile/ios/WordlyiOS/Core/Push/PushLogic.swift
import Foundation
import UserNotifications

/// Logic thuần của thông báo đẩy — tách khỏi PushManager để test được.
enum PushLogic {
    static let resyncInterval: TimeInterval = 24 * 3600
    static let promptShownKey = "wordly.push.promptShown"

    /// Gửi lại token lên server: khi bị ép (token mới / đăng nhập) hoặc đã quá
    /// 24 giờ — giữ updated_at tươi cho việc dọn token 270 ngày, mà không gọi
    /// API mỗi lần mở app.
    static func shouldSync(lastSync: Date?, now: Date, force: Bool) -> Bool {
        guard !force, let lastSync else { return true }
        return now.timeIntervalSince(lastSync) >= resyncInterval
    }

    /// `userInfo["link"]` → URL chỉ khi đúng dạng link widget `wordly://word?...`.
    static func linkURL(from userInfo: [AnyHashable: Any]) -> URL? {
        guard let s = userInfo["link"] as? String, let url = URL(string: s), WidgetDeepLink(url: url) != nil else { return nil }
        return url
    }

    /// Thiếu GoogleService-Info.plist (máy dev chưa tải) → app vẫn chạy, chỉ không có push.
    static func hasFirebaseConfig(_ bundle: Bundle) -> Bool {
        bundle.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    static func appVersion(_ bundle: Bundle) -> String {
        let v = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let b = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(v) (\(b))"
    }

    /// Sheet "Nhắc bạn ôn từ này lúc 20:00?" — chỉ một lần, chỉ khi chưa từng
    /// trả lời hộp thoại quyền của iOS.
    static func shouldOfferPrompt(alreadyShown: Bool, status: UNAuthorizationStatus, pushAvailable: Bool) -> Bool {
        pushAvailable && !alreadyShown && status == .notDetermined
    }
}
```

- [ ] **Step 4: Chạy, thấy pass** — `-only-testing:WordlyiOSTests/PushLogicTests` → 6/6.

- [ ] **Step 5: Thêm Firebase + entitlement vào `project.yml`**

Tìm bản Firebase mới nhất: `git ls-remote --tags https://github.com/firebase/firebase-ios-sdk | grep -oE 'refs/tags/[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1` → dùng `from: "<MAJOR>.0.0"` của bản đó.

```yaml
packages:
  Supabase:
    url: https://github.com/supabase/supabase-swift
    from: "2.0.0"
  # Chỉ FirebaseMessaging (push) — không Analytics/Crashlytics
  Firebase:
    url: https://github.com/firebase/firebase-ios-sdk
    from: "<MAJOR>.0.0"
```

Target `WordlyiOS`:
- `info.properties` thêm:
  ```yaml
        # Tự chuyển APNs token cho Firebase (PushManager) — không cho Firebase
        # chen vào AppDelegate/onOpenURL (swizzling)
        FirebaseAppDelegateProxyEnabled: false
  ```
- `entitlements.properties` thêm:
  ```yaml
        # Push Notifications — development (Debug) / production (Release, TestFlight)
        aps-environment: $(WORDLY_APS_ENVIRONMENT)
  ```
- `settings` thêm:
  ```yaml
      configs:
        Debug:
          WORDLY_APS_ENVIRONMENT: development
        Release:
          WORDLY_APS_ENVIRONMENT: production
  ```
- `dependencies` thêm:
  ```yaml
      - package: Firebase
        product: FirebaseMessaging
  ```

`GoogleService-Info.plist` đặt ở `mobile/ios/WordlyiOS/App/` — nằm trong `sources: WordlyiOS` nên tự vào bundle khi có file (chạy lại `xcodegen generate` sau khi thêm file).

`.gitignore` (gốc repo) thêm dưới dòng `Secrets.xcconfig`:

```
# Cấu hình Firebase của app iOS — repo public, KHÔNG commit (tải từ Firebase console)
mobile/ios/WordlyiOS/App/GoogleService-Info.plist
```

`mobile/ios/README.md` thêm mục "Push notification": tải `GoogleService-Info.plist` (Firebase console → Project settings → app iOS `com.thientran.wordly`) vào `WordlyiOS/App/`, rồi `xcodegen generate`; thiếu file thì app vẫn chạy nhưng không có push.

- [ ] **Step 6: Build Debug + Release (archive thử không upload)**

```bash
cd mobile/ios && xcodegen generate
xcodebuild -project WordlyiOS.xcodeproj -scheme WordlyiOS -destination 'platform=iOS Simulator,name=BedWar-iPhone16' build 2>&1 | tail -3
xcodebuild test -project WordlyiOS.xcodeproj -scheme WordlyiOS -destination 'platform=iOS Simulator,name=BedWar-iPhone16' -parallel-testing-enabled NO -only-testing:WordlyiOSTests 2>&1 | tail -3
```

Expected: `BUILD SUCCEEDED`, `TEST SUCCEEDED` (chưa có plist → app chạy bình thường). Kiểm entitlement: `codesign -d --entitlements :- <đường dẫn Wordly.app trong DerivedData>` có `aps-environment = development`.

- [ ] **Step 7: Commit** (kiểm trước: `git status --ignored mobile/` — plist/Secrets phải nằm trong "Ignored")

```bash
git add mobile/ios/project.yml .gitignore mobile/ios/README.md mobile/ios/WordlyiOS/Core/Push/PushLogic.swift mobile/ios/WordlyiOSTests/PushLogicTests.swift
git commit -m "feat(ios): thêm FirebaseMessaging + entitlement push + logic thuần — plist Firebase gitignore vì repo public, thiếu file app vẫn chạy"
```

---

### Task 14: iOS — PushManager, AppDelegate, đăng xuất, bấm thông báo

**Files:**
- Create: `mobile/ios/WordlyiOS/Core/Push/PushManager.swift`, `mobile/ios/WordlyiOS/App/AppDelegate.swift`
- Modify: `mobile/ios/WordlyiOS/App/WordlyApp.swift`, `mobile/ios/WordlyiOS/App/ContentView.swift`, `mobile/ios/WordlyiOS/Core/Auth/AuthManager.swift`, `mobile/ios/WordlyiOS/Core/Network/APIClient+Features.swift`

**Interfaces:**
- Consumes: `PushLogic` (T13), `ReminderChannel`, `saveReminderPreferences` (T12).
- Produces: `PushManager.shared` (`@MainActor`, `ObservableObject`): `@Published pendingURL: URL?`, `isAvailable: Bool`, `configure()`, `authorizationStatus() async -> UNAuthorizationStatus`, `requestPermission() async -> Bool`, `didRegister(apnsToken: Data)`, `syncIfNeeded(force: Bool = false) async`, `unregister() async`, `forgetLocally() async`, `enableDailyDefault() async -> Bool`. `APIClient.registerPushDevice(token:appVersion:)`, `unregisterPushDevice(token:)`.

- [ ] **Step 1: API push device**

Thêm vào `APIClient+Features.swift`:

```swift
    func registerPushDevice(token: String, appVersion: String) async throws {
        struct Body: Encodable { let token: String; let platform = "ios"; let app_version: String }
        _ = try await request(path: "/api/push/devices", method: "POST", body: Body(token: token, app_version: appVersion), responseType: Ok.self)
    }

    func unregisterPushDevice(token: String) async throws {
        struct Body: Encodable { let token: String }
        _ = try await request(path: "/api/push/devices", method: "DELETE", body: Body(token: token), responseType: Ok.self)
    }
```

- [ ] **Step 2: `PushManager.swift`**

```swift
// mobile/ios/WordlyiOS/Core/Push/PushManager.swift
import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging

/// Thông báo đẩy nhắc ôn từ (spec 2026-10-13): Firebase lấy FCM token → đăng
/// ký lên server; bấm thông báo → `pendingURL` (wordly://word?...) → AppRouter.
@MainActor
final class PushManager: NSObject, ObservableObject {
    static let shared = PushManager()

    /// Link từ thông báo vừa bấm — WordlyApp mở bằng AppRouter rồi xoá.
    @Published var pendingURL: URL?
    /// Có GoogleService-Info.plist + đã configure Firebase.
    private(set) var isAvailable = false
    private var fcmToken: String?
    private let defaults = UserDefaults.standard
    private enum Key {
        static let lastSync = "wordly.push.lastSync"
        static let syncedToken = "wordly.push.syncedToken"
    }

    /// Gọi một lần lúc khởi động (AppDelegate).
    func configure() {
        UNUserNotificationCenter.current().delegate = self
        guard PushLogic.hasFirebaseConfig(Bundle.main) else { return }
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        isAvailable = true
        Task {
            if await authorizationStatus() == .authorized {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
    }

    /// Hộp thoại quyền của iOS; đồng ý → đăng ký APNs.
    func requestPermission() async -> Bool {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        if granted { UIApplication.shared.registerForRemoteNotifications() }
        return granted
    }

    func didRegister(apnsToken: Data) {
        guard isAvailable else { return }
        Messaging.messaging().apnsToken = apnsToken
    }

    /// Đăng ký token lên server (khi đăng nhập, token đổi, hoặc quá 24 giờ).
    func syncIfNeeded(force: Bool = false) async {
        guard isAvailable, AuthManager.shared.isAuthenticated else { return }
        if fcmToken == nil { fcmToken = try? await Messaging.messaging().token() }
        guard let token = fcmToken else { return }
        let changed = defaults.string(forKey: Key.syncedToken) != token
        let last = defaults.object(forKey: Key.lastSync) as? Date
        guard PushLogic.shouldSync(lastSync: last, now: Date(), force: force || changed) else { return }
        do {
            try await APIClient.shared.registerPushDevice(token: token, appVersion: PushLogic.appVersion(Bundle.main))
            defaults.set(Date(), forKey: Key.lastSync)
            defaults.set(token, forKey: Key.syncedToken)
        } catch {
            // Lần mở app sau thử lại (lastSync không đổi)
        }
    }

    /// Gọi TRƯỚC khi đăng xuất (cần Bearer còn sống): xoá token trên server rồi
    /// huỷ token trên máy. Lỗi bỏ qua — người đăng nhập sau sẽ chiếm token.
    func unregister() async {
        guard isAvailable else { return }
        if let token = fcmToken ?? defaults.string(forKey: Key.syncedToken) {
            try? await APIClient.shared.unregisterPushDevice(token: token)
        }
        await forgetLocally()
    }

    /// Sau khi xoá tài khoản (server đã xoá dữ liệu) — chỉ dọn trên máy.
    func forgetLocally() async {
        guard isAvailable else { return }
        try? await Messaging.messaging().deleteToken()
        fcmToken = nil
        defaults.removeObject(forKey: Key.lastSync)
        defaults.removeObject(forKey: Key.syncedToken)
    }

    /// "Bật" trong sheet hỏi một lần: xin quyền → bật push mỗi ngày (server tạo 20:00).
    func enableDailyDefault() async -> Bool {
        guard await requestPermission() else { return false }
        let prefs = EmailPreferences(enabled: true, frequency: "daily", customDays: [1, 2, 3, 4, 5])
        do {
            try await APIClient.shared.saveReminderPreferences(prefs, .push)
            await syncIfNeeded(force: true)
            return true
        } catch {
            return false
        }
    }
}

extension PushManager: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        Task { @MainActor in
            self.fcmToken = fcmToken
            await self.syncIfNeeded(force: true)
        }
    }
}

extension PushManager: UNUserNotificationCenterDelegate {
    /// App đang mở vẫn hiện banner.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    /// Bấm thông báo → mở đúng từ (cùng đường với bấm widget).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse) async {
        guard let url = PushLogic.linkURL(from: response.notification.request.content.userInfo) else { return }
        await MainActor.run { self.pendingURL = url }
    }
}
```

- [ ] **Step 3: `AppDelegate.swift`**

```swift
// mobile/ios/WordlyiOS/App/AppDelegate.swift
import UIKit

/// Chỉ để nhận APNs token + gắn delegate thông báo sớm (bấm thông báo khi app
/// đang tắt hẳn vẫn mở đúng từ).
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if DEBUG
        if PreviewMode.isOn { return true } // UI test/chụp màn: không gọi Firebase
        #endif
        PushManager.shared.configure()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushManager.shared.didRegister(apnsToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] Đăng ký APNs lỗi: \(error.localizedDescription)")
    }
}
```

- [ ] **Step 4: Gắn vào app**

`WordlyApp.swift`: thêm `import Combine` (cho `.compactMap` trên publisher), `@UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate` và `@StateObject private var push = PushManager.shared`; sau `.onOpenURL { router.open($0) }` thêm:

```swift
                // Bấm thông báo nhắc ôn → mở đúng từ như bấm widget
                .onReceive(push.$pendingURL.compactMap { $0 }) { url in
                    router.open(url)
                    push.pendingURL = nil
                }
```

`ContentView.swift` trong `MainTabView` (chỉ hiện khi đã đăng nhập — gồm cả lúc đổi tài khoản):

```swift
        // Đăng nhập (kể cả người khác trên cùng máy) → token chuyển sang người này
        .task { await PushManager.shared.syncIfNeeded(force: true) }
        .task(id: scenePhase) {
            if scenePhase == .active {
                await WidgetSync.refreshIfStale()
                await PushManager.shared.syncIfNeeded()
            }
        }
```

(thay `.task(id: scenePhase)` cũ bằng bản trên.)

`AuthManager.swift`:
- Trong `signOut()`, dòng đầu: `await PushManager.shared.unregister()` (trước `supabase.auth.signOut()`).
- Trong `deleteAccount()`, sau `try await AccountDeletion.run(...)`: `await PushManager.shared.forgetLocally()`.

- [ ] **Step 5: Build + toàn bộ unit test**

```bash
cd mobile/ios && xcodegen generate && xcodebuild test -project WordlyiOS.xcodeproj -scheme WordlyiOS \
  -destination 'platform=iOS Simulator,name=BedWar-iPhone16' -parallel-testing-enabled NO -only-testing:WordlyiOSTests 2>&1 | tail -3
```

Expected: `TEST SUCCEEDED` (gồm `SignOutWidgetTests`, `AccountDeletionTests` cũ).

- [ ] **Step 6: UI test deep link sẵn có vẫn xanh**

`-only-testing:WordlyiOSUITests/WidgetDeepLinkUITests` (tên thật: `ls mobile/ios/WordlyiOSUITests`) → PASS.

- [ ] **Step 7: Commit**

```bash
git add mobile/ios/WordlyiOS/Core/Push/PushManager.swift mobile/ios/WordlyiOS/App/AppDelegate.swift mobile/ios/WordlyiOS/App/WordlyApp.swift mobile/ios/WordlyiOS/App/ContentView.swift mobile/ios/WordlyiOS/Core/Auth/AuthManager.swift mobile/ios/WordlyiOS/Core/Network/APIClient+Features.swift
git commit -m "feat(ios): PushManager — đăng ký token khi đăng nhập/token đổi, huỷ token trước khi đăng xuất để thông báo không hiện trên máy người khác, bấm thông báo mở đúng từ"
```

---

### Task 15: iOS — màn "Thông báo nhắc ôn" + dòng trong Hồ sơ

**Files:**
- Create: `mobile/ios/WordlyiOS/Features/Settings/PushSettingsView.swift`
- Modify: `mobile/ios/WordlyiOS/Features/Profile/ProfileView.swift`

**Interfaces:**
- Consumes: `ReminderSettingsViewModel(channel: .push)`, `ReminderSettingsForm`, `PushManager.shared` (`isAvailable`, `authorizationStatus`, `requestPermission`).

- [ ] **Step 1: Viết màn**

```swift
// mobile/ios/WordlyiOS/Features/Settings/PushSettingsView.swift
import SwiftUI
import UserNotifications

/// Thông báo đẩy nhắc ôn từ — cùng form lịch với Email; bật công tắc thì xin
/// quyền iOS, bị từ chối thì công tắc về tắt + nút mở Cài đặt.
struct PushSettingsView: View {
    @StateObject private var vm = ReminderSettingsViewModel(channel: .push)
    @State private var status: UNAuthorizationStatus = .notDetermined
    @Environment(\.openURL) private var openURL

    var body: some View {
        Form {
            if !PushManager.shared.isAvailable {
                Section { Text("Bản cài này chưa hỗ trợ thông báo.").foregroundStyle(WordlyColors.inkSoft) }
            } else {
                if status == .denied {
                    Section {
                        Text("Thông báo đang bị tắt trong Cài đặt iOS").font(WordlyFonts.body(14, weight: .semibold))
                        Button("Mở Cài đặt") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                        .foregroundStyle(WordlyColors.electric)
                    }
                }
                switch vm.state {
                case .idle, .loading:
                    Section { LoadingStateView() }
                case .failed(let m):
                    Section { ErrorStateView(message: m) { Task { await vm.load() } } }
                case .loaded:
                    ReminderSettingsForm(vm: vm, toggleTitle: "Nhận thông báo ôn từ",
                                         toggleSubtitle: "Mỗi thông báo nhắc một từ, bấm vào để xem ngay")
                }
            }
        }
        .scrollContentBackground(.hidden)
        .screenBackground()
        .navigationTitle("Thông báo nhắc ôn")
        .navigationBarTitleDisplayMode(.inline)
        .toast($vm.toast)
        .task {
            status = await PushManager.shared.authorizationStatus()
            if case .idle = vm.state { await vm.load() }
        }
        .onChange(of: vm.prefs.enabled) { _, on in
            guard on, status != .authorized else { return }
            Task {
                let granted = await PushManager.shared.requestPermission()
                status = await PushManager.shared.authorizationStatus()
                if !granted { vm.prefs.enabled = false }
            }
        }
    }
}
```

- [ ] **Step 2: Dòng trong Hồ sơ**

`ProfileView.swift`: thêm `@State private var pushSummary = ""`; trong Section "Nhắc học", ngay dưới NavigationLink Email:

```swift
                    NavigationLink { PushSettingsView() } label: {
                        settingRow("bell.badge.fill", WordlyColors.electric, "Thông báo nhắc ôn", pushSummary)
                    }
```

Ở chỗ đang nạp `emailSummary` (dòng ~98), thêm:

```swift
                if let p = try? await APIClient.shared.fetchReminderPreferences(.push) {
                    pushSummary = ReminderScheduleLogic.summary(p)
                } else {
                    pushSummary = "Đang tắt"
                }
```

- [ ] **Step 3: Build + unit test** — như Task 14 Step 5 → `TEST SUCCEEDED`.

- [ ] **Step 4: Xem trên simulator** (Debug, có `GoogleService-Info.plist` nếu chủ dự án đã tải; chưa có → thấy dòng "Bản cài này chưa hỗ trợ thông báo"). Bật công tắc → hộp thoại quyền; "Không cho phép" → công tắc tắt + dòng "Thông báo đang bị tắt trong Cài đặt iOS". Chụp màn.

- [ ] **Step 5: Commit**

```bash
git add mobile/ios/WordlyiOS/Features/Settings/PushSettingsView.swift mobile/ios/WordlyiOS/Features/Profile/ProfileView.swift
git commit -m "feat(ios): màn Thông báo nhắc ôn trong Hồ sơ — xin quyền đúng lúc bật công tắc, bị từ chối thì chỉ đường mở Cài đặt"
```

---

### Task 16: iOS — hỏi bật nhắc một lần sau khi lưu từ + khai Device ID

**Files:**
- Modify: `mobile/ios/WordlyiOS/Features/Translate/TranslateViewModel.swift`, `mobile/ios/WordlyiOS/Features/Translate/TranslateView.swift`, `mobile/ios/WordlyiOS/PrivacyInfo.xcprivacy`

**Interfaces:**
- Consumes: `PushLogic.shouldOfferPrompt`, `PushLogic.promptShownKey`, `PushManager.enableDailyDefault()`.
- Produces: `TranslateViewModel.offerPushReminder: Bool` (`@Published`).

- [ ] **Step 1: ViewModel**

Trong `TranslateViewModel`: thêm `@Published var offerPushReminder = false`; trong `save()` nhánh thành công, sau `Task { await WidgetSync.refresh() }` thêm `Task { await maybeOfferPushReminder() }`; thêm hàm:

```swift
    /// Lần đầu lưu từ (và chưa từng trả lời quyền thông báo) → hỏi bật nhắc 20:00.
    private func maybeOfferPushReminder() async {
        let shown = UserDefaults.standard.bool(forKey: PushLogic.promptShownKey)
        let status = await PushManager.shared.authorizationStatus()
        guard PushLogic.shouldOfferPrompt(alreadyShown: shown, status: status, pushAvailable: PushManager.shared.isAvailable) else { return }
        UserDefaults.standard.set(true, forKey: PushLogic.promptShownKey)
        offerPushReminder = true
    }
```

- [ ] **Step 2: Sheet trong `TranslateView`**

Gắn vào view gốc của `TranslateView` (cùng chỗ các `.sheet` khác; `vm` là tên biến ViewModel trong file — kiểm bằng `grep -n "StateObject\|ObservedObject" TranslateView.swift`):

```swift
        .sheet(isPresented: $vm.offerPushReminder) {
            VStack(spacing: 16) {
                Image(systemName: "bell.badge.fill").font(.system(size: 40)).foregroundStyle(WordlyColors.electric)
                Text("Nhắc bạn ôn từ này?").font(WordlyFonts.body(18, weight: .bold))
                Text("Wordly gửi một thông báo lúc 20:00 mỗi ngày với một từ cần ôn. Đổi giờ hoặc tắt trong Cá nhân → Thông báo nhắc ôn.")
                    .font(WordlyFonts.body(14)).foregroundStyle(WordlyColors.inkSoft).multilineTextAlignment(.center)
                Button {
                    Task { _ = await PushManager.shared.enableDailyDefault(); vm.offerPushReminder = false }
                } label: {
                    Text("Bật").font(WordlyFonts.body(15, weight: .bold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                }
                .background(WordlyColors.electric).foregroundStyle(WordlyColors.onElectric).clipShape(RoundedRectangle(cornerRadius: 12))
                Button("Để sau") { vm.offerPushReminder = false }.foregroundStyle(WordlyColors.inkSoft)
            }
            .padding(24)
            .presentationDetents([.medium])
        }
```

- [ ] **Step 3: Khai Device ID trong `PrivacyInfo.xcprivacy`**

Thêm vào mảng `NSPrivacyCollectedDataTypes` (cùng dạng các mục có sẵn):

```xml
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeDeviceID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
```

Kiểm: `plutil -lint mobile/ios/WordlyiOS/PrivacyInfo.xcprivacy` → OK.

- [ ] **Step 4: Build + unit test + xem trên simulator** — xoá app, cài lại, đăng nhập, dịch + Lưu một từ → sheet hiện **một lần**; lưu từ thứ hai → không hiện. (Chưa có plist Firebase → không hiện, đúng logic `pushAvailable`.)

- [ ] **Step 5: Commit**

```bash
git add mobile/ios/WordlyiOS/Features/Translate/TranslateViewModel.swift mobile/ios/WordlyiOS/Features/Translate/TranslateView.swift mobile/ios/WordlyiOS/PrivacyInfo.xcprivacy
git commit -m "feat(ios): hỏi bật nhắc ôn đúng một lần sau khi lưu từ (không xin quyền lúc mở app) + khai Device ID cho App Privacy"
```

---

### Task 17: Kiểm chứng toàn bộ, tài liệu, chuẩn bị triển khai

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Kiểm chứng web**

```bash
cd web && npm test && npm run test:rls && npx next build && npx eslint src/lib/push src/lib/reminders src/app/api/push src/app/api/email-slots src/app/api/cron
```

Expected: test + RLS PASS (ghi số), "Compiled successfully", eslint sạch.

- [ ] **Step 2: Kiểm chứng iOS** — toàn bộ `WordlyiOSTests` + UI test deep link (một simulator). Ghi số.

- [ ] **Step 3: Thử thật trên máy (cần chủ dự án — xem Step 5)**: build Debug lên iPhone thật có `GoogleService-Info.plist`, server local hoặc production đã có migration: bật thông báo, đặt khung giờ mốc gần nhất → nhận thông báo; bấm → mở đúng từ; đăng xuất → không nhận nữa; đăng nhập tài khoản khác cùng máy → chỉ nhận của người mới.

- [ ] **Step 4: Cập nhật `PROGRESS.md`** — mục mới đầu file: những gì xong + bằng chứng (số test, build), phần **chưa kiểm** (FCM thật, máy thật, migration production), nợ kỹ thuật email (spec mục 10), các cửa còn chờ.

- [ ] **Step 5: Dừng — chuyển cho chủ dự án các bước sau (KHÔNG tự làm):**
  1. Apple Developer: tạo key APNs (`.p8`); App ID `com.thientran.wordly` bật Push Notifications.
  2. Firebase console (tài khoản `huythien712`, gắn Google Cloud project Wordly `gen-lang-client-0661352497`): thêm app iOS, tải `GoogleService-Info.plist` vào `mobile/ios/WordlyiOS/App/`, tải `.p8` lên Cloud Messaging, tạo service account quyền *Firebase Cloud Messaging API Admin*.
  3. **[Cửa]** chạy migration `20261014000100_push_notifications.sql` lên production (một transaction) + `notify pgrst, 'reload schema'`.
  4. Đưa `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_BASE64` lên VPS bằng `atlas-secret-handoff`.
  5. **[Cửa]** deploy production bằng nút *Deploy — production*; kiểm `/api/health` đúng commit, `send-emails-cron.log` có khoá `push` không lỗi.
  6. **[Cửa]** build 16 lên TestFlight khi được lệnh; khai **Device ID** (App Functionality, linked, không tracking) trên App Store Connect trước khi nộp.

- [ ] **Step 6: Commit + PR**

```bash
git add PROGRESS.md
git commit -m "docs: tiến độ push notification — code + test xong, chờ cấu hình Firebase/APNs và các cửa migration/deploy/TestFlight"
```

PR tạo khi chủ dự án yêu cầu (`gh pr create` — tiêu đề `feat(push): thông báo nhắc ôn từ qua FCM + giờ nhắc mốc 30 phút`, mô tả ngắn: đổi gì, vì sao).
