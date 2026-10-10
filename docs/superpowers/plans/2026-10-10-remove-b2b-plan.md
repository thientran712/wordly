# Xóa hẳn tính năng B2B ("trung tâm tiếng Anh") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xóa toàn bộ schema, route, component, lib liên quan tính năng B2B
(trung tâm/lớp/giáo viên/học sinh/học phí) khỏi Wordly, dọn 2 điểm chạm vào
core B2C (route quiz, trang join lớp), và tắt Custom Access Token Hook —
đưa repo về B2C thuần, không ảnh hưởng chức năng B2C hiện có.

**Architecture:** Xóa theo lớp từ ngoài vào trong: trước tiên tắt hook ở
Supabase Dashboard (tay, ngoài code — làm TRƯỚC để không ai bị lock-out khi
hook bị xóa khỏi DB), rồi 1 migration SQL DROP toàn bộ bảng/function B2B,
rồi xóa file/thư mục web theo nhóm (routes → components → lib), cuối cùng
sửa 2 điểm chạm core (`api/quiz/route.js`, test helper) và xóa
`join/page.js` + `api/join/route.js`.

**Tech Stack:** Next.js 16 (route handlers), Supabase Postgres (migration
SQL thủ công qua SQL Editor — theo quy ước hiện tại của repo, không có
migration runner tự động), `node --test` cho unit/RLS test.

**Spec:** `docs/superpowers/specs/2026-10-10-remove-b2b-design.md`

## Global Constraints

- Tất cả lệnh `npm` chạy từ `web/` (không chạy từ gốc repo).
- Commit message tiếng Việt, nêu lý do; KHÔNG thêm `Co-Authored-By`.
- `git add <đường dẫn cụ thể>` — không `git add -A` (có WIP của session khác
  trong working tree: `web/src/lib/translate/`, `web/src/lib/ai/ai-models.js`
  (modified), `web/tests/unit/image-validation.test.mjs`,
  `web/tests/unit/parse-image-translate-response.test.mjs` — KHÔNG đụng,
  KHÔNG commit các file này).
- Không chạy migration lên production/staging trong plan này — plan chỉ
  viết migration SQL + xóa code trên branch `chore/remove-b2b`; chạy migration
  thật trên Supabase Cloud là bước RIÊNG, cần xác nhận của chủ dự án trước
  khi thực thi (ngoài phạm vi các task dưới — task cuối chỉ chuẩn bị file
  migration, không tự ý chạy).
- Tắt Custom Access Token Hook trên Supabase Dashboard là thao tác THỦ CÔNG
  ngoài code — plan ghi rõ bước này nhưng không thể tự động hóa; người thực
  thi phải tự vào Dashboard làm, plan chỉ nhắc khi nào làm.
- Mọi lệnh test dùng `npm test` (toàn bộ) sau mỗi task xóa lớn để bắt sớm
  import còn sót trỏ tới file đã xóa.

## Review Focus

- **Import còn sót trỏ tới file đã xóa** — `next build` sẽ fail runtime
  module-not-found nếu còn file nào `import` từ `@/lib/org/*`,
  `@/lib/tuition/*`, `@/components/org/*` sau khi xóa. Task 6 chạy build
  để bắt lỗi này.
- **Route quiz B2C bị hỏng khi gỡ nhánh B2B** — người dùng B2C bình thường
  (không có `class_id`) phải vẫn tạo quiz và nộp kết quả y hệt trước đây.
  Task 3 có test xác nhận cả luồng GET và POST khi không gửi `class_id`.
- **`/api/speaking` (B2B) dễ nhầm với `/speak` (B2C Spinner)** — xóa nhầm
  route Spinner B2C sẽ làm mất tính năng luyện nói công khai. Task 1 liệt
  kê rõ đường dẫn chính xác trước khi xóa, Task 6 build-check xác nhận
  `/speak` vẫn còn route.
- **Test helper `cleanupOrgs`/`refreshUser`/`jwtClaims` bị xóa nhưng còn
  test khác import** — `suggestion-log-isolation.test.mjs` dùng chung file
  helper, chỉ dùng `createTestUser`/`cleanupUsers`/`skipReason`/`adminClient`
  (không dùng 3 hàm org-only). Task 5 xóa đúng 3 hàm, giữ phần còn lại, rồi
  chạy test đó để xác nhận không hỏng.
