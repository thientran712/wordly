# Tiến độ — Wordly for Business (B2B)

> **Đọc file này đầu mỗi phiên** để biết đang ở đâu.
> Quy chuẩn làm việc: `CLAUDE.md`. Thiết kế: `docs/superpowers/specs/`.

**Cập nhật:** 2026-09-07 (VNPay + tái cấu trúc UX — đã deploy)
**Branch:** `main` = TOÀN BỘ 10/10 module đã merge và deploy (commit `1ef3fd0`). Không còn branch nào chờ merge.
**Môi trường:** TOÀN BỘ 14/14 migration đã chạy production (chủ dự án chạy `20260906000100` qua SQL Editor 6/9). R2: bucket `wordly-videos` tạo xong, 5 biến môi trường đã điền vào Vercel, kết nối đã kiểm chứng thật (upload/xác minh/xoá thành công với credential thật).
**Test:** 259/259 pass (logic thuần) + đã kiểm chứng RLS/hook trên production · build sạch · lint sạch trên toàn bộ file mới
**Tính năng:** trung tâm demo (`7c0dfec9-...`, gói Pro) đã bật ĐỦ 9/9 tính năng — 6 tính năng mặc định của gói Pro + 3 override thủ công (`speaking_review`, `parent_reports`, `tuition` qua bảng `org_features`, ghi 6/9/2026). Không cần deploy code cho việc này, có hiệu lực trong 60s (cache TTL).

### Deploy 4/9/2026 — B2B + sự cố AI đều đã xong

`feat/b2b-multi-tenant` (32 commit) đã MERGE HẲN vào `main`, không phải
cherry-pick nữa. Kèm theo: sửa sự cố Groq ngừng 2 model (mọi tính năng AI
từng lỗi trên production), rate limit chuyển từ đếm RAM (không hoạt động
trên Vercel — đã kiểm chứng bằng cách gọi API thật) sang đếm Postgres
(đã kiểm chứng: 25 request đồng thời → cho qua đúng 15, chặn 10).

Từ nay `main` là nguồn sự thật duy nhất cho trạng thái B2B — không còn
tình trạng "code đã viết nhưng nằm trên branch khác main".

---

## Trạng thái tổng quan

| Giai đoạn | Phạm vi | Backend | UI |
|---|---|---|---|
| **GĐ1** | Multi-tenant, lớp, dashboard GV, thư viện bài giảng | ✅ Xong | ✅ Xong |
| **GĐ1** | Mời thành viên, giao bộ từ | ✅ Xong | ✅ Xong |
| **GĐ2** | Bài tập (tạo/làm/chấm) | ✅ Xong | ✅ Xong |
| **GĐ2** | Quiz từ vựng | ✅ Xong | ✅ Xong |
| **GĐ4** | Học phí, công nợ | ✅ Xong | ✅ Xong |
| **GĐ3** | Báo cáo phụ huynh + quan hệ phụ huynh–HV | ✅ Xong | ✅ Xong |
| **GĐ4** | Chấm bài nói có audio | ✅ Xong | ✅ Xong |
| **GĐ3** | Thanh toán VNPay | ✅ Deploy xong · ⏸ chờ migration + credential | ✅ Xong |
| **GĐ2** | Video upload trực tiếp (Cloudflare R2) | ✅ HOẠT ĐỘNG THẬT trên production | ✅ Xong |
| — | Cài đặt tổ chức, quota | ✅ Xong | ✅ Xong |
| — | Email mời thành viên | ✅ Xong | ✅ Xong |
| — | Xếp hạng quiz | ✅ Xong | ✅ Xong |
| — | Ghép đôi (match) trong bài tập | ✅ Xong | ✅ Xong |

> ✅ **ĐÃ KIỂM CHỨNG TRÊN PRODUCTION (2026-09-03, tiếp tục cập nhật tới 6/9).**
> 13/14 migration đã chạy thành công (còn migration video 20260906000100
> chưa chạy), JWT hook đã bật và hoạt động, RLS chặn đúng, dữ liệu người
> dùng nguyên vẹn. Xem mục dưới.

---

## Đã xây (chi tiết)

### Migration (14 file, `supabase/migrations/`)

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
| `rate-limit.js` | 14 | Cửa sổ trượt, chống đốt quota API công khai |
| **Tổng** | **144** | |

Không có test (phụ thuộc DB/JWT, chỉ test được ở local):
`org-context.js`, `org-settings.js`

### API

**GĐ1:** `/api/orgs`, `/api/orgs/[id]/members`, `/api/classes`,
`/api/classes/[id]/progress`, `/api/classes/[id]/sessions`,
`/api/classes/[id]/assignments`, `/api/join`, `/api/materials`,
`/api/materials/upload-url`, `/api/materials/[id]/url`

