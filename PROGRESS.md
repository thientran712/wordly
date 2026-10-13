# Tiến độ — Wordly

> **Đọc file này đầu mỗi phiên** để biết đang ở đâu.
> Quy chuẩn làm việc: `CLAUDE.md`. Thiết kế: `docs/superpowers/specs/`.

### 13/10/2026 (khuya) — BẮT ĐẦU PHIÊN SAU TỪ ĐÂY

**Trạng thái:**
- **iOS:** 1.0.0 (14) chờ Apple duyệt. **1.0.0 (16) trên TestFlight** (upload 13/10 17:38) — push FCM, widget câu lầy, tab "Đã nhắc", chọn giờ bánh xe, bỏ email. **Lần upload sau: build 17.**
- **Web production = `82efd7c`** (deploy qua nút *Deploy — production*): push chạy thật (cron 5' chỉ còn push), email nhắc học đã bỏ, **website người học TẮT** (`WEB_UI_ENABLED`, bật lại = đặt `1` trong `/opt/wordly/prod/web/.env` + deploy lại). `main` = `e76c2ae` (sau đó chỉ thêm docs/iOS, chưa cần deploy lại).
- Migration `20261014000100_push_notifications` **đã chạy production**. Firebase project = Google Cloud project Wordly (`gen-lang-client-0661352497`); key APNs `.p8` đã tải lên Firebase (dev + prod); service account `wordly-fcm-sender` (JSON ở `~/Documents/keys/`, base64 trong `.env` VPS).
- Không còn PR mở.

**Việc tiếp, theo thứ tự đề xuất:**
1. **Chủ dự án thử build 16 trên máy thật:** widget câu lầy (bật ẩn nghĩa + widget vừa), tab Từ vựng → Đã nhắc, banner không kêu khi đang mở app, tiêu đề push ngắn trên màn hình khoá.
2. Khi Apple duyệt 1.0 (build 14): phát hành; nộp **1.0.1** bằng build mới (đổi `MARKETING_VERSION` — chủ dự án quyết) và **khai Device ID** trong App Privacy (App Functionality, linked, không tracking).
3. Nợ nhỏ từ review push (chưa làm): đổi giờ một khung sau khi đã gửi hôm nay → giờ mới bị chặn hết ngày (`push_log` key slot+ngày); "Bật" ở sheet hỏi một lần chưa gọi `updateTimezone`; lỗi đọc `push_devices` ghi nhầm "no devices"; `404 NOT_FOUND` (sai project FCM) chưa coi là lỗi cấu hình; `search_path` hàm SECURITY DEFINER nên để `pg_catalog` trước; `PUT /api/push/slots` rỗng trả 500 thay 400.
4. Song song push đang 20 (10k người cùng 20:00 → ~15% trễ ≤ 5'); 40 thì đủ trong ~3' (đo local) — quyết tăng khi có số người dùng thật.
5. Firebase 12 deprecate API token → chuyển sang đăng ký Installation ID trước khi nâng Firebase 13+.
6. Đối chiếu migration với DB production (self-host không có bảng lịch sử migration).
7. Dọn: nhánh `feat/email-provider-resend` (email đã bỏ), worktree agent `.claude/worktrees/agent-a5663c155f6938597`, thư mục nháp `.superpowers/sdd/2026-10-13-push-notification/` (gitignore) — cần chủ dự án đồng ý xoá.
8. Kho từ song ngữ (spec `2026-10-12-wordbank-design.md`, tạm dừng); gói Pro 1.1 (StoreKit, cần spec); Alex đang ẩn (`AppRouter.alexPracticeEnabled = false`).

**Lưu ý môi trường (máy dev):**
- xcodebuild: `env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0 xcodebuild …` + chạy ngoài sandbox (SPM lỗi `safe.bareRepository`). Nhiều thư mục DerivedData cũ — cài app thì lấy `ls -dt …/Wordly.app | head -1`.
- Upload TestFlight: archive Release → export `method app-store-connect` `destination export` → kiểm IPA có `aps-environment = production` → export lại `destination upload`. (Archive ký Development nên trong archive thấy `development` là bình thường.)
- UI test quyền thông báo: reboot simulator + gỡ app trước (hộp thoại quyền chưa trả lời sống qua gỡ app).
- Supabase local: cổng mặc định đang trống (BedWar không chạy); `web/.env.test.local` đã có. Đang **tắt** để đỡ RAM — `npx supabase start` khi cần test RLS.
- Production DB: `ssh deploy-wordly@167.99.74.215 'docker exec -i supabase-db psql -U postgres -d postgres'` (pipe SQL qua stdin). Log cron: `/opt/wordly/prod/web/send-emails-cron.log`.
- Simulator duy nhất `BedWar-iPhone16`; iPhone thật của chủ dự án: iPhone 11 (`D6872260-…`, iOS 18.7).

### 13/10/2026 (tối) — PUSH CHẠY THẬT trên production; bỏ email; tắt website; build 16 sẵn sàng (PR #34)

**Production (đã deploy, `82efd7c`):**
- Push qua FCM chạy thật: migration push đã chạy production (4 bảng RLS + 3 hàm), biến `FCM_*` trên VPS (`.env.bak-pre-push` là bản trước). iPhone chủ dự án nhận thông báo lúc 14:00 (`push_log` sent, bấm mở đúng từ).
- Câu thông báo giọng bạn thân lầy (mày–tao): tiêu đề ngắn ≤ 16 ký tự (màn hình khoá chỉ cho 1 dòng), nội dung dòng 1 «từ» = “nghĩa”, dòng 2 câu chọc — `web/src/lib/push/copy.js`.
- **Bỏ email nhắc học** (chủ dự án chốt): cron `/api/cron/send-emails` chỉ còn chạy push; bảng `email_*` + API `/api/email-*` giữ nguyên (app 1.0 còn gọi). Nhánh `feat/email-provider-resend` coi như bỏ.
- **Website tắt** (chỉ tắt, code giữ nguyên): `WEB_UI_ENABLED` mặc định tắt → mọi trang người học về `/mobile-only`; còn chạy `/api/*`, `/privacy`, `/support`, `/auth/*`, `/reset-password`, `/email-templates/*`. Bật lại: `WEB_UI_ENABLED=1` trong `/opt/wordly/prod/web/.env` + deploy lại.

**iOS 1.0.0 (16) ĐÃ UPLOAD TestFlight 13/10 17:38** (PR #34 + #35 bump build, archive từ `main` `73c0b01`; kiểm: app + widget 1.0.0 (16), IPA `aps-environment = production`, có GoogleService-Info.plist, 0 chuỗi WordlyUIPreview, domain production, team 929P8F77XX). **Lần upload sau: build 17.** Nội dung build 16: FirebaseMessaging + push, widget câu lầy, tab Từ vựng thêm "Đã nhắc" đầu tiên (7 ngày, `/api/suggestion-log`), chọn giờ bằng bánh xe nhỏ, bỏ UI email, app đang mở thì banner không kêu. Unit 224/224, UI 19/19 (simulator). Bản Debug đã thử trên iPhone thật (nhận + bấm push OK).
- Khi nộp App Store: khai thêm **Device ID** (App Functionality, linked, không tracking).
- Chưa xem trên máy thật: widget câu lầy, tab Đã nhắc, banner không kêu khi đang mở app.

### 13/10/2026 (chiều) — PUSH NOTIFICATION: code + test xong trên nhánh `feat/push-notification` (CHƯA merge/deploy)

Spec (đã duyệt) `docs/superpowers/specs/2026-10-13-push-notification-design.md`, plan `docs/superpowers/plans/2026-10-13-push-notification.md`. Quyết định chủ dự án: push **bổ sung** email, **lịch riêng**, gửi qua **FCM**, giờ nhắc (cả email) **chỉ mốc :00/:30**.

**Đã làm (bằng chứng):**
- Server: bảng `push_devices/push_preferences/push_slots/push_log` + RLS + `register_push_device` (token thuộc người đăng ký gần nhất — chống rò thông báo chéo), `due_push_slots` (lọc trong Postgres, cửa sổ bù 30'), `cleanup_push_data`. Cron `/api/cron/send-emails` chạy email + push song song (không sửa crontab). FCM HTTP v1 bằng `jose` + `fetch` (không firebase-admin). API `/api/push/devices|preferences|slots` + rate limit. `/api/email-slots` chỉ nhận mốc :00/:30.
- Web: `npm test` **396/396** (gồm RLS thật trên Supabase local), `next build` sạch, eslint sạch. Smoke HTTP local 18/18 (token chuyển chủ, 429, cron trả `{email, push:{disabled}}`).
- **Đo tải bắt được lỗi**: RPC `due_push_slots` bị PostgREST cắt 1000 dòng → đã sửa (gọi theo lô). 10k người cùng 20:00 (Postgres local, FCM giả 150ms + chọn từ giả 300ms): song song 20 → 8.501 trong 4 phút, 1.499 gửi bù lượt sau (trễ ≤ 5'); song song 40 → 10.000 trong 2'56". **Đang để 20** (chờ chủ dự án quyết tăng 40 sau khi đo DB production).
- iOS: menu giờ mốc 30 phút (form dùng chung Email + Thông báo), màn "Thông báo nhắc ôn" trong Cá nhân, PushManager (token khi đăng nhập/đổi, huỷ trước khi đăng xuất, bấm thông báo mở đúng từ qua deep link widget), hỏi bật nhắc **một lần** sau khi lưu từ, khai Device ID trong `PrivacyInfo`. Firebase iOS SDK 12.19.2 (chỉ FirebaseMessaging). Unit **206/206**, UI **17/17** (gồm test mới: mở màn không xin quyền — bắt được lỗi `.onChange` xin quyền ngay khi tải cài đặt).

**Chưa kiểm chứng được (cần cấu hình thật):** gửi FCM thật, nhận thông báo trên iPhone thật, bấm thông báo thật, sheet "hỏi một lần" (chỉ hiện khi có `GoogleService-Info.plist`), migration trên Postgres production.

**Chủ dự án cần làm (Claude hướng dẫn từng bước):**
1. Apple Developer: tạo key **APNs** (.p8); App ID `com.thientran.wordly` bật **Push Notifications**.
2. Firebase console (tài khoản huythien712, gắn Google Cloud project Wordly `gen-lang-client-0661352497`): thêm app iOS → tải `GoogleService-Info.plist` vào `mobile/ios/WordlyiOS/App/` (gitignore); tải .p8 lên Cloud Messaging; tạo service account quyền *Firebase Cloud Messaging API Admin*.
3. **[Cửa]** migration `20261014000100_push_notifications.sql` lên production. 4. Đưa `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_BASE64` lên VPS (`atlas-secret-handoff`). 5. **[Cửa]** deploy qua nút *Deploy — production*. 6. **[Cửa]** build 16 TestFlight + khai Device ID trên App Store Connect.

**Nợ kỹ thuật mới:** cron email vẫn kéo cả bảng, gửi tuần tự, cửa sổ 5', có thể gửi đôi khi chạy chồng (spec mục 10) — áp khuôn push sau. Firebase 12 deprecate API token (`token()/deleteToken()`) để chuyển sang đăng ký theo Installation ID — phải chuyển trước khi nâng Firebase 13+. Khung email giờ lẻ cũ vẫn gửi; app 1.0 cũ đổi sang giờ lẻ sẽ bị server từ chối im lặng.

**Môi trường:** Supabase local giờ chạy cổng mặc định (BedWar không chạy), `web/.env.test.local` đã tạo. xcodebuild phải chạy `env -u GIT_CONFIG_COUNT -u GIT_CONFIG_KEY_0 -u GIT_CONFIG_VALUE_0` + ngoài sandbox. UI test quyền thông báo: reboot simulator trước (hộp thoại chưa trả lời sống qua gỡ app).

### 13/10/2026 (sáng) — deploy CI, theme widget v2

**Trạng thái:** iOS 1.0.0 (14) chờ Apple duyệt. Build 15 trên TestFlight — chủ dự án thử máy thật OK. `main` có thêm code iOS chưa lên TestFlight (PR #27) → **lần upload sau: build 16**. Web production = `167aff3` (PR #21 cron email phân trang, deploy tay 13/10, quay về: `wordly-web:rollback-pre-167aff3`). Không còn PR nào mở.

**Đã xong 13/10:**
- Merge #21, #24, #25, #26 (#20, #23 nằm trong #26). Deploy #21: cron chạy code mới (`checked: 8`), log không lỗi.
- **PR #27 (iOS, chưa lên TestFlight):** 51 theme widget chia 4 nhóm chọn bằng dropdown — thêm 25 theme lấy cảm hứng hoạt hình/siêu anh hùng (tên gợi tả, **không** dùng tên nhân vật/thương hiệu — App Store 5.2), tất cả đạt WCAG AA; mặc định người dùng mới = theme Wordly (màu cũ chỉ ~2.1–2.4, ai đã lưu cài đặt giữ nguyên); nút **Chỉnh lại khung** ảnh nền (lưu bản gốc ≤ 2048 px + khung từng cỡ; ảnh đặt từ build 15 phải chọn lại một lần). Unit iOS 194/194.
- **PR #28: deploy production bằng nút bấm** (workflow `Deploy — production`, blue/green, `/api/health` báo commit). Chạy trên máy GitHub vì repo public (không dùng runner tự host). Web 310/310, build sạch.

**✅ Deploy production qua CI ĐÃ CHẠY (13/10):** chủ dự án chạy `infra/vps/web/setup-ci-deploy.sh`; lần deploy đầu `7b79bb1` qua workflow → màu **blue** (cổng 13501), `/api/health` báo đúng commit, cron email chạy (`checked: 8`), log không lỗi; gọi thử production mỗi giây trong lúc swap: 56/56 lượt 200 (không gián đoạn). Container deploy tay cũ (`web-web-1`, cổng 13500) đã gỡ.
- **Từ giờ production chỉ deploy bằng:** Actions → **Deploy — production** → Run workflow (hoặc `gh workflow run deploy-production.yml`). Quay về: chạy lại với `sha` = commit cũ hơn của main (giữ 5 image gần nhất trên VPS).
- Migration SQL vẫn chạy tay **trước** khi deploy (swap.sh không tự migrate).
- Lưu ý: trong khung chat extension VS Code, lệnh bắt đầu bằng `!` **không chạy** — phải dán vào Terminal (Ctrl + `).

**Việc có thể làm tiếp, theo thứ tự đề xuất:**
1. **Lên plan tính năng Push notification** (chủ dự án yêu cầu 13/10): nhắc ôn từ / từ mỗi ngày qua APNs thay hoặc bổ sung email. Cần brainstorm → spec → plan: lưu device token (bảng mới + RLS), gửi từ cron VPS (APNs key `.p8`, HTTP/2), quyền thông báo trong app, khung giờ theo `email_slots` hay riêng, hạn mức/tắt, deep link mở đúng từ (đã có cho widget).
2. **Đối chiếu migration với DB production** (self-host không có bảng lịch sử migration; đã sót `suggestion_log` từ 10/10) — thêm `schema_migrations` hoặc script kiểm.
3. Khi Apple duyệt 1.0 (build 14): phát hành; sau đó nộp 1.0.1 bằng build 16 (gồm PR #27).
4. Email Resend (nhánh `feat/email-provider-resend`, WIP `aeb12f6`): rebase lên main (xung đột `cron-send-emails.js` với #21), xác minh domain, chọn gói.
5. Kho từ song ngữ (spec `2026-10-12-wordbank-design.md`, tạm dừng): lô thử 200 từ hiếm.
6. Gói Pro cho 1.1 (StoreKit, đề xuất 29k/tháng – 249k/năm): cần spec.
7. Luyện nói với Alex đang ẩn (`AppRouter.alexPracticeEnabled = false`) — quyết định bật lại.

**Lưu ý môi trường (máy dev):**
- Supabase local: cổng mặc định bị dự án BedWar chiếm → khi chạy test RLS, đổi tạm cổng sang `553xx` trong `supabase/config.toml` (**không commit**), tạo `web/.env.test.local` từ `npx supabase status -o env`.
- Simulator duy nhất: `BedWar-iPhone16` (`7F03B63D-…`), test iOS một simulator, `-parallel-testing-enabled NO`. Màn Debug xem nhanh: `-WordlyUIPreview profile -WordlyUIPreviewScreen homestyle|widgetbg`.
- Script kiểm production (2 user tạm, tự xoá) chưa có trong repo — viết lại theo `web/tests/rls/user-routes-rls.test.mjs`, gọi API thật bằng Bearer JWT.
- Chế độ auto của Claude Code chặn cấp quyền trên server và đôi khi chặn SSH/psql production; chủ dự án muốn Claude tự làm, ít hỏi, báo ngắn gọn.

### 12/10/2026 (khuya) — BUILD 15 ĐÃ UPLOAD TestFlight: ảnh nền + 26 theme widget (PR #26)

- **Ảnh nền widget màn hình chính** (spec + plan: PR #25). Spike: bản cũ crash vì đọc ảnh trong `body` × tới 200 entry, ảnh lưu 3x (1500 px), giải mã ảnh gốc 48 MP. Bản mới: ImageIO thu nhỏ ≤ 2048 px, lưu 510×510 / 1092×510 scale 1, file có phiên bản, widget đọc **một lần** trong Provider, lỗi → nền màu. Đơn giản hoá so với spec: vị trí/độ phóng không lưu — muốn chỉnh lại thì chọn lại ảnh.
- **26 theme** (Tailwind, Nord, Dracula, Catppuccin, Gruvbox, Solarized, Tokyo Night, Rosé Pine — MIT) — test bắt buộc WCAG AA ≥ 4.5:1 (mặc định cũ chữ trắng trên xanh chỉ ~2.1–2.4, giữ nguyên cho người dùng cũ). Công tắc tắt gradient (cài đặt cũ vẫn gradient). 24 ô màu thay ColorPicker (bỏ bút lấy màu).
- Gộp PR #23 (lỗi đăng nhập tự ẩn) + PR #20 (UI test).
- Bằng chứng: unit iOS **189/189**, UI test bàn phím + widget deep link 5/5, ảnh chụp màn chỉnh khung + màn theme trên simulator. Archive 1.0.0 (15) app + widget, 0 chuỗi `WordlyUIPreview`, domain production, team `929P8F77XX` → **"Upload succeeded"**. Lần upload sau: build 16.
- ✅ **Chủ dự án đã thử trên iPhone thật 13/10: OK.** Danh sách đã thử theo spec: ảnh camera 48 MP, panorama, PNG trong suốt, ảnh chụp dọc; đổi ảnh 10 lần liên tục; widget chạy qua đêm không crash/trắng; xoá ảnh → nền màu; theme + tắt gradient hiện đúng trên widget thật.

### 12/10/2026 (tối) — Dọn nợ kỹ thuật trong lúc chờ Apple duyệt: 4 PR mở, CHƯA merge/deploy

Kiểm build 14 trên máy thật (chủ dự án): sheet Apple khi xoá tài khoản ✅, widget nghĩa Việt ✅, độ mờ widget ✅.

| PR | Việc | Bằng chứng |
|---|---|---|
| #20 | UI test bàn phím fail từ build 13 — do dữ liệu mẫu thêm từ đã lưu thứ 4 (`0efdc8f`), không phải lỗi app; test giờ khớp đầu nhãn | `KeyboardDismissUITests` 3/3 |
| #21 | Cron email bỏ sót người dùng thứ 1.001+ (PostgREST cắt 1000 dòng) → `fetchAllRows` lấy theo trang, `due-slots.js` tách để test | web 304/304, build sạch |
| #22 | 25 route dùng service role cho request người dùng → dữ liệu riêng qua `createClient()` (RLS), bảng dùng chung qua `createSharedClient()` (chặn bảng người dùng); chỉ 4 route còn admin (`ADMIN_ALLOWED` trong `tests/unit/admin-client-usage.test.mjs`); migration policy cho `spinner_preferences`/`spinner_history` | 317/317 gồm RLS trên Supabase local; smoke HTTP Bearer 25/25 (B không đọc/sửa/xoá được của A) |
| #23 | Lỗi đăng nhập/đăng ký/quên mật khẩu/nhập mã hiện mãi + lỗi đăng nhập lọt sang sheet Đăng ký → `AuthErrorBanner`: sửa ô ẩn (sau ≥1,5s), tự ẩn 8s, lỗi gửi mã quá nhanh giữ tới khi gửi lại được | iOS unit 165/165; **chưa xem trên simulator/máy thật** |

**PR #22 ĐÃ DEPLOY production (12/10 tối):** migration `20261013000100_spinner_user_rls` chạy trước (một transaction) → merge `4ecccff` → image `wordly-web:4ecccff` build trên VPS → tag `manual` → `--force-recreate`. Quay về: `wordly-web:rollback-pre-4ecccff`. Kiểm production bằng 2 user tạm (đã xoá) qua API thật: **27/27** — gồm B không đọc/sửa/xoá được dữ liệu của A.
- **Phát hiện lỗi có từ 10/10:** bảng `suggestion_log` **chưa từng được tạo trên self-host** (migration `20261010000100` bị sót lúc chuyển từ Cloud) → màn "Đã gợi ý" lỗi 500, widget/cron ghi gợi ý thất bại im lặng. Đã chạy migration đó trên production + `notify pgrst, 'reload schema'` → `/api/suggestion-log` 200. Dữ liệu gợi ý từ 10/10 tới giờ không có (không khôi phục được).
- Self-host không có bảng lịch sử migration → khi thêm migration mới phải tự nhớ chạy; nên đối chiếu `supabase/migrations/` với DB production một lượt.

**Khác:**
- Đã xoá 6 worktree đã merge. Nhánh `feat/email-provider-resend` giữ code Resend (commit `aeb12f6`, WIP) — phải rebase sau PR #21 (cùng sửa `cron-send-emails.js`).
- `widget/log-shown` vẫn ghi `suggestion_log` bằng service role — giữ theo spec 2026-10-10 (bảng chỉ service role ghi).
- Supabase local chạy được (Docker), nhưng cổng mặc định đang bị dự án khác chiếm → đổi cổng tạm trong `supabase/config.toml` (không commit) + tạo `web/.env.test.local` từ `supabase status`.
- Simulator duy nhất trên máy: `BedWar-iPhone16`.

**Tiếp theo:** ảnh nền widget (mục dưới) — tái hiện crash trước, rồi spec.

### 12/10/2026 — iOS 1.0.0 BUILD 14 ĐÃ UPLOAD — bản nộp App Store (miễn phí)

**✅ ĐÃ NỘP APP STORE 12/10/2026** (build 1.0.0 (14), trạng thái *Waiting for Review*, Apple hẹn ≤ 48 giờ; phát hành thủ công — *Manually release*). App Privacy khai đúng 3 loại khớp `PrivacyInfo.xcprivacy`: Name, Email Address, Other User Content (App Functionality, linked, không tracking) — lần đầu bị chặn "Unable to Add for Review" vì đã tick thừa 9 loại chưa Set Up nên không Publish được. Ảnh chụp: giao diện ASC mới đòi cỡ "iPhone with Dynamic Island (medium display)" 1206×2622 → thu nhỏ từ bộ 6.9" vào `docs/app-store/screenshots-6.3/`. Hồ sơ nộp: artifact "Wordly App Store Kit" (đã cập nhật build 14). Trang `/privacy` đã sửa cho khớp hồ sơ (Gemini dịch câu, DeepL chỉ từ/cụm ngắn) — PR #19, deploy `feac028`, đã kiểm trên production.

**Quyết định:** bản 1.0 **miễn phí** (gói Pro làm ở 1.1). Play nộp App Store; mật khẩu tài khoản demo đã điền trong App Store Connect (chủ dự án). Ảnh nền widget: để sau (xem mục dưới).

**Build 14** = `main` `0316e51` + bump (PR #18, `f781484`):
- **Thu hồi token Sign in with Apple khi xoá tài khoản** (PR #16, guideline 5.1.1(v)): iOS xác nhận lại với Apple lấy `authorizationCode` → `DELETE /api/account` đổi mã lấy token (`/auth/token`) rồi `/auth/revoke`; thu hồi lỗi vẫn xoá; app cũ không gửi mã vẫn xoá như trước. Key "Sign in with Apple" mới: 4 biến `APPLE_*` trên VPS (`APPLE_PRIVATE_KEY_BASE64` = base64 của cả file PEM). Kiểm thật: gửi Apple mã giả → `invalid_grant` (key được Apple chấp nhận).
- **Widget hiện nghĩa tiếng Việt cho từ trong kho** (PR #17): lượt tra phiên âm sẵn có lưu thêm `def_vi` (map App Group `wordly.widget.meaningsVi`), không thêm lượt gọi; chưa có thì rơi về `def_en`.
- **Sửa "Độ mờ" màu widget màn hình chính** (PR #17): `Color.toHex()` vứt alpha → giờ lưu `#AARRGGBB` khi trong suốt.
- Server đã deploy trước app (image `wordly-web:0316e51`, quay về: `wordly-web:rollback-pre-0316e51`); production: `DELETE /api/account` chưa đăng nhập 401, dịch vẫn chạy.
- Bằng chứng: unit test iOS **157/157**; UI test 15/16 — `KeyboardDismissUITests/testTapOutsideClosesKeyboardOnTranslate` fail dòng 25 (không thấy "Từ đã lưu (3)" sau khi chuyển tab) và **fail y hệt trên `main` trước thay đổi** → lỗi có từ trước, chưa sửa. Web 301/301. Archive: 1.0.0 (14) app + widget, 0 chuỗi `WordlyUIPreview`, domain production, team `929P8F77XX`, có chuỗi `appleAuthorizationCode` + `wordly.widget.meaningsVi` trong binary → **"Upload succeeded"**.
- **Chưa kiểm trên máy thật:** sheet xác nhận Apple khi xoá tài khoản, widget hiện nghĩa Việt, độ mờ trên widget thật. **Lần upload sau: build 15.**
- Máy dev quá tải khi chạy nhiều simulator song song (load ~500–800, kèm `vitest` của dự án khác) → chạy test iOS bằng **một** simulator, `-parallel-testing-enabled NO`.

### 12/10/2026 — Tối ưu chi phí bên thứ 3: dịch lai + giới hạn Alex ĐÃ DEPLOY production; spec kho từ

**Gemini — ĐÃ ĐỔI trên production:**
- Trước đó cả máy dev lẫn production dùng key `…zTKk` của "Gemini Project" (`gen-lang-client-0536362233`, tài khoản huythien712) — **gói miễn phí, dùng chung hạn mức 15 lượt/phút với SkillProof Prod + Staging**. Đo: 25 lượt song song → 17 OK, 8 lỗi 429.
- Project **Wordly** (`gen-lang-client-0661352497`) đã bật billing: Paid 1, trả trước 150.000đ, tự nạp bật. Dev giờ dùng `…wSCQ`, production dùng `…_iN0` (đưa vào `/opt/wordly/prod/web/.env` qua `atlas-secret-handoff`, không lộ giá trị), container `web` đã `--force-recreate`.
- Bằng chứng: dev 25/25 lượt song song không 429; trong container env khớp `…_iN0`; `/api/dictionary` trên production với từ chưa cache → HTTP 200 (2,7s), log 2 phút không có 429/lỗi. Chưa xác nhận được lượt đó chạy Gemini hay rơi về Groq (phản hồi không ghi nhà cung cấp).
- `.env.local` cũ ở gốc repo (bản sao trước monorepo) đã xoá — app chỉ đọc `web/.env.local`.
- Lưu ý: `gemini-flash-lite-latest` giờ trỏ sang **3.5-flash-lite** (đắt hơn 2.5); `gemini-2.5-flash-lite` đã đóng với tài khoản mới.
- Tài khoản gcloud `madison.huy@gamuda.com.my` đã thu hồi khỏi máy — **không bao giờ dùng cho Wordly**.

**Đã deploy production (PR #13 + #14 đã merge vào `main`, `web/` của `main` = bản đang chạy):**
- **Dịch lai** (PR #13): ≤3 từ → DeepL, câu → Gemini 3.5 Flash-Lite (lỗi → DeepL), cache theo câu RAM + bảng `translation_cache`. Migration `20261012000200` chạy trên production trong một transaction (RLS bật, chỉ `service_role`/`postgres` có quyền). Lý do: đánh giá mù 75 mục — câu Gemini ngang DeepL, từ đơn Gemini bịa từ 5/40.
- **Giới hạn AI** (PR #14): Alex 20/phút + 300/ngày, chỉ gửi 20 tin gần nhất, ≤1.500 ký tự/tin, bỏ role `system` từ client; gợi ý từ 20/phút + 200/ngày.
- Deploy: image `wordly-web:8f7ada9` (build với `--build-arg NEXT_PUBLIC_*` lấy từ `.env` trên VPS) → tag `manual` → `--force-recreate`. Bản quay về: `wordly-web:rollback-pre-8f7ada9`.
- Bằng chứng trên production: câu → `engine=gemini` (1,7s), "resilient" → `engine=deepl` "kiên cường" (1,0s), gửi lại cùng câu 0,2s (trúng cache), `/api/practice` chưa đăng nhập 401, log 3 phút không lỗi. CI #13/#14 xanh. Chưa kiểm sống: Alex chạm hạn mức 429 (chỉ có unit test).

**⏸ TẠM DỪNG 12/10/2026 (chủ dự án):** dừng kho từ + các việc tối ưu chi phí còn lại để **tập trung publish app iOS lên App Store**. Mọi thứ dưới đây giữ nguyên trạng thái, làm tiếp sau khi app đã lên store. Worktree còn giữ: `.claude/worktrees/agent-ab12283faf5a4a262` (email Resend, chưa commit), `.claude/worktrees/wordbank-spec` (PR #15). Bản thử kho từ + công cụ trong `data/wordbank/`; công cụ đối chiếu CMUdict (`crosscheck.mjs`) chỉ ở thư mục nháp phiên — viết lại khi làm tiếp.

**Ảnh nền widget màn hình chính — ĐỂ SAU (chủ dự án 12/10/2026), yêu cầu số 1: KHÔNG được crash.**
- Từng có (commit `a3e15a7`) rồi bị gỡ ở `b377767` "vì gây crash" — nguyên nhân gốc chưa từng được ghi. Bản cũ: `PhotosPicker` → `UIImage(data:)` ảnh gốc → thu 500px → JPEG → App Group → widget `UIImage(data:)` + `scaledToFill`, không có bước cắt.
- Nghi vấn cần kiểm trước khi code: (a) app giải mã ảnh gốc 48MP (~200MB) trước khi thu nhỏ; (b) widget vượt ngân sách bộ nhớ (~30MB); (c) ảnh quá cỡ/lệch tỉ lệ khung widget; (d) ghi file không atomic khi widget đang đọc.
- Thiết kế đã thống nhất: chỉ widget màn hình chính (nhỏ + vừa); chọn ảnh → **màn hình chỉnh khung** 2 tab Nhỏ (vuông) / Vừa (ngang), kéo để di chuyển + chụm để phóng to (luôn phủ kín khung), xem trước có chữ đè lên, thanh làm tối, Lưu / Xoá ảnh nền. Chống crash: không bao giờ giải mã ảnh gốc (ImageIO downsample), lưu đúng cỡ pixel từng loại widget, ghi `.atomic`, widget đọc bằng downsample + rơi về nền màu khi lỗi, test với ảnh 8000×6000/48MP, **bắt buộc thử trên iPhone thật** trước khi phát hành.

**Chờ / việc tiếp (sau khi publish):**
- **Kho từ song ngữ** — spec `docs/superpowers/specs/2026-10-12-wordbank-design.md` (Q1–Q5 đã quyết: dùng danh sách từ có sẵn, Việt→Anh = đảo ngược kho EN + bù ~1–2k mục, dự phòng câu = Groq, âm thanh giữ TTS khi cần + cache, đợt 1 = 10k EN). Bản thử 100 mục đã duyệt → `data/wordbank/batches/0001-pilot-*.json`. Bước tiếp: lô thử 200 từ hiếm.
- Email Resend (CHƯA commit, worktree `agent-ab12283faf5a4a262`) — bật khi có cả `RESEND_API_KEY` và `EMAIL_FROM`, lô 100, 5 req/s, 262/262 test. Cần xác minh domain `wordly.skillproof.work` + chọn gói (~300k email/tháng ở 10k user ≈ $240–350; SES rẻ hơn ~$30).
- **Lỗi có sẵn:** cron email đọc `email_slots`/`profiles`/`email_preferences` không phân trang, `max_rows = 1000` → người dùng thứ 1.001+ không nhận email.
- **DeepL production là gói FREE** (500k ký tự/tháng) — đủ khi chỉ còn dịch từ ≤3 từ; tắt hẳn ở giai đoạn 3 của kho từ.
- Chiến lược giá đề xuất: Miễn phí / Pro 29k/tháng / Pro năm 249k, hạn mức theo gói (Alex ~20 lượt/ngày ở Pro — 300/ngày hiện tại chỉ chống lạm dụng; người chat hết mức tốn ~94k đ/tháng). Chưa duyệt, cần spec (StoreKit + bảng quyền lợi + hạn mức theo gói).
- VPS còn chạy container `localex-staging-postgres-1`, `pehub-db-db-1` (RAM ~2GB trống / 4GB).

**Quyết định của chủ dự án (12/10/2026):**
- **Phát âm giữ nguyên Google TTS Neural2** cho cả từ lẫn câu (EN-US, EN-GB, VI) — chất lượng hiện tại đạt yêu cầu. KHÔNG chuyển sang giọng trên máy (iOS/trình duyệt đọc tệ), không đổi sang Chirp 3 HD.
- **Tập trung MOBILE (iOS).** Giao diện web người học **không đụng tới nữa** — sẽ chuyển thành **trang admin để support**. Lưu ý: `web/src/app/api/*` vẫn là backend của app iOS (đổi đường dẫn = vỡ app) nên sửa API phục vụ mobile vẫn trong phạm vi; chỉ UI web là đóng băng. Hệ quả: thanh toán chỉ qua Apple (StoreKit, phí 15%), kho từ giao qua app (SQLite đóng gói + API), không làm cổng thanh toán web.

### 12/10/2026 — PR #10 + PR #11 ĐÃ MERGE vào `main`; CI xanh lại

- PR #10 (build 11) merge `57656cb`, PR #11 (build 12 + 13, widget) merge `1db450d`. `main` giờ khớp code của build 13 trên TestFlight.
- CI đỏ từ khi xoá B2B: bước lint liệt kê đường dẫn đã xoá (`src/app/(org)/org`…) → eslint "No files matching", bước `next build` phía sau chưa từng chạy. Sửa ở `0ec1704` (giữ `src/lib`, quiz, middleware — eslint local sạch); từ đó CI xanh cả test, lint, build.
- Chủ dự án đã cho phép `gh pr merge` / `gh pr create` / `gh run watch` trong `.claude/settings.local.json`. Lưu ý: chạy `gh pr merge` thành **lệnh đơn** (không pipe/`;`), lệnh ghép không khớp quy tắc và bị chế độ auto chặn.
- Merge vào `main` không tự deploy (CI chỉ test; VPS deploy tay). Web trên VPS vẫn là code từ `6126c2c` — các PR này chỉ đổi iOS + CI + tài liệu.

### 12/10/2026 — BUILD 13 ĐÃ UPLOAD: phiên âm US trên widget + căn lề (đã merge, PR #11)

- **Phiên âm US** nằm giữa từ và nghĩa (màn hình khoá + màn hình chính + thẻ xem trước trong cài đặt). `WidgetSync.refreshPhonetics()` tra `/api/dictionary` (cache DB, Groq chỉ khi miss) cho ≤12 từ sắp hiện mỗi lần đồng bộ, tuần tự (giới hạn 40/phút/người dùng chung với tra từ). Lưu `wordly.widget.phonetics` (từ chuẩn hoá → IPA, rỗng = đã tra không có) trong App Group, giới hạn 2000 mục. Câu (có `.?!,;:` hoặc >4 chữ) không tra, không hiện (`WidgetPhonetic`, 5 test).
- **"Widget luôn nằm giữa"**: không tìm thấy lỗi trong code — render ở 157×72/172×76 cho thấy căn trái/phải/giữa bám đúng mép khung. Vị trí cả khung do iOS quyết định: hàng widget màn hình khoá luôn canh giữa khi chưa đủ 4 ô. Đã thêm hướng dẫn trong cài đặt (đặt Wordly đầu hàng + 2 widget tròn bên phải). Khung bố cục giờ trải hết chiều cao cho chắc. **Chưa kiểm trên máy thật** — nếu chủ dự án vẫn thấy lệch giữa khi hàng đã đủ 4 ô thì là lỗi khác, cần ảnh chụp.
- Bằng chứng: 129/129 unit test pass; archive 1.0.0 (13) cho app + widget, 0 chuỗi `WordlyUIPreview`, domain đúng → **"Upload succeeded"**.
- Phiên âm chỉ có sau khi mở app (để đồng bộ) ít nhất một lần trên build 13.

### 12/10/2026 — BUILD 12 ĐÃ UPLOAD: widget màn hình khoá dùng hết khung + nguồn từ dạng ô tick (đã merge, PR #11)

**Build 12:** commit tính năng + bump `CURRENT_PROJECT_VERSION=12`, archive Release
(team `929P8F77XX`), kiểm archive: app + widget đều 1.0.0 (12), 0 chuỗi
`WordlyUIPreview`, domain `api/app.wordly.skillproof.work` → export
`app-store-connect` → **"Upload succeeded"**. Branch xếp trên `chore/ios-build-11`
(PR #10) → merge PR #10 trước rồi mới mở PR cho branch này.

- **Khung chữ nhật màn hình khoá** (`accessoryRectangular`) là kiểu lớn nhất Apple cho, ~160×72pt, không làm to hơn được. Đã cân nhắc và **bỏ**: 2 widget ghép cạnh nhau (chủ dự án thấy tệ), Live Activity (hết hạn sau ~8 tiếng, đổi từ phải push từ server, dễ bị từ chối khi duyệt app).
- `LockRectangular` giờ dùng `ViewThatFits` để thử từ cỡ chữ to nhất xuống, nghĩa xuống dòng hết (tới 3–4 dòng). Không vừa cỡ nào mới cắt "…". Cụm nhiều chữ được xuống 2 dòng; từ đơn giữ 1 dòng (thu nhỏ). Đã render bằng `ImageRenderer` ở 157×72 và 172×76 với 5 từ mẫu để kiểm tra bằng mắt (test tạm, đã xoá).
- **Nguồn từ**: bỏ 2 tab "Đã lưu | Gần đây", thay bằng 2 ô tick "Từ đã lưu" / "Từ dịch gần đây", tick 1 hoặc cả 2, không bỏ được cả 2. Thêm `Source.unsaved` (dịch nhưng chưa lưu). Cả 2 = `.recent` cũ, nên cài đặt cũ không đổi nghĩa.
- Bằng chứng: `WordlyiOSTests` 124/124 pass (thêm 5 test nguồn từ, đã thấy fail trước khi viết code), app + widget build sạch.
- **Chưa kiểm**: chưa xem trên màn hình khoá máy thật/simulator. Chưa biết iOS có chừa lề trong khung không; nếu có, cỡ chữ sẽ tự lùi xuống một nấc. Chưa chụp màn cài đặt mới (cần đăng nhập).

### 12/10/2026 — Lộ service_role key Supabase Cloud → đã PAUSE project Cloud

**Sự cố:** GitHub secret scanning (repo **public**) báo 2 cảnh báo:
- **#1 — lộ thật:** JWT `service_role` (legacy) của Supabase Cloud
  `blattojsgqyhoxkglind` hardcode trong `scripts/fetch-audio-urls.mjs`, commit
  `80382b6` (tháng 5/2026). File hiện tại đã đọc từ env, nhưng key vẫn nằm
  trong lịch sử git công khai → coi như đã lộ, rewrite history vô ích.
- **#2 — báo nhầm:** `whsec_…` trong `infra/vps/supabase/docker-compose.yml:246`
  là placeholder mẫu của Supabase (base64 "This is an example of a shorter
  Base64 string"), dòng bị comment.

**Đã làm (cách A — cắt hẳn Cloud, iOS đã chạy self-host từ build 7):**
- Backup lần cuối Cloud bằng `supabase db dump --linked` (schema + data + roles)
  → `~/wordly-cloud-backup-2026-10-12/` (ngoài repo, `chmod 600`, có PII +
  password hash — **không đưa vào git**). Có đủ `auth.users`/`identities` + mọi
  bảng public. Gói Free không có backup nào khác.
- Chủ dự án pause project Cloud. Kiểm: `supabase projects list` → `INACTIVE`;
  `curl blattojsgqyhoxkglind.supabase.co/rest/v1/` → không kết nối (000);
  `app.wordly.skillproof.work` vẫn 200, `api.…/auth/v1/health` vẫn 401 (như trước).
  → Key bị lộ hết tác dụng. Ai còn giữ build iOS 1–6 sẽ không dùng được nữa.

- Đóng 2 cảnh báo GitHub qua `gh api`: #1 → `revoked`, #2 → `false_positive`.
- Chủ dự án chọn xoá hạ tầng cũ **ngay** (không đợi 2–4 tuần):
  - Gỡ project Vercel `davids-projects-f609008f/wordly` (`vercel project rm`) —
    trước đó kiểm DNS `app`/`api.wordly.skillproof.work` đều trỏ VPS
    167.99.74.215, Vercel không gắn domain riêng nào của Wordly.
  - **Xoá hẳn** project Supabase Cloud `blattojsgqyhoxkglind` ("Deleted project",
    không còn trong `supabase projects list`). Dữ liệu Cloud giờ **chỉ còn** bản
    dump ở `~/wordly-cloud-backup-2026-10-12/`.
  - Lệnh `supabase db query --linked --project-ref blattojsgqyhoxkglind` trong
    tài liệu cũ không còn dùng được — migration giờ chạy trên self-host.
- `web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL` đã đổi sang
  `https://api.wordly.skillproof.work`; 2 key (anon + service role, lấy từ
  `/opt/wordly/prod/supabase/.env` trên VPS) nhập qua `atlas-secret-handoff`.
  Lưu ý: dev local giờ chạm **dữ liệu production** self-host.

### 12/10/2026 — BUILD 11 ĐÃ UPLOAD + PR #10 (đã merge)

**Trạng thái:** build 11 "Upload succeeded" (archive: CFBundleVersion 11 cho app +
widget, 0 chuỗi `WordlyUIPreview`). Nhánh `chore/ios-build-11` đã push, **PR #10
vào `main` chưa merge**. Web trên VPS = đúng code của PR (deploy lần cuối từ
`6126c2c`, sau đó chỉ đổi iOS). 119/119 unit test iOS, 228/228 test web; UI test
mới: `HistoryPickUITests`, `SavedWordSheetUITests`, `WidgetDeepLinkUITests`,
`ProfileScreenUITests`, `PendingSignupUITests` đều pass.

**Đã làm trong build 11 (so với build 10):**
- Widget: bỏ ảnh nền (crash), chỉ hiện từ + nghĩa (bỏ nhãn/logo, chữ tự thu nhỏ
  trước khi cắt "…"), căn trái/giữa/phải, bấm widget mở đúng từ (Đã lưu / Từ mới
  + popup), đăng xuất thì nhắc đăng nhập (xoá cả lô từ kho).
- `HomeStyle` giải mã chịu thiếu khoá (trước đây thiếu khoá → mất hết cài đặt widget).
- Màn Cá nhân làm lại: tên 1 chỗ → màn "Hồ sơ học tập" (Lưu trên bản nháp), link
  Chính sách quyền riêng tư + Hỗ trợ, version gọn.
- Popup nghĩa (Đã lưu / Từ mới) căn trái, cao vừa nội dung (`FitContentSheet`).
- Lịch sử dịch: chọn mục → cuộn lên đầu, không tự tra từ điển; nhấn giữ xoá
  (**commit 4ebd9e7 trước đây báo xong nhưng quên gắn contextMenu** — giờ mới chạy
  thật); bấm vào khoảng trống giữa dòng giờ ăn.
- Ẩn nút "Gửi email thử". Chữ/viền chế độ sáng đậm hơn (ink #2B2B2B, phụ #5E5E5E,
  mờ #8C8C8C, viền #D9D9D9).
- Hiệu năng: lịch sử dịch không còn dựng lại view mỗi 10s (làm mới ngầm), gõ nhanh
  không báo "Mất kết nối" sai, tab Đã lưu 1 lần gọi `?saved=1` (0,2s), cache bản
  dịch phía server (dịch lại 0,98s → 0,26s, đo production), mở app chỉ đồng bộ
  widget khi đã quá 5 phút.

**Production (đã làm, đã kiểm):**
- **Trigger `on_auth_user_created` bị mất từ lúc chuyển sang self-host** (baseline
  chỉ dump schema public) → tài khoản mới không có hồ sơ, `/api/profile` 500. Đã
  chạy migration `20261012000100_restore_new_user_trigger` (46/46 user có hồ sơ,
  test user mới tự có hồ sơ). `/api/profile` GET dùng `maybeSingle`.
- `support@wordly.skillproof.work` chuyển tiếp về Gmail qua ImprovMX (MX + SPF ở GoDaddy).

**Chưa làm / còn treo:**
1. **Merge PR #10** vào `main`.
2. **Nộp App Store**: chọn build 11, điền mật khẩu tài khoản demo
   `huythien7122+wordlytest@gmail.com`. Ảnh `docs/app-store/screenshots-6.9/` chụp
   trước khi đổi màn widget/Cá nhân — nên chạy lại `AppStoreScreenshotTests`.
   Hồ sơ nộp (artifact "Wordly App Store Kit") còn ghi build 9/10.
3. Kiểm trên máy thật (simulator không làm được): bấm widget thật mở đúng từ; hiển
   thị widget màn hình khoá/chính với căn lề + chữ dài; nhập mã OTP từ email thật.
4. Cài đặt email "tải lâu": server đo ~0,2s, chưa tái hiện được — nhờ thử lại trên
   build 11 (có thể do tài khoản thiếu hồ sơ, đã sửa bằng migration).
5. Xoá tài khoản chưa thu hồi token Sign in with Apple (Apple khuyến nghị).
6. Nợ có từ trước: `/api/translate-history` dùng service role (`createAdminClient`)
   cho request người dùng — trái quy tắc 5, có lọc `user_id` nhưng nên chuyển sang
   client RLS.
7. Luyện nói với Alex đang ẩn bằng `AppRouter.alexPracticeEnabled = false`.

### 11/10/2026 (khuya) — BUILD 10: đăng ký + quên mật khẩu bằng mã OTP

**Build 10 — "Upload succeeded"** (0 chuỗi WordlyUIPreview, CFBundleVersion 10).
111/111 unit test, 220/220 test web, UI test `PendingSignupUITests` pass.

- Quên mật khẩu: gửi mã 6 số → nhập mã + mật khẩu mới trong app. Đăng ký: nhập
  mã 6 số trong app rồi vào học luôn. Email đang chờ xác nhận được nhớ qua các
  lần mở app; đăng nhập bằng email chưa xác nhận tự gửi mã mới.
- Link email cũ rơi về trang chủ vì: redirect chưa cho web, app không kèm
  redirect, middleware đẩy người đã đăng nhập khỏi /reset-password, và mã PKCE
  nằm trong app. Đã sửa cả 4 (web dùng `/auth/confirm` + token_hash).
- GoTrue: mẫu email tiếng Việt `web/public/email-templates/` (mã + link web),
  `GOTRUE_MAILER_OTP_EXP=3600`, redirect cho phép `https://app.wordly.skillproof.work/**`.
- Đã kiểm hành vi GoTrue thật cho 6 kịch bản (xem commit 90637b1).
- **Bản nộp App Store nên chọn build 10.**

### 11/10/2026 (tối) — BUILD 9 ĐÃ UPLOAD + chuẩn bị nộp App Store

**Build 9 — "Upload succeeded"**: gồm mọi thay đổi từ sau build 8 (nhấn giữ xoá
lịch sử, popup nghĩa từ đã lưu, ghi âm dịch trực tiếp + chọn ảnh thư viện,
tuỳ biến widget màn hình chính, ẩn Alex, nút sửa tên, **xoá tài khoản**). Kiểm
archive: CFBundleVersion 9, 0 chuỗi `WordlyUIPreview`, mô tả quyền mic mới.
102/102 unit test, 215/215 test web.

**Đã deploy production (web + VPS):**
- `DELETE /api/account` — test thật bằng user tạm: user có `email_slots` (FK duy
  nhất không ON DELETE CASCADE) xoá sạch, user 404, 0 dòng sót.
- Trang công khai `/privacy`, `/support` (200 qua HTTPS, không sidebar).
- nginx webapp `client_max_body_size` 1m → 15m (backup `/root/wordly.prod.webapp.conf.bak-*`,
  `nginx -t` + reload). Body 14.6MB đi qua được.

**Hồ sơ App Store**: artifact "Wordly App Store Kit" (tên, mô tả, từ khoá đã đếm
ký tự, App Privacy, độ tuổi, ghi chú reviewer); ảnh 6.9" ở
`docs/app-store/screenshots-6.9/` (chụp lại: UI test `AppStoreScreenshotTests`).

**Chờ chủ dự án:**
- ✅ (đã sửa) **SMTP GoTrue hỏng từ lúc migrate** (`SMTP_HOST=supabase-mail`, không
  tồn tại) → giờ qua Resend cổng 2587 (DO chặn 465/587), xem `infra/vps/README.md`.
  Test `/auth/v1/recover` → 200. Còn cần chủ dự án xác nhận thư tới hộp thư thật.
- ✅ (đã xong) Hộp thư `support@wordly.skillproof.work` — ImprovMX chuyển tiếp về
  `huythien7122@gmail.com` (MX `wordly` → mx1/mx2.improvmx.com + SPF, DNS ở GoDaddy).
  Thư thử đã tới Gmail.
- Mật khẩu tài khoản demo cho Apple reviewer.
- Chưa có: thu hồi token Sign in with Apple khi xoá tài khoản (Apple khuyến nghị).

### 11/10/2026 — iOS 1.0.0 BUILD 8 ĐÃ UPLOAD TestFlight

Đăng nhập lại Xcode bằng Apple ID `huythien712@icloud.com` (program "TRAN PHAN
HUY THIEN") → export lại từ archive có sẵn (không build lại) →
**"Upload succeeded"**, App Store Connect đang xử lý. Chưa test tay các tính
năng mới (chụp ảnh dịch, ghi âm dịch, quiz chấm ngay từng câu, widget settings
mới) trên TestFlight/máy thật — chỉ kiểm qua build sạch + 102/102 unit test.

**Đã làm xong, đã commit, 102/102 unit test pass (full suite), build Debug/Release sạch:**
1. Luyện nói: gỡ nút "Xong" thừa góc trên vòng quay chủ đề (`1c6c8e6`-nhánh SpeakSpinnerView, đã có từ trước, thấy kèm batch này).
2. Widget Settings: đơn giản hoá "Nguồn từ" (2 lựa chọn + DisclosureGroup "Tự chọn từng từ" thu gọn), thêm `LockStyle` (đầy đủ/gọn chữ to) + `HomeTheme` (3 màu nền) cho widget màn hình khoá/chính (`4b018cc` + commit trước đó thêm 2 tests).
3. Quiz: chấm điểm ngay từng câu qua `POST /api/quiz/check` (web đã deploy trước đó) — không phải làm hết bài mới biết đúng/sai (`abc73c2`).
4. Widget Settings: preview giờ cuộn ngang 5 thẻ sắp tới (trước chỉ 1 từ) — dùng thẳng `WidgetSchedule.entries` (`4b018cc`).
5. **Mang tính năng chụp ảnh dịch + ghi âm dịch từ web sang iOS native** (`10419ca`):
   - Chụp ảnh: `CameraPicker` (UIImagePickerController, camera → fallback photo library trên simulator) → JPEG → base64 data URL → `POST /api/translate/image` (Gemini vision OCR+dịch 1 lần, khớp đúng web, giữ nguyên giới hạn 5MB).
   - Ghi âm: `DictationManager` mới (Speech framework on-device, ghi 1 lần bấm start/stop, KHÔNG dùng VAD liên tục như `SpeechManager` của luyện nói Alex — tách riêng để không đụng code đó) → text → dịch qua pipeline DeepL có sẵn (`/api/translate`). **Quyết định kiến trúc:** bỏ qua hoàn toàn việc port `/api/translate/voice` (Whisper fallback) vì iOS luôn có STT on-device miễn phí, web chỉ dùng Whisper khi trình duyệt không có Web Speech API.
   - Thêm `NSCameraUsageDescription` vào `project.yml`, cập nhật mô tả mic/speech cho rõ dùng cả 2 tính năng.

**Build 8 (`CURRENT_PROJECT_VERSION=8`, bump `6df52f2`):**
`xcodegen generate` → Debug build OK → 102/102 test pass → Archive Release
(`-allowProvisioningUpdates`, team `929P8F77XX`) → export `app-store-connect`
→ **"Upload succeeded"** (sau khi đăng nhập lại Apple ID ở Xcode — máy này bị
đăng xuất, chặn export lần đầu, xem log cũ nếu cần debug lại tình huống này).

**Chờ quyết định / chờ hành động của chủ dự án:**
- Test tay các tính năng mới trên TestFlight khi Apple xử lý xong (chụp ảnh dịch, ghi âm dịch, quiz chấm ngay từng câu, widget settings mới).

---

### 10/10/2026 (tối) — iOS 1.0.0 BUILD 7 ĐÃ UPLOAD TestFlight + thay Inngest bằng cron VPS

**iOS build 7 — "Upload succeeded" (App Store Connect đang xử lý):**
Archive Release từ `main` (`4d03585`), `-allowProvisioningUpdates`, export
`method: app-store-connect` → upload thành công, kèm widget (cùng archive).
Verify trước khi export: 0 chuỗi `WordlyUIPreview` trong binary Release,
Info.plist đúng `CFBundleVersion=7`, domain mới
(`api.wordly.skillproof.work`/`app.wordly.skillproof.work`).
**3 UI test fail lúc chạy chung session trước → chạy lại riêng từng cái
trên simulator mới boot sạch → PASS cả 2 (`HistoryClearUITests`,
`KeyboardDismissUITests`)** — xác nhận đúng là flaky do simulator bị cài/gỡ
liên tục lúc debug, không phải lỗi thật.

**⚠️ CHƯA test login Google/Apple thật trên iOS trước khi upload** — chỉ
verify được qua ảnh chụp simulator (launch không crash, màn hình đúng),
simulator không tap tự động được nên không tự kiểm tra tay OAuth được.
Chủ dự án quyết định upload luôn, chấp nhận rủi ro này — **cần tự test
đăng nhập Google/Apple trên máy thật/TestFlight ngay khi bản build 7 xử lý
xong**, trước khi mời người dùng khác cập nhật.

**iOS (chi tiết thay đổi trong build 7):**
- Endpoint đổi sang domain tự host: `Secrets.xcconfig` (gitignore) trỏ
  `app.wordly.skillproof.work` / `api.wordly.skillproof.work`, `ANON_KEY`
  mới từ self-host. Build simulator thành công, launch không crash, verify
  bằng ảnh chụp (Info.plist bake đúng domain mới, không còn
  `placeholder.supabase.co`). **Chưa test login Google/Apple thật trên iOS**
  (simulator không tap tự động được — cần làm tay trước khi upload build 7).
- Thêm `GOTRUE.../ADDITIONAL_REDIRECT_URLS` trên VPS cho
  `com.thientran.wordly://login-callback` (trước đó trống — thiếu thì
  login app sẽ bị từ chối redirect).
- UI: logo Google đổi từ chữ "G" gradient tự vẽ sang logo G chính thức 4
  màu (`GoogleLogoIcon.swift`, vector path thật theo brand guideline).
  Popup đăng xuất đổi từ `confirmationDialog` (action sheet từ dưới) sang
  `.alert` (giữa màn hình). Sửa placeholder email tô nhầm màu xanh link hệ
  thống (lỗi `Text(_:)` dùng init `LocalizedStringKey` tự parse Markdown và
  auto-link chuỗi giống email — đổi `Text(verbatim:)`).
- 3/4 UI test fail lúc chạy chung (`HistoryClearUITests`,
  `KeyboardDismissUITests`) — **đã xác nhận flaky**: chạy riêng từng test
  trên simulator mới boot sạch → cả 2 PASS. Đúng như nghi ngờ, do cài/gỡ
  app liên tục lúc debug làm simulator không kịp ổn định, không phải lỗi
  thật liên quan tới thay đổi hôm nay.

**Web — thay Inngest bằng cron VPS cho email nhắc học (quyết định của chủ
dự án, giảm phụ thuộc khi đã tự host):**
- `scheduleAllSlots`/`sendSlotEmail`/`watchdogReschedule` (Inngest
  `sleepUntil` tới đúng giờ mỗi user) → cron VPS `*/5 * * * *` gọi
  `POST /api/cron/send-emails`, tự hỏi DB "ai tới giờ gửi" (polling thay
  event-driven). Logic chọn nội dung/gửi/ghi log giữ nguyên y hệt bản cũ.
  `isSlotDueNow()` tách riêng, test TDD 10 ca (RED→GREEN xác nhận).
- Gỡ mọi `inngest.send()` ở `email-slots`/`email-preferences` (không cần
  báo lịch — cron tự quét), xóa route `admin/trigger-inngest-all` đã vô
  dụng. Inngest Cloud giờ chỉ còn `cleanupRateLimitCounters`.
- **Verify thật trên production:** gọi tay endpoint qua CRON_SECRET → trả
  đúng dữ liệu thật (`checked: 8` slot). Đợi 1 chu kỳ crontab tự chạy (6
  phút) → xác nhận log mới xuất hiện tự động, không phải do gọi tay.
  **Chưa chứng kiến 1 lượt gửi email THẬT** (không có slot nào rơi đúng
  cửa sổ 5 phút lúc kiểm — gần nhất là slot `00:00` Asia/Saigon, ~1h44
  sau) — nên theo dõi `send-emails-cron.log` trên VPS ngày mai để xác nhận
  gửi thật thành công.
- `npm test` 211/211 (211 = 201 trước + 10 test mới), `eslint` sạch,
  `next build` sạch. Deploy lên VPS: archive + rebuild image + recreate
  container, verify 200 cả nội bộ lẫn domain public.

### 10/10/2026 — Xóa hẳn code B2B (trung tâm tiếng Anh), chuẩn bị hạ tầng VPS

Chủ dự án quyết định bỏ hẳn tính năng B2B (trung tâm/lớp/giáo viên/học
sinh/học phí), tập trung hoàn toàn B2C. Đã xóa trên branch
`chore/remove-b2b` (tách từ `main`, chưa merge): toàn bộ route `(org)`,
`api/orgs|classes|homework|speaking|materials|tuition|join`, `lib/org/`,
`lib/tuition/`, `components/org/`, Inngest jobs B2B
(`src/inngest/org-functions.js`), test tương ứng. Gỡ nhánh B2B khỏi route
quiz B2C (`api/quiz/route.js` không còn gắn `class_id`/`org_id` vào
`quiz_attempts`). Giữ lại `cleanupRateLimitCounters` (dọn bảng rate-limit
Postgres dùng chung toàn hệ thống, B2C) — bị gộp nhầm vào
`org-functions.js` trước đây, đã chuyển sang `src/inngest/functions.js`.

**Kiểm chứng:** `npm test` 226/227 pass (1 fail pre-existing không liên
quan, từ tính năng camera OCR đang làm ở session khác). `next build`
"Compiled successfully", route list xác nhận sạch B2B, `/speak` (Spinner
B2C) vẫn còn. `eslint` sạch trên các file sửa.

**Đã viết nhưng CHƯA CHẠY:** `supabase/migrations/20261010000200_remove_b2b.sql`
(DROP 23 bảng + 8 function B2B, drop 3 cột `org_id`/`class_id`/`membership_id`
khỏi `quiz_attempts`). **Thứ tự bắt buộc trước khi chạy:** tắt Custom Access
Token Hook trên Supabase Dashboard → Auth → Hooks TRƯỚC, verify login vẫn
OK, rồi mới chạy migration — sai thứ tự sẽ khiến MỌI user (cả B2C) không
đăng nhập được.

**Chờ quyết định:** thời điểm chạy migration thật lên production (có dữ
liệu "trung tâm demo" `7c0dfec9-...` sẽ mất vĩnh viễn — chủ dự án đã xác
nhận xóa). Sau khi B2B dọn xong, bước tiếp theo là chuyển hạ tầng sang VPS
tự quản (xem `docs/superpowers/specs/2026-10-10-vps-self-hosted-infra-design.md`).

**Cập nhật:** 10/10/2026 — code B2B đã merge vào `main` (branch `chore/remove-b2b` + `chore/cleanup-b2b-leftovers`), VÀ migration xóa bảng/function B2B đã CHẠY THẬT lên production.

**Migration `20261010000200_remove_b2b.sql` — ĐÃ CHẠY production (10/10/2026):**
Thứ tự đã làm: (1) tắt "Customize Access Token (JWT) Claims" hook ở Dashboard → Auth → Hooks, (2) test login tài khoản thật → thành công, (3) `supabase link --project-ref blattojsgqyhoxkglind` rồi `supabase db query --linked --file supabase/migrations/20261010000200_remove_b2b.sql`.
**Verify sau khi chạy:** 6 bảng B2B mẫu (`organizations`, `classes`, `memberships`, `homework`, `tuition_records`, `class_sessions`) + 4 function mẫu (`custom_access_token_hook`, `is_org_member`, `join_class_by_code`, `set_vnpay_secret`) đều không còn tồn tại; 3 cột B2B trên `quiz_attempts` (`org_id`/`class_id`/`membership_id`) đã mất. Dữ liệu B2C nguyên vẹn: `quiz_attempts` 12 dòng, `translate_history` 136 dòng.
**Trung tâm demo `7c0dfec9-...` đã mất vĩnh viễn** (theo xác nhận xóa trước đó).
**Chưa làm:** chủ dự án chưa tự test login lại lần nữa sau migration (chỉ test sau khi tắt hook, trước khi chạy migration) — nên thử lại 1 lần khi rảnh để chắc chắn tuyệt đối.

**Branch:** đã merge hết vào `main`. `main` giờ không còn code B2B VÀ không còn bảng/function B2B trên production.
**Môi trường:** production hiện tại = B2C only. R2: bucket `wordly-videos` tạo xong, không đổi (video B2B dùng storage riêng — xem mục "Còn thiếu dọn dẹp thủ công" bên dưới, chưa kiểm).
**Test:** `npm test` 226/227 (1 fail pre-existing không liên quan, từ WIP OCR camera translate ở session khác).

**Mục 2 (`PRODUCT.md`) — ĐÃ KIỂM, KHÔNG CẦN SỬA theo hướng B2B:** đọc lại
toàn bộ, `PRODUCT.md` **không hề mô tả B2B** — giả định trong prompt bàn
giao sai. File này lỗi thời theo hướng khác (model AI Groq llama-3.1/3.3 cũ
thay vì Gemini ladder hiện tại ở `ai-models.js`, thiếu R2/video, số liệu
route API outdated — last touch 6/10/2026, tức TRƯỚC khi B2B deploy 4/9).
Viết lại toàn bộ là việc riêng, lớn — chủ dự án chọn dừng, chưa làm.

**Mục 3 (dọn dữ liệu/chi phí thật B2B) — ĐÃ XONG 10/10/2026:**
Kiểm + xóa sau khi xác nhận, verify lại = 0 object còn sót:
- Storage bucket `lesson-materials`: 0 object từ đầu, không cần làm gì.
- Storage bucket `speaking-submissions`: xóa 2 object (`seed-0.webm`,
  `seed-1.webm`, ~23KB mỗi file) của org demo `7c0dfec9-4730-40ad-8e5f-68cec68e0147`
  qua `supabase.storage.from(...).remove()` (service role) — xóa qua SQL
  DELETE trên `storage.objects` KHÔNG xóa file thật, phải dùng Storage API.
- Secret `vnpay_hash_secret_<org_id>` trong Vault: đã sạch từ trước (0 secret
  tìm thấy) — khả năng tự dọn qua trigger `cleanup_vnpay_secret` khi org demo
  bị xóa trước đó, hoặc do CASCADE của migration.
- R2 bucket `wordly-videos`: 77 object tổng, 76 thuộc `tts/*` (cache hợp lệ,
  giữ nguyên), 1 video sót của org demo (`7c0dfec9-.../.../9711cbde-....mp4`,
  8KB) — đã xóa qua `DeleteObjectCommand`. List bằng `ListObjectsV2Command`
  group theo prefix cấp 1 là cách nhanh để soát toàn bucket (77 object, ít,
  không cần phân trang nhiều).

**Còn lại từ prompt bàn giao 10/10/2026:**
5. Gợi ý chưa quyết: module TypeScript mới (đấu từ vựng real-time), đổi Auth.js/Lucia thay Supabase Auth — cần brainstorm riêng.

### 10/10/2026 — Mục 4: Hạ tầng VPS tự host — HẠ TẦNG SỐNG trên domain mới, CHƯA cắt DNS thật

Branch `chore/vps-self-hosted-infra` (tách từ `main`, chưa merge). Plan chi
tiết: `docs/superpowers/plans/2026-10-10-vps-self-hosted-migration.md`
(ledger đầy đủ từng bước + ruling ở
`.superpowers/sdd/2026-10-10-vps-self-hosted-migration/progress.md`, gitignored).

**Domain & VPS:** `wordly.skillproof.work` — subdomain của hạ tầng chung
`skillproof.work`, KHÔNG phải domain riêng. VPS **dùng chung**
`167.99.74.215` (DigitalOcean `ubuntu-s-2vcpu-4gb-sgp1`, Ubuntu 24.04) với
2 product khác không liên quan (`localex` staging, `pehub` prod) — đã kiểm
không đụng tài nguyên/port/container của 2 app đó ở mọi bước.

**Đã xong (verify thật, không suy đoán):**
- User `deploy-wordly` (group `docker`, không sudo) + layout
  `/opt/wordly/prod/{web,supabase}/`, `/var/backups/wordly/prod/`.
- Supabase self-hosted (Docker Compose chính thức) — dùng **Envoy**
  ("api-gw"), KHÔNG phải Kong như spec gốc giả định (bản mới của
  `supabase/supabase`). 11/11 container healthy.
  **Lỗ hổng bảo mật tự phát hiện + đã vá:** `docker-compose.yml` mặc định
  bind Postgres (5432, 6543 qua pooler) và gateway (8000) ra `0.0.0.0` —
  kiểm bằng `nc` từ máy local xác nhận **cả 3 cổng thật sự mở ra internet**,
  bỏ qua `ufw` (Docker tự thêm rule iptables, lỗi kinh điển Docker+ufw). Đã
  sửa bind `127.0.0.1` cho cả 3, verify lại = không còn truy cập được từ
  ngoài, nội bộ vẫn hoạt động đúng.
- Migrate schema + data từ Supabase Cloud (`supabase db dump`) sang Postgres
  self-host (`docker exec ... psql`, không có `psql` local nên pipe qua SSH
  stdin). **Đối chiếu row-count khớp 100%** trên 6 bảng mẫu: `translate_history`
  136/136, `journal_entries` 6/6, `profiles` 44/44, `quiz_attempts` 12/12,
  `email_log` 296/296, `words` 7504/7504. File dump tạm (chứa dữ liệu người
  dùng thật) đã xoá khỏi máy local sau khi verify.
- `custom_access_token_hook` — xác nhận KHÔNG còn tồn tại ở cả self-host
  VÀ Cloud (migration xóa B2B đã `DROP FUNCTION` nó) → phần "cấu hình lại
  hook JWT" trong spec gốc **không còn cần làm nữa**, B2B removal đã giải
  quyết luôn việc này.
- `web/Dockerfile` (multi-stage) + `output: "standalone"` trong
  `next.config.mjs` — build + chạy local verify HTTP 200. Container chạy
  trên VPS ở `127.0.0.1:13500`, verify HTTP 200, không trùng port với
  container nào khác trên box.
- nginx vhost `wordly.prod.webapp.conf` + `wordly.prod.api.conf` (HTTP, port
  80) — `nginx -t` sạch, `nginx -s reload` (không restart) — verify `localex`/
  `pehub` vẫn 200 sau reload, Wordly app/api vhost hoạt động đúng qua Host
  header (401 không có `apikey` trên route `/auth/v1/health` là hành vi
  ĐÚNG của Envoy, không phải lỗi).
- Backup Postgres: cron `deploy-wordly` 20:00 UTC (3h sáng giờ VN) hàng
  ngày, giữ 7 bản. Test chạy tay 1 lần: file `.sql.gz` ~974KB tạo thành
  công. **Sửa 1 lỗi tự phát hiện:** cron log ban đầu trỏ `/var/log/` —
  `deploy-wordly` không có quyền viết (sẽ fail âm thầm mỗi đêm) — đã đổi
  sang `/var/backups/wordly/prod/backup.log`.

**CẬP NHẬT 10/10/2026 (cuối ngày) — HẠ TẦNG MỚI SỐNG, ĐÃ VERIFY END-TO-END
BẰNG LOGIN THẬT. DNS + OAuth đã xong (chủ dự án tự làm).**

**3 lỗi chỉ lộ ra khi test login thật (không bắt được bằng curl/200), đều
đã sửa + deploy + verify lại:**
1. `web/Dockerfile` bake `NEXT_PUBLIC_SUPABASE_URL=placeholder...` lúc build
   — Next.js inline biến `NEXT_PUBLIC_*` vào JS phía client ngay lúc build,
   KHÔNG đọc được từ env runtime container. Browser gọi thẳng
   `placeholder.supabase.co` → `DNS_PROBE_FINISHED_NXDOMAIN`. Sửa: Dockerfile
   nhận `ARG`, build lại với `--build-arg` giá trị thật từ `.env` tự host.
2. nginx `upstream sent too big header` trên `/auth/callback` — cookie
   session Supabase (chứa JWT) vượt buffer mặc định nginx. Sửa: thêm
   `proxy_buffer_size 16k; proxy_buffers 4 16k; proxy_busy_buffers_size 32k;`
   vào cả 2 vhost Wordly.
3. Redirect sau login nhảy ra hostname nội bộ container
   (`https://2007961e65f5:3000`) thay vì domain thật — `auth/callback/route.js`
   dùng `new URL(request.url).origin`; Vercel tự xử lý đúng nên lỗi này
   chưa từng lộ ra trước đây, chỉ lộ khi tự host sau nginx. Sửa: ưu tiên đọc
   header `X-Forwarded-Host`/`X-Forwarded-Proto` (thêm `X-Forwarded-Host`
   vào nginx, trước đó thiếu).

**Verify end-to-end bằng tài khoản thật (chủ dự án tự làm, không suy đoán):**
Login Google → thành công. Dịch + lưu từ → thành công, `translate_history`
136→137 (xác nhận qua query DB trực tiếp). Lịch sử 136 từ migrate hiển thị
đầy đủ trên trang chủ. **Chưa kiểm:** gửi email thử — tìm trong code
`(learner)/profile*` không còn thấy nút "gửi email thử" (có thể đã bỏ từ
sau ghi chú 6/10/2026) — Gmail SMTP env copy y nguyên, không đổi, nhưng
CHƯA xác nhận gửi thật qua domain mới.

**Review toàn branch (fresh reviewer, Opus) sau khi verify xong — 3 lỗi
mức Important tìm thêm, đã sửa + test TDD + deploy + verify lại:**
1. Link email (nhắc học...) sẽ trỏ `http://localhost:3000` trên VPS — thiếu
   `NEXT_PUBLIC_APP_URL`. Đã thêm vào `.env` VPS + `web/.env.example`.
2. Dockerfile: thiếu `--build-arg` thì build vẫn "thành công" nhưng bake
   chuỗi rỗng vào JS (tái diễn lỗi #1 ở trên tại lần rebuild sau). Đã thêm
   `RUN test -n ...` chặn build nếu thiếu — verify RED (thiếu arg → fail
   đúng), GREEN (đủ arg → qua).
3. `auth/callback` nhận `next=` không kiểm tra → open redirect
   (`next=@evil.com`, `next=//evil.com`...), lỗi có từ trước (không phải do
   lần sửa domain), lộ ra khi review. Tách `safeRedirectPath()` ra
   `lib/auth/`, 7 test TDD (RED→GREEN), dùng trong route.
4. 4 lỗi Minor để lại, chưa sửa (không ảnh hưởng người dùng ngay):
   thiếu build-arg cho GA measurement ID (phân tích thiếu, không phải lỗi
   chức năng); rủi ro còn lại ở `X-Forwarded-Host` nếu ai đó sửa
   `docker-compose.yml` trên VPS cho bind `0.0.0.0` (file này không nằm
   trong git — cùng loại rủi ro với lỗ hổng Postgres/Envoy đã vá ở bước
   dựng Supabase); route `api/auth/logout` có cùng lỗi `request.url` như
   callback nhưng là dead code (không ai gọi); Dockerfile thiếu
   `.dockerignore` + chạy bằng root (hygiene, không phải lỗi).

`npm test` 201/201, `eslint` sạch, `next build` sạch sau fix pass. Deploy
lại lên VPS, verify: `NEXT_PUBLIC_APP_URL` có trong container, domain public
vẫn 200.

**Còn lại — cần xác nhận riêng, KHÔNG làm trong lần này (không hoàn tác
được / breaking change cho user TestFlight):**
1. Đổi iOS app endpoint (Vercel → `app.wordly.skillproof.work`,
   `*.supabase.co` → `api.wordly.skillproof.work`) + build lại + TestFlight.
2. Tắt Vercel project + Supabase Cloud project — chỉ làm sau khi theo dõi
   hạ tầng mới ổn định một thời gian.
3. (Tuỳ chọn, không gấp) Đưa `docker-compose.yml`/nginx config trên VPS vào
   git để tránh rủi ro cấu hình trôi không ai biết — hiện toàn bộ config
   hạ tầng chỉ sống trên VPS, không version control.

Chi tiết từng bước + mọi ruling: `docs/superpowers/plans/2026-10-10-vps-self-hosted-migration.md`.
Ledger thực thi (gitignored, đã xoá sau khi review xong — nội dung quan
trọng đã gộp vào mục này).

**Sự cố nhỏ xảy ra giữa phiên:** session khác (đang làm OCR ảnh/ghi âm,
cùng checkout không phải worktree) vô tình `git checkout main` rồi merge
tính năng của họ giữa lúc tôi đang SSH làm VPS — không mất dữ liệu (đã
merge `main` vào branch VPS, cả 2 bên đều còn), nhưng là bài học: 2 session
cùng checkout cần báo nhau trước khi đổi branch.

### 7/10/2026 — Xoá mềm ĐÃ LÊN production + iOS 1.0.0 (build 6) ĐÃ UPLOAD

Migration `20261007000100_soft_delete_history` đã chạy production qua `supabase db query --linked` (kiểm: 2 cột + 2 index có mặt, 106 từ đã lưu nguyên vẹn) → PR #8 merge (`3a036b9`), Vercel Production `success` → build 6 archive từ main, 1.0.0 (6) app + widget, "Upload succeeded". **Lần upload sau: build 7.**
**Chưa kiểm bằng tài khoản thật:** "Xoá hết" + Hoàn tác trên production (middleware trả 401 cho mọi route khi chưa đăng nhập nên không kiểm từ ngoài được).

### 7/10/2026 — Sự cố mất dữ liệu + xoá mềm (chi tiết)

**Sự cố:** tài khoản huythien7122@gmail.com bấm nhầm "Xoá hết" (~19h 7/10) → API xoá CỨNG toàn bộ `translate_history` kể cả từ đã lưu. Project gói Free: `pitr_enabled: false`, `backups: []` (kiểm qua `supabase backups list`) → không khôi phục từ backup được.
**Đã cứu:** 106 từ đã lưu + nghĩa, bóc từ ~200 email nhắc học trong Gmail (khớp 100% nhật ký `email_log`, bỏ từ test ngày 7/6) → đã INSERT lại production (87 dòng giữ id gốc). **Mất hẳn:** lịch sử chưa lưu, từ lưu sau 25/8 (email dừng từ đó), toàn bộ sổ tay.

**Sửa (chống lặp lại):**
| Phần | Việc |
|---|---|
| Migration `20261007000100_soft_delete_history.sql` | Cột `deleted_at` cho `translate_history` + `journal_entries`, index một phần `where deleted_at is null` |
| API | Xoá = đặt `deleted_at`; "Xoá hết" chỉ xoá mục CHƯA lưu, trả `ids`; `POST /api/translate-history/restore`, `/api/journal/restore`; lịch sử/quiz/email/gợi ý Alex/sổ tay lọc `deleted_at is null`. Streak + snapshot vẫn đếm dòng đã xoá (hôm đó có học thật) |
| Web + iOS | Nút xoá dời khỏi cạnh mũi tên thu gọn → cuối danh sách "Xoá lịch sử chưa lưu"; popup xác nhận nói rõ giữ từ đã lưu; thanh "Hoàn tác" 6 giây |

**Kiểm chứng:** web 313/313 (6 test mới `history-delete`), `next build` sạch; iOS 105/105 + 4/4 UI test (mới: xoá → xác nhận → từ đã lưu còn → hoàn tác).
**Thứ tự deploy BẮT BUỘC:** chạy migration → deploy web → mới phát hành app. Code mới chạy với DB cũ sẽ lỗi (cột chưa có); app mới chạy với server cũ thì "Xoá hết" vẫn xoá cứng.
**Chưa làm:** dọn hẳn dòng đã xoá mềm sau N ngày (tuỳ chọn); route translate-history vẫn dùng service role cho request người dùng (nợ có từ trước, quy tắc #5).

### 7/10/2026 — iOS 1.0.0 (build 5) ĐÃ UPLOAD — sửa bàn phím khó tắt

Chạm ra ngoài ô nhập ở mọi màn → đóng bàn phím (`Shared/Components/KeyboardDismiss.swift`, gắn lên cửa sổ, không chặn chạm); vuốt cuộn kéo bàn phím xuống; chat Alex giữ bàn phím sau khi gửi. Thêm target **UI test** `WordlyiOSUITests` (chế độ xem trước, không cần đăng nhập).
**Kiểm chứng:** 103/103 unit + 3/3 UI test; tắt bản sửa → 2 UI test "chạm ngoài thì đóng" fail (đã kiểm). Archive 1.0.0 (5) app + widget, 0 chuỗi xem trước → "Upload succeeded". (đã thay bằng build 6)
**Chưa kiểm trên máy:** màn đăng nhập, màn lớp học (cùng cơ chế toàn app).

### 7/10/2026 — iOS 1.0.0 (build 4) ĐÃ UPLOAD lên App Store Connect

Archive từ `main` sau khi merge PR #5 (`d3d01b4`): code iOS giống build 3, cộng các bản sửa web của PR #2/#3/#4 đã lên production. 100/100 test iOS, archive 1.0.0 (4) cho cả app + widget, 0 chuỗi chế độ xem trước → "Upload succeeded". (đã thay bằng build 5)

### 7/10/2026 — iOS 1.0.0 (build 3) ĐÃ UPLOAD lên App Store Connect

Archive Release từ `feat/mobile-restructure` (UI 5 tab + trộn từ kho + icon phẳng, mục dưới). Kiểm archive: version 1.0.0 (3) cho cả app + widget, 0 chuỗi chế độ xem trước, ký team 929P8F77XX. `xcodebuild -exportArchive` → "Upload succeeded". (đã thay bằng build 4)

### 7/10/2026 — iOS: cấu trúc lại UI + trộn từ kho (branch `feat/mobile-restructure`, xếp TRÊN `feat/ios-feature-parity`, CHƯA commit/push)

| Việc | Ghi chú |
|---|---|
| 5 tab, bỏ Trang chủ | **Dịch** (tab đầu, kiểu Google Dịch) · **Từ vựng** (Đã lưu / Kho theo chủ đề) · **Ôn tập** (Quiz / Sổ tay) · **Luyện nói** (Alex / Vòng quay — phiên chat giữ khi chuyển) · **Cá nhân** (chuỗi ngày học + cài đặt) |
| Widget trộn từ kho | `WordMix` (Shared/Widget): chống trùng (chuẩn hoá chữ), 2 từ của bạn : 1 từ kho, mỗi vòng xáo thứ tự khác (hạt giống = số vòng), không lặp ở chỗ nối vòng, kho lớn không át từ của bạn. Lô kho đổi mỗi ngày/khi đổi trình độ (`BankWords`, đọc thẳng bảng `words` qua Supabase). Bật/tắt: Widget → "Trộn từ mới từ kho" |
| Email trộn từ kho (web) | `selectBankWords` + `pickBankWords`: +1 từ kho mỗi email, bỏ từ người dùng đã dịch, bỏ từ kho đã gửi trong 60 ngày; nhãn "📚 Từ mới từ kho". Cả email thử |
| Logo/app icon | Nền xanh phẳng một màu `#6BCA03` (bỏ mép sáng + nhiễu); bỏ khung gradient quanh logo ở màn đăng nhập/splash |

**Kiểm chứng:** iOS 100/100 test, build simulator OK, ảnh chụp 5 tab + widget settings đã soát. Web 283/283, `next build` sạch, eslint sạch.
**Phát hiện:** production KHÔNG có cột `words.def_vi` → từ kho hiện **định nghĩa tiếng Anh** (`def_en`). Đây cũng là gốc lỗi quiz 500 (PR #4 chọn `def_vi`).
**Chưa kiểm:** email thật chưa gửi (cần deploy web); widget thật trên màn hình khoá.
**Chờ chủ dự án:** muốn nghĩa tiếng Việt cho từ kho → cần migration thêm `words.def_vi` + điền dữ liệu.

### 7/10/2026 — iOS ĐÃ UPLOAD 1.0.0 (build 2) lên App Store Connect

Archive Release từ `feat/ios-feature-parity` (các tính năng mang từ web sang + giao diện mới + 8 lỗi review đã sửa). 84/84 test, không có code chế độ xem trước trong bản Release, có Sign in with Apple + App Group + widget. PR #2/#3/#4 đã merge + deploy production cùng ngày (kiểm: quiz 200, cache TTS ra `r2`, /api/classes 200). Google login đã chạy trên app (chủ dự án cấu hình Supabase).
**Lần upload sau phải tăng `CURRENT_PROJECT_VERSION` lên 3.**

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

### 6/10/2026 — iOS ĐÃ UPLOAD LÊN APP STORE CONNECT: 1.0.0 (build 1)

Team `929P8F77XX`, bundle `com.thientran.wordly`, App Group `group.com.thientran.wordly` (Xcode tự tạo cert Distribution + profile qua `-allowProvisioningUpdates`). Archive + export từ `main` (`ffc54f8`).
**Lần upload sau PHẢI tăng `CURRENT_PROJECT_VERSION` trong `mobile/ios/project.yml`** (build 1 đã dùng; số build không được giảm/trùng).
Tài khoản test cho TestFlight/Apple review: `huythien7122+wordlytest@gmail.com` (production).

### 6/10/2026 — ĐÃ DEPLOY PRODUCTION: monorepo + app iOS dùng được API (PR #1, merge `ffc54f8`)

Vercel Root Directory = `web` (chủ dự án đổi). Kiểm trên production bằng tài khoản test `huythien7122+wordlytest@gmail.com`: Bearer 200 trên profile/streak/journal (ghi+đọc)/lịch sử/phiên luyện nói/dịch/practice; không token + token xấu → 401; `/`, `/login`, `/speak` 200. Sửa thêm trong lúc kiểm: middleware sập (500) với JWT thiếu `exp`; luồng chat Alex bị cụt rồi treo 60s. Google Cloud billing cho TTS đã bật (trước đó TTS lỗi trên cả web lẫn app).

**Chưa kiểm:** đăng nhập web bằng trình duyệt thật (luồng cookie).
**Đề xuất (chờ quyết):** Gemini 2.5 Flash tiêu ~90/150 token cho "thinking" ở chat Alex → thêm `reasoning_effort: "none"` (đo: tổng ~60 token, không cắt câu).

### 6/10/2026 — Cache audio TTS lên R2 (branch `feat/tts-r2-cache`)

Cache cũ chỉ là `Map` trong RAM → gần như luôn trống trên Vercel, mỗi lần đọc là một lần Google tính phí. Giờ: RAM → R2 (`tts/v1/<giọng>/<sha256>.mp3`, bucket video sẵn có) → Google. R2 lỗi thì vẫn gọi Google (không làm hỏng phát âm). Header `X-TTS-Cache` cho biết nguồn.

| Kiểm chứng | Kết quả |
|---|---|
| Test `tts-cache` (11) / toàn bộ | 11/11 · 285/285, build + lint sạch |
| Dev server với R2 + Google thật | lần 1 `google` → lần 2 `memory` (9ms) → restart `r2` (không gọi Google) |
| Hạn mức gọi Google (chỉ tính cache miss): 30/phút + 300/ngày mỗi người | 36 request song song cùng phút → đúng 30 qua, 6 bị 429 (`Retry-After`); phát lại từ đã cache khi đang bị chặn vẫn 200 |

Chặn chi phí TTS gồm: quota Google "Requests per minute" (chủ dự án đã hạ) + hạn mức trong app ở trên + cache R2. Không dùng tự tắt billing.

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
