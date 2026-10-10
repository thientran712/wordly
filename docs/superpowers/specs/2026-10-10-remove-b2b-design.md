# Thiết kế: Xóa hẳn tính năng B2B ("trung tâm tiếng Anh") khỏi Wordly

**Ngày:** 2026-10-10
**Trạng thái:** Chờ duyệt
**Liên quan:** `docs/superpowers/specs/2026-10-10-vps-self-hosted-infra-design.md`
(việc xóa B2B làm TRƯỚC, đơn giản hóa phạm vi cho việc chuyển hạ tầng VPS)

## 1. Mục tiêu & phạm vi

Wordly có tính năng B2B "trung tâm tiếng Anh" (tổ chức/lớp/giáo viên/học
sinh/học phí) đã xây dựng đầy đủ (32 commit, merged vào `main`) nhưng đang
**TẠM DỪNG** — không có lối vào UI (xem `PROGRESS.md`). Chủ dự án quyết định
bỏ hẳn, tập trung hoàn toàn vào B2C (người học cá nhân).

**Trong phạm vi:** xóa toàn bộ bảng, route, component, lib, migration liên
quan B2B khỏi repo; dọn 2 điểm chạm vào core B2C (route quiz, trang join
lớp); tắt Custom Access Token Hook trên Supabase Dashboard.

**Ngoài phạm vi:** không đổi gì ở hạ tầng (Vercel/Supabase Cloud vẫn như
hiện tại — đó là spec riêng, làm sau việc này). Không đổi tính năng B2C nào
ngoài việc gỡ phần code B2B lồng trong route quiz.

## 2. Phạm vi xóa (dựa trên khảo sát thực tế ngày 2026-10-10)

### 2.1. Database — xóa bảng + function

Migration mới (`supabase/migrations/`) sẽ **DROP** các bảng sau (theo thứ
tự phụ thuộc khóa ngoại, con trước cha):

```
assignment_deliveries, class_assignments, homework_submissions, homework,
speaking_submissions, speaking_prompts, guardian_links,
student_progress_snapshots, vnpay_transactions, org_payment_configs,
tuition_payments, tuition_records, org_storage_usage, org_video_usage,
lesson_materials, class_sessions, org_field_defs, org_features,
org_settings, class_members, classes, memberships, organizations
```

Functions xóa: `custom_access_token_hook`, `jwt_org_role`, `is_org_member`,
`is_org_owner`, `is_org_staff`, `check_video_quota`, `set_vnpay_secret`,
`get_vnpay_secret`.

**Giữ bảng `quiz_attempts`** (dùng cho B2C) nhưng **DROP 3 cột**: `org_id`,
`class_id`, `membership_id` (luôn null với B2C, không còn ý nghĩa sau khi
B2B biến mất).

### 2.2. Web code — xóa file/thư mục

- `web/src/app/(org)/` — toàn bộ route group (trang `/org`, `/org/classes/[id]`,
  `/tuition`, `/tuition/payment-result`).
- `web/src/app/api/orgs/`, `web/src/app/api/classes/`, `web/src/app/api/homework/`,
  `web/src/app/api/speaking/` (xác nhận: route B2B riêng, không trùng `/speak`
  B2C), `web/src/app/api/materials/`, `web/src/app/api/tuition/`,
  `web/src/app/api/join/`.
- `web/src/app/api/ai/generate-homework/`, `generate-speaking/`,
  `grade-essay/`, `grade-speaking/`.
- `web/src/lib/org/` (toàn bộ: `org-context.js`, `org-settings.js`,
  `user-orgs.js`, `guardian-links.js`, `invite-validation.js`,
  `progress-privacy.js`, `settings-validation.js`).
- `web/src/lib/tuition/` (toàn bộ: `tuition-calc.js`, `vnpay.js`).
- `web/src/components/org/` (toàn bộ: `AssignmentsPanel.js`,
  `LessonLibrary.js`, `QuizStatsPanel.js`, `TuitionPanel.js`).
