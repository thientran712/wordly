# Tiến độ — Wordly for Business (B2B)

> **Đọc file này đầu mỗi phiên** để biết đang ở đâu.
> Quy chuẩn làm việc: `CLAUDE.md`. Thiết kế: `docs/superpowers/specs/`.

**Cập nhật:** 2026-09-03
**Branch:** `feat/b2b-multi-tenant` (chưa merge, chưa push)
**Môi trường:** migration ĐÃ chạy production (2026-09-03) — xem mục "Đã kiểm chứng trên production"
**Test:** 130/130 pass (logic thuần) + đã kiểm chứng RLS/hook trên production · build sạch · lint sạch trên toàn bộ file mới

---

## Trạng thái tổng quan

| Giai đoạn | Phạm vi | Backend | UI |
|---|---|---|---|
| **GĐ1** | Multi-tenant, lớp, dashboard GV, thư viện bài giảng | ✅ Xong | ✅ Xong |
| **GĐ1** | Mời thành viên, giao bộ từ | ✅ Xong | ✅ Xong |
| **GĐ2** | Bài tập (tạo/làm/chấm) | ✅ Xong | ✅ Xong |
| **GĐ2** | Quiz từ vựng | ✅ Xong | ✅ Xong |
| **GĐ4** | Học phí, công nợ | ✅ Xong | ✅ Xong |
| **GĐ3** | Báo cáo phụ huynh + quan hệ phụ huynh–HV | ✅ Xong | — gửi qua email |
| **GĐ4** | Chấm bài nói có audio | ✅ Xong | ⬜ Chưa |
| **GĐ3** | Thanh toán SaaS (cổng thanh toán) | ⬜ Chờ quyết định | ⬜ Chưa |
| **GĐ2** | Video upload trực tiếp | ⬜ Chờ quyết định dịch vụ | ⬜ Chưa |
| — | Cài đặt tổ chức, quota | ✅ Xong | ✅ Xong |
| — | Email mời thành viên | ✅ Xong | ✅ Xong |
| — | Xếp hạng quiz | ✅ Xong | ✅ Xong |
| — | Ghép đôi (match) trong bài tập | ✅ Xong | ✅ Xong |

> ✅ **ĐÃ KIỂM CHỨNG TRÊN PRODUCTION (2026-09-03).** Toàn bộ 9 migration
> chạy thành công, 13/13 bảng B2B tạo đủ, JWT hook đã bật và hoạt động,
> RLS chặn đúng, dữ liệu người dùng nguyên vẹn. Xem mục dưới.

---

## Đã xây (chi tiết)

### Migration (9 file, `supabase/migrations/`)

| File | Nội dung |
|---|---|
| `...000100_orgs_and_memberships` | organizations, memberships, **JWT hook**, RLS |
| `...000200_classes` | classes, class_members, mã lớp, `join_class_by_code()` |
| `...000300_org_customization` | org_settings, org_features, org_field_defs |
| `...000400_progress_snapshots` | snapshot tiến độ, `user_streak_days()` |
| `...000500_lesson_library` | class_sessions, lesson_materials, quota, Storage RLS |
| `...000600_class_assignments` | giao bộ từ, assignment_deliveries |
| `...000700_homework` | homework, homework_submissions |
| `...000800_quiz` | quiz_attempts |
| `...000900_tuition` | tuition_records, tuition_payments, view `tuition_balances` |

### Thư viện logic (có test)

| Module | Test | Chức năng |
|---|---|---|
| `material-validation.js` | 20 | Path traversal, link allowlist, giới hạn dung lượng |
| `invite-validation.js` | 11 | Chuẩn hoá danh sách email mời |
| `homework-grading.js` | 22 | Chấm tự động mcq/fill/match, lọc đáp án |
| `quiz-generation.js` | 18 | Sinh câu hỏi, chấm quiz |
| `tuition-calc.js` | 25 | Tính học phí, công nợ |
| `settings-validation.js` | 20 | Validate cấu hình tổ chức |
| `guardian-links.js` | 14 | Quan hệ phụ huynh, phân giải người nhận báo cáo |
| **Tổng** | **130** | |

Không có test (phụ thuộc DB/JWT, chỉ test được ở local):
`org-context.js`, `org-settings.js`

### API

