# Tiến độ — Wordly for Business (B2B)

> **Đọc file này đầu mỗi phiên** để biết đang ở đâu.
> Quy chuẩn làm việc: `CLAUDE.md`. Thiết kế: `docs/superpowers/specs/`.

**Cập nhật:** 2026-09-08 (Sửa hiệu năng B2B + table/pagination toàn hệ thống — đã kiểm chứng)
**Branch:** `main` = TOÀN BỘ 10/10 module đã merge và deploy (commit `1ef3fd0`). Không còn branch nào chờ merge.
**Môi trường:** TOÀN BỘ 14/14 migration đã chạy production (chủ dự án chạy `20260906000100` qua SQL Editor 6/9). R2: bucket `wordly-videos` tạo xong, 5 biến môi trường đã điền vào Vercel, kết nối đã kiểm chứng thật (upload/xác minh/xoá thành công với credential thật).
**Test:** 259/259 pass (logic thuần) + đã kiểm chứng RLS/hook trên production · build sạch · lint sạch trên toàn bộ file mới
**Tính năng:** trung tâm demo (`7c0dfec9-...`, gói Pro) đã bật ĐỦ 9/9 tính năng — 6 tính năng mặc định của gói Pro + 3 override thủ công (`speaking_review`, `parent_reports`, `tuition` qua bảng `org_features`, ghi 6/9/2026). Không cần deploy code cho việc này, có hiệu lực trong 60s (cache TTL).

### 7/10/2026 — iOS: mang tính năng web sang + giao diện mới (branch `feat/ios-feature-parity`, CHƯA push, CHƯA build TestFlight)

| Tính năng | Ghi chú |
|---|---|
| Dịch & tra từ | Từ điển AI của web, phát âm US/UK, Lưu (PATCH như web → quiz/widget/email), tự ghi lịch sử sau 10s, "Hỏi Alex" |
| Quiz từ vựng | Anh→Việt / Việt→Anh, kết quả + xem lại đáp án |
| Từ vựng theo chủ đề | Lọc kỳ thi/12 chủ đề/trình độ, tìm kiếm, chi tiết + học với Alex |
| Vòng quay luyện nói | IELTS Part 1–3, Phỏng vấn, Deep Talk; hẹn giờ, gợi ý từ (AI), khung trả lời |
| Luyện với Alex | Phiên theo từ, ô nhập chữ, tự đặt tiêu đề, chỉ tạo phiên khi gửi tin thật đầu tiên |
| Email nhắc học | Giống web /profile/email + gửi email thử |
| Widget màn hình khoá | Nguồn từ (đã lưu/gần đây/tự chọn), chu kỳ đổi từ, khung giờ hiển thị, ẩn nghĩa |
| Đăng nhập Google + Apple | Apple bắt buộc khi có Google (App Store 4.8) |
| Giao diện | Tab mới: Trang chủ / Dịch / Luyện nói / Hồ sơ (Hồ sơ = trung tâm cài đặt) |

**Kiểm chứng:** 84/84 test iOS; build simulator + build ký cho thiết bị (team 929P8F77XX) thành công; ảnh chụp 12 màn tối + sáng đã soát; review toàn branch → sửa 8 lỗi (commit `05b12a5`).

**Tính năng trung tâm tiếng Anh: TẠM DỪNG** theo yêu cầu (code "Lớp của tôi" vẫn còn nhưng không có lối vào). Khi làm tiếp, 2 lỗi review còn mở: trạng thái nháp server là `in_progress` (app đang so `draft`); tab Tiến độ lấy `students.first` sai khi là giáo viên.

**Chờ chủ dự án:**
- Supabase → Auth → URL Configuration: thêm `com.thientran.wordly://login-callback`; Auth → Providers → Apple: bật, Client ID `com.thientran.wordly`. Chưa làm thì Google/Apple trên app báo lỗi.
- Merge **PR #4** (quiz 500 khi ít từ đã lưu — lỗi có sẵn trên cả web) để Quiz trên app chạy được cho người mới.
- PR #2 (cache + hạn mức TTS), PR #3 (org-context Bearer — chỉ cần khi làm lại tính năng trung tâm).
- Chưa kiểm trên máy thật (iPhone không kết nối được lúc build) và chưa xem widget thật trên màn hình khoá.

### Monorepo `web/` + `mobile/` (branch `chore/monorepo-structure`, CHƯA merge)