- **Thứ tự tắt hook vs. xóa function SQL** — nếu function
  `custom_access_token_hook` bị DROP trước khi hook được tắt trên Dashboard,
  MỌI user (cả B2C) không đăng nhập được. Task 7 ghi rõ thứ tự bắt buộc:
  tắt hook (thủ công) → verify login vẫn OK → mới chạy migration DROP.

---

## Task 1: Xóa route groups & API routes B2B (web)

**Files:**
- Delete: `web/src/app/(org)/` (toàn bộ thư mục — gồm `org/page.js`,
  `org/classes/[id]/page.js`, `tuition/payment-result/page.js`)
- Delete: `web/src/app/api/orgs/` (toàn bộ)
- Delete: `web/src/app/api/classes/` (toàn bộ)
- Delete: `web/src/app/api/homework/` (toàn bộ)
- Delete: `web/src/app/api/speaking/` (toàn bộ — **CHÚ Ý**: đây là
  `web/src/app/api/speaking/route.js` và `web/src/app/api/speaking/[id]/`,
  KHÁC với `web/src/app/(learner)/speak/` — route Spinner B2C, **KHÔNG xóa**
  cái sau)
- Delete: `web/src/app/api/materials/` (toàn bộ)
- Delete: `web/src/app/api/tuition/` (toàn bộ)
- Delete: `web/src/app/api/ai/generate-homework/`
- Delete: `web/src/app/api/ai/generate-speaking/`
- Delete: `web/src/app/api/ai/grade-essay/`
- Delete: `web/src/app/api/ai/grade-speaking/`

**Interfaces:** Không có — đây là xóa file thuần, không có code mới tạo ra
interface cho task sau. Task 3 (sửa `api/quiz/route.js`) và Task 4 (xóa
`join/page.js` + `api/join/route.js`) độc lập với task này.

- [ ] **Step 1: Xác nhận đường dẫn chính xác trước khi xóa**

```bash
cd "web"
ls -la "src/app/(org)" src/app/api/orgs src/app/api/classes src/app/api/homework src/app/api/speaking src/app/api/materials src/app/api/tuition src/app/api/ai/generate-homework src/app/api/ai/generate-speaking src/app/api/ai/grade-essay src/app/api/ai/grade-speaking
ls "src/app/(learner)/speak"   # phải vẫn tồn tại — route Spinner B2C, KHÔNG được nằm trong danh sách xóa trên
```

Expected: tất cả đường dẫn liệt kê ở "Files" tồn tại; `(learner)/speak`
cũng tồn tại và không trùng với `api/speaking`.

- [ ] **Step 2: Xóa các thư mục**

```bash
cd "web"
git rm -r "src/app/(org)"
git rm -r src/app/api/orgs
git rm -r src/app/api/classes
git rm -r src/app/api/homework
git rm -r src/app/api/speaking
git rm -r src/app/api/materials
git rm -r src/app/api/tuition
git rm -r src/app/api/ai/generate-homework
git rm -r src/app/api/ai/generate-speaking
git rm -r src/app/api/ai/grade-essay
git rm -r src/app/api/ai/grade-speaking
```

- [ ] **Step 3: Commit**

```bash
cd "web"
git add -u "src/app/(org)" src/app/api/orgs src/app/api/classes src/app/api/homework src/app/api/speaking src/app/api/materials src/app/api/tuition src/app/api/ai
git commit -m "chore: xóa route B2B (org, classes, homework, speaking, materials, tuition)"
```

---

## Task 2: Xóa lib & components B2B (web)

**Files:**
- Delete: `web/src/lib/org/` (toàn bộ — `org-context.js`, `org-settings.js`,
  `user-orgs.js`, `guardian-links.js`, `invite-validation.js`,
  `progress-privacy.js`, `settings-validation.js`)
- Delete: `web/src/lib/tuition/` (toàn bộ — `tuition-calc.js`, `vnpay.js`)
- Delete: `web/src/components/org/` (toàn bộ — `AssignmentsPanel.js`,
  `GuardiansPanel.js`, `HomeworkPanel.js`, `LessonLibrary.js`,
  `MembersPanel.js`, `OrgShell.js`, `QuizStatsPanel.js`, `SettingsPanel.js`,
  `SpeakingPanel.js`, `TuitionPanel.js`, `VnpayConfigCard.js`)