**GĐ1:** `/api/orgs`, `/api/orgs/[id]/members`, `/api/classes`,
`/api/classes/[id]/progress`, `/api/classes/[id]/sessions`,
`/api/classes/[id]/assignments`, `/api/join`, `/api/materials`,
`/api/materials/upload-url`, `/api/materials/[id]/url`

**GĐ2:** `/api/homework`, `/api/homework/[id]/submit`,
`/api/homework/[id]/grade`, `/api/quiz`

**GĐ4:** `/api/tuition`, `/api/tuition/payments`

### UI

**Trang:** `/org` (dashboard tổ chức, tab Lớp/Thành viên),
`/org/classes/[id]` (tab Tiến độ · Bài giảng · Bài tập · Bộ từ · Học phí),
`/join` (nhập mã lớp), `/quiz` (quiz từ vựng).

**Component** (`src/components/org/`): `LessonLibrary`, `HomeworkPanel`,
`TuitionPanel`, `MembersPanel`, `AssignmentsPanel`.

Tab "Học phí" chỉ hiện với owner; tab Lớp/Thành viên chỉ hiện với staff.

### Inngest job

`computeProgressSnapshots` (cron ngày), `deliverAssignment` (event + cron),
`cleanupOrphanedFiles` (cron tuần), `syncStorageLimits` (cron ngày),
`sendParentReports` (cron CN, gác bởi feature flag).

### Email

`ParentReportEmail.js` — báo cáo phụ huynh, chỉ số liệu tiến độ.
`OrgInviteEmail.js` — mời thành viên, phân biệt đã/chưa có tài khoản.
`send-org-email.js` — dùng chung transporter Gmail sẵn có, không thêm dịch vụ.

---

## Còn thiếu

| Việc | Ghi chú |
|---|---|
| **2 migration mới CHƯA chạy production** | `20260904000100_guardian_links`, `20260904000200_speaking_review` |
| UI quản lý phụ huynh | API `/api/orgs/[id]/guardians` đã xong, thiếu màn hình |
| UI chấm bài nói | API `/api/speaking/*` đã xong, thiếu màn ghi âm + màn chấm |
| Video upload trực tiếp (GĐ2) | ⏸ Chờ anh quyết dịch vụ (khuyến nghị: dùng link YouTube/Drive) |
| Thanh toán SaaS (GĐ3) | ⏸ Chờ anh quyết cổng (khuyến nghị: 1-3 khách đầu thu ngoài hệ thống) |
| Rate limit `/api/translate`, `/api/dictionary` | Nợ kỹ thuật 🔴 — đang công khai, ai cũng đốt được quota |
| CI (GitHub Actions) | Chạy `npm test` + `next build` tự động |

---

## Vướng mắc

### 1. 🔴 SQL chưa được kiểm chứng — rủi ro lớn nhất

9 migration chỉ được kiểm **cân bằng cú pháp** (`$$`, ngoặc). Không có
Docker/psql trên máy dev nên **chưa chạy thật lần nào**. Có thể còn lỗi cú
pháp, lỗi thứ tự phụ thuộc, hoặc lỗi tên cột.

96 test unit đều là **logic thuần**, không chạm DB. 18 test RLS chưa từng chạy.

**Lần kiểm chứng thật đầu tiên** = khi chạy `npx supabase start` + `db reset`.

### 2. `db reset` sẽ lỗi ở migration 000400

Tham chiếu `translate_history` — bảng lõi không có `CREATE TABLE` trong repo.
Xem `docs/LOCAL-SETUP-B2B.md` mục 3 (Cách A: dump baseline; Cách B:
`scripts/b2b-local-baseline.sql`).

### 3. Hook JWT phải bật TRƯỚC khi chạy migration

Không bật → `user_orgs` rỗng → mọi policy chặn hết → trông như "không ai có
quyền gì". Local đã cấu hình sẵn trong `supabase/config.toml`.

---

## Chờ chủ dự án quyết định