**GĐ2:** `/api/homework`, `/api/homework/[id]/submit`,
`/api/homework/[id]/grade`, `/api/quiz`,
`/api/materials/video-upload-url`, `/api/materials/video`,
`/api/materials/[id]/video-url` (video R2 — xem `src/lib/video-validation.js`
+ `src/lib/r2-client.js`)

**GĐ4:** `/api/tuition`, `/api/tuition/payments`

### UI

**Trang:** `/org` (dashboard tổ chức, tab Lớp/Thành viên),
`/org/classes/[id]` (tab Tiến độ · Bài giảng · Bài tập · Bộ từ · Học phí),
`/join` (nhập mã lớp), `/quiz` (quiz từ vựng).

**Component** (`src/components/org/`): `OrgShell` (layout dùng chung),
`LessonLibrary`, `HomeworkPanel`, `TuitionPanel`, `MembersPanel`,
`AssignmentsPanel`, `QuizStatsPanel`, `SettingsPanel`, `GuardiansPanel`,
`SpeakingPanel`.

**Bố cục:** full-width (trần 1920px) cho bảng/dashboard; lưới auto-fill cho
danh sách; giữ hẹp cho form và màn chơi quiz (nội dung đọc).

Tab "Học phí" chỉ hiện với owner; tab Lớp/Thành viên chỉ hiện với staff.

### Inngest job

`computeProgressSnapshots` (cron ngày), `deliverAssignment` (event + cron),
`cleanupOrphanedFiles` (cron tuần), `syncStorageLimits` (cron ngày),
`sendParentReports` (cron CN, gác bởi feature flag).

### AI (`src/lib/ai-models.js` — cấu hình TẬP TRUNG)

| API | Chức năng |
|---|---|
| `/api/ai/generate-homework` | AI soạn đề bài tập theo chủ đề + trình độ |
| `/api/ai/generate-speaking` | AI soạn đề nói format IELTS Part 1/2/3 |
| `/api/ai/grade-essay` | AI chấm tự luận 4 tiêu chí + sửa lỗi |
| `/api/ai/grade-speaking` | Whisper nghe audio → LLM chấm bài nói |

**Model theo vai trò, ladder XUYÊN NHÀ CUNG CẤP** (Gemini chính, Groq dự
phòng) — `src/lib/ai-models.js`:

| Vai trò | Thứ tự thử |
|---|---|
| `fast` | gemini-flash-lite-latest → gemini-2.5-flash → *(Groq)* qwen3.8-27b → compound-mini |
| `quality` | gemini-2.5-flash → gemini-3.5-flash → *(Groq)* gpt-oss-120b → qwen3.8-27b |
| `transcribe` | whisper-large-v3-turbo → whisper-large-v3 (**giữ ở Groq** — Gemini không có endpoint transcription tương thích) |

`callAI()` tự tụt bậc khi model lỗi/404/429/503, và tụt sang nhà cung cấp
khác khi cả Gemini hỏng. `callGroq` là alias giữ lại để 9 chỗ gọi không phải
sửa.

**Vì sao dùng endpoint tương thích OpenAI của Gemini**
(`/v1beta/openai/chat/completions`): shape `choices[0]` giữ nguyên, kể cả
SSE streaming của chat Alex → đổi nhà cung cấp mà không sửa call site nào.

**Model bị LOẠI có lý do** (đo tay 4/9/2026, có test khoá lại):
gemini-3-flash-preview ~15.8s và gemini-3.8-flash ~17.9s là model *thinking*,
quá chậm cho thẻ từ vựng; gemini-2.5-pro trả 404 (không mở cho user mới);
gemini-pro-latest trả 429 (hết quota).

**AI luôn kèm `confidence` + `needs_review`** — khi không chắc thì nói rõ
để GV xem lại, không im lặng.

### Email

`ParentReportEmail.js` — báo cáo phụ huynh, chỉ số liệu tiến độ.
`OrgInviteEmail.js` — mời thành viên.
`OrgInviteEmail.js` — mời thành viên, phân biệt đã/chưa có tài khoản.
`send-org-email.js` — dùng chung transporter Gmail sẵn có, không thêm dịch vụ.

---

## Còn thiếu