Web app Next.js chuyển vào `web/` (git mv, giữ lịch sử); `mobile/` giữ chỗ
cho app iOS. `supabase/` và `migrations/` **giữ ở gốc** — schema dùng chung
cho web và mobile. Lệnh `npm` chạy từ `web/`, lệnh `npx supabase` chạy từ gốc;
`.env.local` / `.env.test.local` nằm trong `web/`. CI chạy trong `web/`, có
paths filter. Kiểm chứng: 273/273 test pass (bằng main), build sạch, nhận
middleware, lint CI sạch. **Chặn merge:** mục 8 "Chờ chủ dự án quyết định".

### Deploy 4/9/2026 — B2B + sự cố AI đều đã xong

`feat/b2b-multi-tenant` (32 commit) đã MERGE HẲN vào `main`, không phải
cherry-pick nữa. Kèm theo: sửa sự cố Groq ngừng 2 model (mọi tính năng AI
từng lỗi trên production), rate limit chuyển từ đếm RAM (không hoạt động
trên Vercel — đã kiểm chứng bằng cách gọi API thật) sang đếm Postgres
(đã kiểm chứng: 25 request đồng thời → cho qua đúng 15, chặn 10).

Từ nay `main` là nguồn sự thật duy nhất cho trạng thái B2B — không còn
tình trạng "code đã viết nhưng nằm trên branch khác main".

### 6/10/2026 — App iOS sống lại (branch `feat/ios-mobile-api`, xếp TRÊN `chore/monorepo-structure`, CHƯA push/deploy)

| Việc | Bằng chứng |
|---|---|
| Web nhận `Authorization: Bearer` (app iOS không có cookie) — `web/src/lib/auth/bearer-auth.js`, middleware + `supabase-server` | 12 test mới, `npm test` 285/285 (trong `web/`), build sạch, eslint sạch. Dev server: không token / token rác / JWT tự ký giả → đều 401 |
| App iOS vào git tại `mobile/ios/`; credential ở `Config/Secrets.xcconfig` (gitignore) | `git check-ignore` xác nhận; không còn key thật trong file được commit |
| Xcode project sinh bằng XcodeGen (`mobile/ios/project.yml`) | `xcodebuild` → BUILD SUCCEEDED (app + widget), chạy được trên simulator tới màn đăng nhập |
| Sửa 2 lỗi cú pháp, struct trùng ở widget, Practice đọc text stream (web không còn trả JSON `{reply}`) | build pass |

**Chưa kiểm chứng:** đăng nhập thật + gọi API với token thật (cần tài khoản; production chưa có bản sửa Bearer). Không có test Swift (chưa có test target).
**Đã quyết (6/10):** bỏ tab "My Words" trên iOS cho khớp web (web đã xoá tính năng này ở redesign 3/7) — iOS còn 4 tab: Dịch, Journal, Luyện nói, Hồ sơ. Xoá `Package.swift` (thừa, XcodeGen thay thế). Build vẫn SUCCEEDED.
**Thứ tự merge:** đổi Root Directory Vercel = `web` → merge `chore/monorepo-structure` → merge `feat/ios-mobile-api`.

### 6/10/2026 — Cấu trúc lại `web/src` theo domain (branch `refactor/web-src-structure`, xếp TRÊN `feat/ios-mobile-api`, CHƯA push)

`lib/` chia theo domain (supabase, auth, security, ai, org, learning, tuition, storage, email), component trang chủ vào `components/home` + `layout`, trang vào route group `(auth)`/`(learner)`/`(org)`. Xoá code chết: TranslateWidget, WordCard, word-content-client, data/vocabulary, jwt-verify (+ 2 file test).

| Kiểm chứng | Kết quả |
|---|---|
| Danh sách route của `next build` trước/sau | **78 route giống hệt** (cả kiểu render) — URL không đổi |
| `npm test` | 265/265 (285 − 20 test của 2 file test bị xoá cùng code chết) |
| Lint phạm vi CI / lint toàn bộ src+tests+scripts | sạch / 12 lỗi cũ, **trước và sau như nhau** |
| Rename | 58 file `git mv`, 272 dòng import viết lại bằng codemod |

Đã sửa đường dẫn lint trong `.github/workflows/ci.yml` (commit riêng). **Thứ tự merge:** Vercel Root Directory = `web` → `chore/monorepo-structure` → `feat/ios-mobile-api` → `refactor/web-src-structure`.