| # | Việc | Vì sao |
|---|---|---|
| ~~1~~ | ~~Dump baseline schema~~ | ✅ XONG 2026-09-03 |
| ~~2~~ | ~~Bật custom access token hook~~ | ✅ XONG 2026-09-03 |
| 3 | **Dựng staging** | Cần tạo project Supabase mới, tốn phí |
| 4 | **Cổng thanh toán** (VNPay/MoMo/Stripe) | Khuyến nghị: 1-3 khách đầu thu ngoài hệ thống |
| 5 | **Dịch vụ video** (Cloudflare Stream/Mux/Bunny) | Khuyến nghị: dùng link YouTube/Drive trước |
| 6 | **Credential iOS** trong `APIClient.swift` | Chuyển sang cấu hình ngoài trước khi commit `wordly-ios/` |
| 7 | **Ưu tiên tiếp theo** | UI GĐ2-4 đã xong. Còn: cài đặt tổ chức, job báo cáo phụ huynh, email mời |

---

## Quyết định kiến trúc đã chốt

| Quyết định | Lý do |
|---|---|
| Shared DB + shared schema + RLS theo `org_id` | Chi phí không tăng theo số khách, deploy 1 lần |
| Ngữ cảnh org trong JWT | Nhanh + tránh đệ quy vô hạn trong policy |
| Dữ liệu học tập **không** mang `org_id` | HV giữ tiến độ khi rời trung tâm; GV thấy tiến độ chứ không đọc nhật ký |
| `memberships` là bảng trung tâm | Một người thuộc nhiều org, nhiều vai trò |
| Khả biến bằng dữ liệu, không bằng code riêng | Tránh `if (org === 'ABC')` và fork codebase |
| Quota lưu trữ ngay từ đầu | Lưu trữ là chi phí biến đổi lớn nhất, vượt cả AI |
| Tạo org chỉ qua service role | Onboarding là quy trình bán hàng có kiểm soát |
| Câu hỏi homework lưu JSONB | 4 loại câu hỏi cấu trúc rất khác nhau |
| Quiz KHÔNG lưu câu hỏi | Sinh từ kho từ sẵn có → chi phí ~0 |
| Tiền là BIGINT đồng, không float | Cộng float làm sai số tiền |
| `tuition_payments` bất biến | Sổ sách tài chính phải giữ nguyên lịch sử |
| Giáo viên không xem học phí | Phân tách nghiệp vụ tài chính |

---

## Lỗi đã phát hiện và sửa

| Lỗi | Cách phát hiện |
|---|---|
| Streak SQL sai dấu — mọi streak trả về 1 | Mô phỏng JS, đối chiếu 8 ca với thuật toán app |
| `git add -A` đưa credential iOS vào git history | Kiểm `git diff --stat` sau commit |
| `setState` đồng bộ trong `useEffect` | `npx eslint` |
| Query `organizations` sai cột (`org_id` → `id`) | Đọc lại code |
| Job dọn rác dùng `list()` không đệ quy → bỏ sót gần hết file | Tự soát logic |
| `download: x ? false : false` — luôn false | Tự soát logic |
| `reload()` reset trạng thái mở/đóng accordion | Tự soát UX |
| Import `stripAnswers` không dùng trong quiz route | eslint |
| `Date.now()` trong render path (React purity) | eslint |
| `require()` trong client component (TuitionPanel) | Tự soát trước khi build |
| `setState` đồng bộ trong effect khi chấm bài | eslint |

---

## Nợ kỹ thuật (từ PRODUCT.md)

| # | Việc | Ưu tiên | Trạng thái |
|---|---|---|---|
| 1 | Schema không tái tạo được từ repo | 🔴 | Chờ dump baseline |
| 2 | `/api/translate`, `/api/dictionary` không rate limit | 🔴 | Chưa sửa |
| 3 | `params` không `await` ở `practice/sessions/[id]` (route cũ) | 🔴 | Chưa sửa (ngoài phạm vi B2B) |
| 4 | Route cũ dùng service role bypass RLS | 🟡 | Route mới đã dùng anon+RLS |
| 5 | `word_ai_content.word_id` int vs `words.id` UUID | 🟡 | Chưa sửa |
| 6 | Workflow GitHub trỏ route đã xoá | 🟡 | Chưa sửa |
| 7 | Không có CI | 🟡 | Đã có `npm test`, chưa có workflow |
| 8 | `/api/debug/select-word` dump dữ liệu | 🔴 | ✅ Đã xoá |
| 9 | `middleware` khớp tiền tố lỏng | 🔴 | ✅ Đã siết |