| Việc | Ghi chú |
|---|---|
| 🔴 **Chạy migration VNPay + nhập credential** | `20260907000100_vnpay_payment.sql` CHƯA chạy (kiểm chứng: bảng `vnpay_transactions` trả HTTP 404 trên production). Sau đó vào /org → Cài đặt nhập TMN Code + Hash Secret. Tới lúc đó nút "Thanh toán online" tự ẩn, không ảnh hưởng tính năng khác |
| Chưa test luồng VNPay với giao dịch thật | Đã test 20/20 unit test (gồm mọi ca giả mạo chữ ký, sửa amount sau ký), nhưng CHƯA gọi VNPay thật — thử với TMN Code đoán bị từ chối đúng (lỗi 72 = TMN Code không tồn tại), cần credential thật |
| 17 lỗi lint tồn đọng ở code B2C cũ | CI chỉ lint code B2B; dọn code cũ là việc riêng, tránh hồi quy |
| Chưa test luồng video ĐẦU-CUỐI qua UI thật | Đã kiểm chứng: kết nối R2 (upload/xác minh/xoá), migration, biến môi trường. CHƯA kiểm bằng cách thật sự bấm upload video trong app với tài khoản GV — nên làm trước khi thông báo cho khách |

---

## Vướng mắc

### 1. Migration video (`20260906000100`) CHƯA chạy production

13/14 migration đã chạy production và được kiểm chứng thật (owner xác
nhận chạy xong 4-6/9/2026; rate limit còn được kiểm bằng cách gọi RPC
thật trên production — xem lịch sử commit). Chỉ còn migration video mới
nhất chưa chạy — đã kiểm cân bằng cú pháp (`$$`, ngoặc) nhưng CHƯA qua
Postgres thật (không có Docker/psql trên máy dev).

231 test unit đều là **logic thuần**, không chạm DB. Test RLS chưa từng
chạy (không có Supabase local).

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
| ~~4~~ | ~~Cổng thanh toán~~ | ✅ QUYẾT 6/9: dùng VNPay, làm SAU (không phải bây giờ) |
| ~~5~~ | ~~Đăng ký Cloudflare R2~~ | ✅ XONG 6/9: bucket tạo, credential điền Vercel, migration chạy, kết nối kiểm chứng thật |
| 6 | **Credential iOS** trong `APIClient.swift` | Chuyển sang cấu hình ngoài trước khi commit `wordly-ios/` |
| 7 | **Đăng ký Cloudflare R2** | Theo `docs/R2-SETUP.md` — cần làm TRƯỚC khi merge nhánh video |

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
| 🔴 **Groq ngừng 2 model app đang dùng** → mọi tính năng AI lỗi trên production | Gọi thật API Groq khi rà soát cơ hội AI |
| 🔴 **Rate limit RAM không chặn được gì trên Vercel** | Gọi 18 lần trên prod → 0 lần chặn; 6 request vào 6 instance khác nhau |
| Merge ghi đè phần sửa rate limit ở `dictionary/route.js` | Bảng đếm TRỐNG sau 20 lượt gọi → code không hề chạy |
| Model hardcode ở 5 file → 1 sự cố phải sửa 5 chỗ | Grep khi sửa lỗi trên |
| 🔴 **Bản sửa model nằm trên branch, `main` vẫn gọi model chết** → prod lỗi thêm dù đã có bản sửa | So `git log main..HEAD` khi kiểm tính năng |
| **Prompt thẻ từ không yêu cầu pos khác nhau** → "run" trả 3 nghĩa đều `verb`, người học mất hẳn nghĩa danh từ | Chạy prompt thật 2 lượt/từ trên 6 từ đa nghĩa |
| Lỗi AI bị `.catch(() => {})` ở WordCard nuốt → thẻ trống nghĩa, không báo gì | Đọc code khi truy nguyên sự cố |
| CI mới giả định code B2B có trên `main` (thiếu script `test`, lint trỏ thư mục không tồn tại) | CI đỏ sau khi cherry-pick |
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
| 2 | `/api/translate`, `/api/dictionary` không rate limit | 🔴 | ✅ Đã sửa, đã lên production |
| 3 | `params` không `await` ở `practice/sessions/[id]` (route cũ) | 🔴 | Chưa sửa (ngoài phạm vi B2B) |
| 4 | Route cũ dùng service role bypass RLS | 🟡 | Route mới đã dùng anon+RLS |
| 5 | `word_ai_content.word_id` int vs `words.id` UUID | 🟡 | Chưa sửa |
| 6 | Workflow GitHub trỏ route đã xoá | 🟡 | ✅ Đã xoá `daily-email.yml` (cron đã chuyển sang Inngest) |
| 7 | Không có CI | 🟡 | ✅ Workflow CI đã chạy xanh trên `main` |
| 8 | `/api/debug/select-word` dump dữ liệu | 🔴 | ✅ Đã xoá |
| 9 | `middleware` khớp tiền tố lỏng | 🔴 | ✅ Đã siết |