- Delete: `web/tests/unit/homework-grading.test.mjs`
- Delete: `web/tests/unit/tuition-calc.test.mjs`
- Delete: `web/tests/unit/user-orgs.test.mjs`

**Interfaces:** Không có (xóa thuần). Task 3 sẽ KHÔNG import gì từ các thư
mục này nữa sau khi hoàn tất — route quiz tự định nghĩa `isUuid` riêng.

- [ ] **Step 1: Xóa**

```bash
cd "web"
git rm -r src/lib/org src/lib/tuition src/components/org
git rm tests/unit/homework-grading.test.mjs tests/unit/tuition-calc.test.mjs tests/unit/user-orgs.test.mjs
```

- [ ] **Step 2: Commit**

```bash
cd "web"
git commit -m "chore: xóa lib và components B2B (org, tuition)"
```

---

## Task 3: Gỡ nhánh B2B khỏi route quiz (core B2C)

**Files:**
- Modify: `web/src/app/api/quiz/route.js`

**Interfaces:**
- Consumes: không còn import `isUuid` từ `@/lib/org/org-context` (đã xóa ở
  Task 2) — định nghĩa `isUuid` cục bộ trong file này.
- Produces: `GET /api/quiz` trả `{ questions, mode }` (bỏ field `class_id`
  khỏi response — không còn ý nghĩa); `POST /api/quiz` insert
  `quiz_attempts` chỉ với `user_id` (bỏ `class_id`/`org_id`/`membership_id`).

- [ ] **Step 1: Viết test xác nhận quiz hoạt động bình thường không có class_id**

Thêm vào cuối `web/tests/unit/quiz-generation.test.mjs` (file test logic
thuần đã có, giữ nguyên các test cũ, chỉ thêm test mới xác nhận
`buildQuizQuestions`/`scoreQuiz` không cần biết gì về class/org — đây đã
đúng từ trước, nhưng cần test tích hợp cho chính route). Vì route là
Next.js route handler (cần mock Supabase phức tạp), task này viết test ở
mức "đọc code xác nhận không còn import org" thay vì integration test đầy
đủ — xem Step 3.

- [ ] **Step 2: Sửa route**

Trong `web/src/app/api/quiz/route.js`:

Xóa dòng import:
```javascript
import { isUuid } from "@/lib/org/org-context";
```

Thay bằng định nghĩa cục bộ (đặt ngay dưới các import khác, trước
`const MAX_QUESTIONS = 20;`):
```javascript
/** UUID v4 hợp lệ — dùng để lọc word_id client gửi lên trước khi query DB. */
function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
```

Trong hàm `GET`, xóa dòng:
```javascript
const classId = url.searchParams.get("class_id");
```
và trong object trả về, xóa field:
```javascript
    class_id: isUuid(classId) ? classId : null,
```
(để lại `return Response.json({ questions: safeQuestions, mode });`)

Trong hàm `POST`, xóa khỏi destructure:
```javascript
  const { answers, mode, class_id, duration_ms } = body || {};
```
sửa thành:
```javascript
  const { answers, mode, duration_ms } = body || {};
```

Xóa toàn bộ block:
```javascript
  // Lưu lượt chơi. Nếu thuộc một lớp thì gắn org/membership để giáo viên
  // theo dõi được.
  let orgId = null;
  let membershipId = null;

  if (isUuid(class_id)) {
    const { data: klass } = await supabase
      .from("classes")
      .select("id, org_id")
      .eq("id", class_id)
      .maybeSingle();

    if (klass) {
      orgId = klass.org_id;
      const { data: m } = await supabase
        .from("memberships")
        .select("id")
        .eq("org_id", klass.org_id)
        .eq("user_id", user.id)
        .maybeSingle();
      membershipId = m?.id || null;
    }
  }
```

Sửa `insert` của `quiz_attempts` từ:
```javascript
  const { error: saveErr } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    class_id: orgId ? class_id : null,
    org_id: orgId,
    membership_id: membershipId,
    mode,
```
thành:
```javascript
  const { error: saveErr } = await supabase.from("quiz_attempts").insert({
    user_id: user.id,
    mode,
```

(giữ nguyên các field còn lại: `total`, `correct`, `percent`, `duration_ms`,
`word_results`)