- `web/src/app/(learner)/join/page.js` — trang "nhập mã lớp", nằm lẫn
  trong route group B2C nhưng là UI B2B thuần.
- Mọi file test tương ứng các file/thư mục trên trong `web/tests/`.

### 2.3. Điểm chạm vào core B2C — sửa, không xóa file

**`web/src/app/api/quiz/route.js`** — route quiz chính cho mọi user. Bỏ:
- `import { isUuid } from "@/lib/org/org-context"`.
- Logic nhận `class_id` optional từ query/body.
- Logic lookup `classes`/`memberships` và gắn `org_id`/`membership_id` vào
  insert `quiz_attempts`.

Sau khi sửa, route quiz chỉ còn insert `quiz_attempts` với `user_id` — y
hệt hành vi B2C hiện tại, chỉ bỏ nhánh B2B optional.

### 2.4. Auth hook — tắt trên Supabase Dashboard

Sau khi xóa function `custom_access_token_hook` khỏi DB, phải **vào
Supabase Dashboard → Auth → Hooks → tắt "Customize Access Token (JWT)
Claims"** — nếu không tắt, Supabase sẽ lỗi khi cấp JWT vì gọi function đã
không còn tồn tại (mọi login sẽ fail). Đây là bước thủ công ngoài code,
phải làm **cùng lúc** với migration drop function, không được lệch thời
điểm.

### 2.5. iOS — không cần sửa gì

Khảo sát xác nhận: không có code Swift nào tham chiếu org/class/student/
teacher/trung tâm. Không cần build lại app.

## 3. Thứ tự thực hiện (để tránh downtime/lỗi auth)

Thứ tự migration + tắt hook rất quan trọng — làm sai thứ tự sẽ khiến
**toàn bộ user (cả B2C) không đăng nhập được** (vì hook JWT gọi function
đã bị xóa):

1. Tắt hook trên Supabase Dashboard TRƯỚC (Customize Access Token Claims
   → Disable).
2. Verify: thử đăng nhập test, JWT không còn claim `user_orgs` nhưng login
   vẫn thành công.
3. Chạy migration DROP functions + DROP tables + DROP 3 cột `quiz_attempts`.
4. Sửa code (`api/quiz/route.js`), xóa file/thư mục theo mục 2.2.
5. Chạy test suite, build, lint.
6. Deploy.

## 4. Kiểm chứng

- `npm test` toàn bộ phải pass sau khi xóa (test B2B bị xóa cùng file,
  test B2C không được fail — đặc biệt test route quiz).
- `npx next build` sạch — không còn import nào trỏ tới file đã xóa.
- `npx eslint` sạch trên các file đã sửa.
- Thử đăng nhập + quiz + dịch + lưu từ bằng tài khoản thật sau khi tắt hook
  — xác nhận không ai bị 401/500.
- Kiểm tra JWT của user test sau khi tắt hook: không còn claim `user_orgs`.

## 5. Rủi ro

- **Sai thứ tự (migration trước, tắt hook sau)** → toàn bộ user không đăng
  nhập được trong khoảng thời gian đó. Mục 3 đã quy định rõ thứ tự đúng.
- **Route trùng tên `/api/speaking`** — cần xác nhận lúc triển khai rằng
  `api/speaking/[id]/` (B2B, chấm bài nói cho học sinh) không trùng với
  `/speak` (B2C, Spinner luyện nói) — khảo sát ban đầu cho thấy đây là 2
  đường dẫn khác nhau (`speaking` số nhiều có `[id]` vs `speak` không),
  nhưng cần double-check thủ công trước khi xóa để chắc không xóa nhầm
  route B2C.
- **Dữ liệu người dùng demo/test** — nếu có dữ liệu thật trong các bảng
  B2B (ví dụ trung tâm demo đã bật 9/9 feature theo PROGRESS.md), DROP
  TABLE sẽ xóa vĩnh viễn. Cần xác nhận không còn ai dùng trước khi chạy
  migration trên production.