### 6/10/2026 — iOS chuẩn bị TestFlight (branch `feat/ios-testflight-prep`, xếp TRÊN `refactor/web-src-structure`, CHƯA push)

| Việc | Bằng chứng |
|---|---|
| Test target Swift `WordlyiOSTests` (TDD cho iOS) | 9/9 test pass trên simulator |
| Sửa đọc ngày giờ: timestamp Supabase có phần lẻ giây → trước đây mọi mục hiện "bây giờ"; lịch sử nhóm theo ngày UTC → mục 0h–7h sáng VN rơi sang hôm trước | Test fail với code cũ (đã kiểm), pass với code mới |
| 401 → làm mới phiên 1 lần, vẫn 401 thì đăng xuất về màn đăng nhập (trước đây kẹt ở thông báo lỗi chung) | 5 test cho `AuthRecovery` |
| `PrivacyInfo.xcprivacy` cho app + widget (thiếu → App Store Connect từ chối, ITMS-91053) | Có trong archive Release |
| Commit `Package.resolved` (ghim supabase-swift 2.55.3 + 6 phụ thuộc) | `.gitignore` chỉ mở riêng file này |
| Archive Release | ARCHIVE SUCCEEDED (chưa ký) |

**Còn chặn TestFlight (phía chủ dự án):** Team ID "Thien Tran Phan Huy" + đăng nhập Xcode; tạo app trên App Store Connect (`com.thientran.wordly`); đổi Vercel Root Directory = `web` để deploy bản sửa Bearer. **Chưa kiểm:** đăng nhập thật; cài đặt Auth trên Supabase (xác nhận email, redirect URL).

### 6/10/2026 — Giao diện iOS khớp web (branch `feat/ios-testflight-prep`, CHƯA push)

Màu (xanh Duolingo `#58CC02`, nền tối `#131F24`, sáng/tối tự đổi), font Plus Jakarta Sans (đóng gói, OFL), logo gấu thay emoji 🌈, card/input/nút theo `components/ui` của web. Sửa kèm: `hoverBG`/`inkGhost`/`background` đọc từ asset catalog không tồn tại (placeholder vô hình), tab Luyện nói thiếu nền (đen tuyền). Thêm chế độ xem trước chỉ có trong bản Debug để chụp màn hình không cần đăng nhập.

| Kiểm chứng | Kết quả |
|---|---|
| Test (thêm DesignSystemTests: màu khớp web sáng/tối, font có đủ dấu tiếng Việt; PreviewModeTests) | 20/20 pass |
| Ảnh chụp trước/sau 5 màn, chế độ tối + sáng | Đã so — khớp bảng màu web |
| Archive Release | SUCCEEDED, 0 chuỗi của chế độ xem trước trong binary |
| Widget | Build được; **chưa xem trực quan** (cần thêm widget trên màn hình chính) |

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
| **GĐ3** | Thanh toán VNPay | ✅ Deploy + migration xong · ⏸ chờ credential | ✅ Xong |
| **GĐ2** | Video upload trực tiếp (Cloudflare R2) | ✅ HOẠT ĐỘNG THẬT trên production | ✅ Xong |
| — | Cài đặt tổ chức, quota | ✅ Xong | ✅ Xong |
| — | Email mời thành viên | ✅ Xong | ✅ Xong |
| — | Xếp hạng quiz | ✅ Xong | ✅ Xong |
| — | Ghép đôi (match) trong bài tập | ✅ Xong | ✅ Xong |
| — | Cache JWKS (hiệu năng auth) | ✅ HOẠT ĐỘNG THẬT — trang chủ 2s→0.34s | — |
| — | DataTable + pagination (6/6 khu vực) | — | ✅ Xong |

> ✅ **ĐÃ KIỂM CHỨNG TRÊN PRODUCTION (2026-09-03, tiếp tục cập nhật tới 8/9).**
> Toàn bộ 18 migration (baseline + 17 migration B2B) đã chạy thành công,
> JWT hook đã bật và hoạt động,
> RLS chặn đúng, dữ liệu người dùng nguyên vẹn. Cache JWKS đã kiểm chứng
> đo được thật: trang chủ ổn định ~0.32-0.35s (trước ~1.9-2.3s) qua 5 lần
> gọi liên tiếp, đăng nhập vẫn hoạt động đúng sau khi đổi middleware. Xem
> mục dưới.

---