`isUuid` vẫn còn dùng ở 3 chỗ khác trong file (lọc `wordIds`) — các dòng đó
KHÔNG đổi, chỉ đổi nguồn import thành hàm cục bộ.

- [ ] **Step 3: Xác nhận bằng test hiện có + đọc lại file**

```bash
cd "web"
npm test 2>&1 | tail -30
```

Expected: PASS toàn bộ (file test logic quiz không test trực tiếp route
HTTP, nên không có test mới cụ thể cho bước này — xác nhận bằng cách đọc
lại `api/quiz/route.js` không còn tham chiếu `class_id`/`org_id`/
`membership_id`/`classes`/`memberships` nào sót lại):

```bash
grep -n "class_id\|org_id\|membership_id\|from(\"classes\")\|from(\"memberships\")" src/app/api/quiz/route.js
```

Expected: không có kết quả nào (empty output).

- [ ] **Step 4: Commit**

```bash
cd "web"
git add src/app/api/quiz/route.js
git commit -m "fix(quiz): gỡ nhánh B2B (class_id/org_id/membership_id) khỏi route quiz"
```

---

## Task 4: Xóa trang join lớp (B2C route group nhưng UI B2B thuần)

**Files:**
- Delete: `web/src/app/(learner)/join/page.js`
- Delete: `web/src/app/api/join/route.js`

**Interfaces:** Không có phụ thuộc — `(org)/org/page.js` (đã xóa ở Task 1)
là nơi DUY NHẤT link tới `/join` trong toàn bộ `web/src`.

- [ ] **Step 1: Xác nhận không còn link nào tới /join**

```bash
cd "web"
grep -rn "/join" src --include="*.js"
```

Expected: không có kết quả nào (vì `(org)/org/page.js` đã xóa ở Task 1).
Nếu còn kết quả, dừng lại và kiểm tra trước khi xóa — nghĩa là có chỗ khác
(ngoài B2B) đang link tới `/join` mà khảo sát ban đầu chưa phát hiện.

- [ ] **Step 2: Xóa**

```bash
cd "web"
git rm "src/app/(learner)/join/page.js"
git rm src/app/api/join/route.js
```

- [ ] **Step 3: Commit**

```bash
cd "web"
git commit -m "chore: xóa trang và API join lớp (B2B)"
```

---

## Task 5: Dọn test helper — xóa hàm chỉ dùng cho B2B, giữ hàm B2C dùng chung

**Files:**
- Modify: `web/tests/helpers/supabase-test-client.mjs`
- Delete: `web/tests/rls/tenant-isolation.test.mjs`

**Interfaces:**
- Consumes: không có.
- Produces: `supabase-test-client.mjs` export `skipReason`, `adminClient`,
  `createTestUser`, `cleanupUsers` (không đổi) — KHÔNG còn export
  `refreshUser`, `jwtClaims`, `cleanupOrgs`. File
  `suggestion-log-isolation.test.mjs` (giữ nguyên, không sửa) tiếp tục hoạt
  động vì chỉ dùng 4 hàm còn lại.

- [ ] **Step 1: Xác nhận không file nào khác dùng 3 hàm sắp xóa**

```bash
cd "web"
grep -rln "cleanupOrgs\|refreshUser\|jwtClaims" tests --include="*.mjs"
```

Expected: chỉ `tests/helpers/supabase-test-client.mjs` (định nghĩa) và
`tests/rls/tenant-isolation.test.mjs` (sẽ xóa). Nếu có file khác, dừng lại
và xem lại phạm vi trước khi xóa.

- [ ] **Step 2: Xóa test B2B + 3 hàm helper B2B-only**

```bash
cd "web"
git rm tests/rls/tenant-isolation.test.mjs
```

Trong `web/tests/helpers/supabase-test-client.mjs`, xóa 3 khối hàm sau
(giữ nguyên mọi hàm khác và comment xung quanh không liên quan):

```javascript
/** Buộc lấy JWT mới — cần sau khi đổi membership vì org context nằm trong token. */
export async function refreshUser(user) {
  const { error } = await user.client.auth.refreshSession();
  if (error) throw new Error(`refresh session thất bại: ${error.message}`);
}

/** Đọc custom claims trong JWT hiện tại (để kiểm tra hook nhúng org context). */
export async function jwtClaims(user) {
  const { data } = await user.client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
```

và:

```javascript
/** Xoá các org test theo id. */
export async function cleanupOrgs(...orgIds) {
  const admin = adminClient();
  for (const id of orgIds.filter(Boolean)) {
    try {
      await admin.from("organizations").delete().eq("id", id);
    } catch {
      // bỏ qua
    }
  }
}
```

- [ ] **Step 3: Chạy test RLS còn lại để xác nhận không hỏng**

```bash
cd "web"
npm run test:rls 2>&1 | tail -30
```

Expected: `suggestion-log-isolation.test.mjs` PASS (hoặc SKIP nếu không có
Supabase local chạy — kiểm tra output ghi rõ "Bỏ qua" không phải lỗi import).
Nếu thấy lỗi `refreshUser is not a function` hay tương tự nghĩa là còn file
nào đó dùng hàm đã xóa — quay lại Step 1 kiểm tra lại.

- [ ] **Step 4: Commit**

```bash
cd "web"
git add tests/helpers/supabase-test-client.mjs
git commit -m "chore(test): xóa test cô lập tenant + helper B2B-only (refreshUser, jwtClaims, cleanupOrgs)"
```

---

## Task 6: Build + lint toàn bộ, xác nhận không còn tham chiếu B2B

**Files:** Không tạo/sửa file mới — task thuần kiểm chứng.

**Interfaces:** Không có.

- [ ] **Step 1: Grep toàn bộ import còn sót**

```bash
cd "web"
grep -rn "@/lib/org/\|@/lib/tuition/\|@/components/org/" src tests
```

Expected: không có kết quả nào. Nếu có, quay lại task tương ứng xử lý file
đó trước khi tiếp tục.

- [ ] **Step 2: Chạy toàn bộ test**

```bash
cd "web"
npm test 2>&1 | tail -40
```

Expected: PASS toàn bộ (số lượng test giảm so với trước — đúng vì đã xóa
test B2B: `homework-grading`, `tuition-calc`, `user-orgs`,
`tenant-isolation`). Không có FAIL.

- [ ] **Step 3: Build**

```bash
cd "web"
npx next build 2>&1 | tail -60
```

Expected: "Compiled successfully". Danh sách route KHÔNG còn `/org`,
`/org/classes/[id]`, `/tuition`, `/tuition/payment-result`, `/join`, và
mọi route `/api/orgs/*`, `/api/classes/*`, `/api/homework/*`,
`/api/speaking/*` (B2B), `/api/materials/*`, `/api/tuition/*`, `/api/join`,
`/api/ai/generate-homework`, `/api/ai/generate-speaking`,
`/api/ai/grade-essay`, `/api/ai/grade-speaking`. Route `/speak` (Spinner
B2C) PHẢI vẫn còn trong danh sách.

- [ ] **Step 4: Lint**

```bash
cd "web"
npx eslint src/app/api/quiz/route.js tests/helpers/supabase-test-client.mjs
```

Expected: sạch (không lỗi mới — nếu có lỗi có sẵn từ trước không liên quan
tới thay đổi này, ghi rõ là lỗi có sẵn, không tự sửa ngoài phạm vi).

- [ ] **Step 5: Không commit gì ở task này** (task thuần kiểm chứng, không
tạo thay đổi file).

---

## Task 7: Viết migration SQL xóa bảng/function B2B (KHÔNG tự chạy lên production)

**Files:**
- Create: `supabase/migrations/20261010000100_remove_b2b.sql`

**Interfaces:** Không có — file SQL độc lập, chuẩn bị sẵn để chủ dự án tự
chạy qua Supabase SQL Editor theo đúng thứ tự ghi trong spec (tắt hook
Dashboard TRƯỚC, chạy migration SAU).

- [ ] **Step 1: Viết migration (idempotent — dùng IF EXISTS theo quy ước repo)**

```sql
-- Xóa hẳn tính năng B2B ("trung tâm tiếng Anh") — xem
-- docs/superpowers/specs/2026-10-10-remove-b2b-design.md
--
-- THỨ TỰ BẮT BUỘC TRƯỚC KHI CHẠY FILE NÀY:
--   1. Vào Supabase Dashboard → Auth → Hooks → tắt "Customize Access Token
--      (JWT) Claims" (hook đang gọi custom_access_token_hook()).
--   2. Thử đăng nhập 1 tài khoản test, xác nhận JWT không còn claim
--      user_orgs nhưng login vẫn thành công.
--   3. CHỈ SAU KHI (1) và (2) xác nhận OK mới chạy migration này.
--
-- Chạy SAI thứ tự (migration trước khi tắt hook) sẽ khiến MỌI user — kể cả
-- B2C — không đăng nhập được, vì hook vẫn gọi function đã bị xóa.

-- ── Functions (xóa trước vì bảng phụ thuộc vào chúng qua trigger/policy) ──
DROP FUNCTION IF EXISTS custom_access_token_hook(jsonb);
DROP FUNCTION IF EXISTS jwt_org_role(uuid);
DROP FUNCTION IF EXISTS is_org_member(uuid);
DROP FUNCTION IF EXISTS is_org_owner(uuid);
DROP FUNCTION IF EXISTS is_org_staff(uuid);
DROP FUNCTION IF EXISTS check_video_quota(uuid);
DROP FUNCTION IF EXISTS set_vnpay_secret(uuid, text);
DROP FUNCTION IF EXISTS get_vnpay_secret(uuid);

-- ── Bảng con trước, bảng cha sau (thứ tự khóa ngoại) ──
DROP TABLE IF EXISTS assignment_deliveries;
DROP TABLE IF EXISTS class_assignments;
DROP TABLE IF EXISTS homework_submissions;
DROP TABLE IF EXISTS homework;
DROP TABLE IF EXISTS speaking_submissions;
DROP TABLE IF EXISTS speaking_prompts;
DROP TABLE IF EXISTS guardian_links;
DROP TABLE IF EXISTS student_progress_snapshots;
DROP TABLE IF EXISTS vnpay_transactions;
DROP TABLE IF EXISTS org_payment_configs;
DROP TABLE IF EXISTS tuition_payments;
DROP TABLE IF EXISTS tuition_records;
DROP TABLE IF EXISTS org_storage_usage;
DROP TABLE IF EXISTS org_video_usage;
DROP TABLE IF EXISTS lesson_materials;
DROP TABLE IF EXISTS class_sessions;
DROP TABLE IF EXISTS org_field_defs;
DROP TABLE IF EXISTS org_features;
DROP TABLE IF EXISTS org_settings;
DROP TABLE IF EXISTS class_members;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS organizations;

-- ── quiz_attempts: giữ bảng (dùng cho B2C), chỉ bỏ 3 cột B2B ──
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS org_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS class_id;
ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS membership_id;
```

- [ ] **Step 2: Commit (chỉ commit file migration, KHÔNG chạy nó)**

```bash
cd ..
git add supabase/migrations/20261010000100_remove_b2b.sql
git commit -m "chore(db): migration xóa bảng/function B2B — CHƯA chạy, cần tắt hook Dashboard trước"
```

- [ ] **Step 3: Báo cáo rõ cho chủ dự án — KHÔNG tự chạy**

Ghi chú cuối task (không phải lệnh chạy): migration này chỉ được tạo ra,
CHƯA áp dụng lên bất kỳ environment nào. Chủ dự án phải tự thực hiện theo
đúng thứ tự ghi trong comment đầu file (tắt hook Dashboard → verify login →
chạy migration qua SQL Editor) khi họ quyết định thời điểm triển khai —
đây là hành động không thể hoàn tác (DROP TABLE), ngoài phạm vi tự động
hóa của plan này theo đúng quy tắc "không chạy migration khi chưa được
đồng ý" của dự án.

---

## Task 8: Cập nhật PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

**Interfaces:** Không có.

- [ ] **Step 1: Thêm mục mới vào đầu PROGRESS.md** (theo mẫu các mục hiện
có trong file, ghi ngày 2026-10-10)

Nội dung cần có: đã xóa code B2B khỏi branch `chore/remove-b2b` (routes,
lib, components, test); route quiz đã gỡ nhánh B2B, test pass, build sạch;
migration SQL đã viết (`supabase/migrations/20261010000100_remove_b2b.sql`)
nhưng **CHƯA CHẠY** lên bất kỳ environment nào — cần chủ dự án tắt Custom
Access Token Hook trên Dashboard trước, theo đúng thứ tự ghi trong file
migration; mục "Chờ quyết định": thời điểm chạy migration thật.

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: ghi nhận đã xóa code B2B, migration chờ chạy"
```