## Đã xây (chi tiết)

### Migration (18 file, `supabase/migrations/`)

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
`/api/materials/[id]/video-url` (video R2 — xem `web/src/lib/storage/video-validation.js`
+ `web/src/lib/storage/r2-client.js`)

**GĐ4:** `/api/tuition`, `/api/tuition/payments`

### UI

**Trang:** `/org` (dashboard tổ chức, tab Lớp/Thành viên),
`/org/classes/[id]` (tab Tiến độ · Bài giảng · Bài tập · Bộ từ · Học phí),
`/join` (nhập mã lớp), `/quiz` (quiz từ vựng).

**Component** (`web/src/components/org/`): `OrgShell` (layout dùng chung),
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

### AI (`web/src/lib/ai/ai-models.js` — cấu hình TẬP TRUNG)

| API | Chức năng |
|---|---|
| `/api/ai/generate-homework` | AI soạn đề bài tập theo chủ đề + trình độ |
| `/api/ai/generate-speaking` | AI soạn đề nói format IELTS Part 1/2/3 |
| `/api/ai/grade-essay` | AI chấm tự luận 4 tiêu chí + sửa lỗi |
| `/api/ai/grade-speaking` | Whisper nghe audio → LLM chấm bài nói |

**Model theo vai trò, ladder XUYÊN NHÀ CUNG CẤP** (Gemini chính, Groq dự
phòng) — `web/src/lib/ai/ai-models.js`:

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
| **Nhập credential VNPay thật** | 3 migration đã chạy (`100`, `200` sửa cột Vault, `300` tự dọn secret). Đã kiểm chứng end-to-end trên production: lưu/đọc/ký/xác minh/tự dọn khi xoá — tất cả đúng. Còn lại: vào /org → Cài đặt nhập TMN Code + Hash Secret THẬT. Tới lúc đó nút "Thanh toán online" tự ẩn |
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
`web/scripts/b2b-local-baseline.sql`).

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
| 6 | ~~Credential iOS trong `APIClient.swift`~~ | ✅ Đã chuyển sang `mobile/ios/Config/Secrets.xcconfig` (6/10, branch `feat/ios-mobile-api`) |
| 7 | **Đăng ký Cloudflare R2** | Theo `docs/R2-SETUP.md` — cần làm TRƯỚC khi merge nhánh video |
| 8 | **Vercel Root Directory = `web`** | Nhánh `chore/monorepo-structure` chuyển web app vào `web/`. PHẢI đổi trong Vercel → Settings → Build and Deployment TRƯỚC khi merge, nếu không deploy production tiếp theo hỏng |

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
| Cache JWKS trong Postgres (không tự viết verify JWT thay `getClaims()`) | Đọc kỹ code SDK trước khi sửa: `fetchJwk()` tự bỏ qua gọi mạng khi key có sẵn trong `options.keys` — giữ nguyên hàm verify + khả năng auto-refresh token của SDK, chỉ đổi tốc độ, không đổi hành vi auth |
| DataTable dùng chung + phân trang CLIENT-SIDE (không sửa API thêm limit/offset) | Số lượng thực tế nhỏ (một lớp hiếm khi quá vài trăm HV); tránh đổi hợp đồng API chỉ để làm UI, có thể chuyển server-side sau nếu một danh sách phình lớn |

---

## Lỗi đã phát hiện và sửa

| Lỗi | Cách phát hiện |
|---|---|
| 🔴 **Groq ngừng 2 model app đang dùng** → mọi tính năng AI lỗi trên production | Gọi thật API Groq khi rà soát cơ hội AI |
| 🔴 **get_vnpay_secret trả chuỗi mã hoá thay vì Hash Secret** → mọi giao dịch VNPay sẽ bị từ chối | Thực nghiệm trên production: lưu secret rồi đọc lại, thấy base64 thay vì giá trị gốc. Nguyên nhân: câu SQL kiểm chứng schema của tôi có `LIMIT 1` nên chỉ thấy cột đầu khớp |
| 🔴 **API tiến độ lộ dữ liệu học tập của bạn cùng lớp** | Rà soát UI, đọc kỹ API trả gì cho từng vai trò |
| 🔴 **Module B2B chậm (~2s/trang) vì middleware gọi mạng verify JWT mỗi request** | Đọc code SDK, phát hiện cache JWKS chỉ sống trong RAM 1 instance — mất khi Vercel cold start |
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
